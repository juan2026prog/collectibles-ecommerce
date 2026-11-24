// supabase/functions/paypal-webhook/index.ts
// Asynchronous PayPal Webhook Processor (P2).
// - Fail-closed signature verification via PayPal /v1/notifications/verify-webhook-signature
// - Independent of browser return URL (handles tab-closed CHECKOUT.ORDER.APPROVED)
// - Authoritative server-side verification against PayPal API (never trusts raw webhook body alone)
// - Deduplication via paypal_webhook_events + atomic persistence via record_payment_transaction_atomic
// - Idempotent order finalization via finalizeOrderIfNeeded

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { finalizeOrderIfNeeded } from "../_shared/order-payments.ts";
import { verifyPayPalCaptureReconciliation } from "../_shared/paypal-fx.ts";
import { resolvePayPalRuntimeConfig } from "../_shared/paypal-config.ts";
import {
  parsePayPalWebhookEvent,
  evaluatePayPalWebhookTransition,
} from "../_shared/paypal-webhook-core.ts";
import { withEdgeTimeout } from "../_shared/resilience.ts";

async function getPayPalAccessToken(apiBase: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await withEdgeTimeout(
    (signal) =>
      fetch(`${apiBase}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal,
      }),
    10_000
  );
  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(`PAYPAL_OAUTH_FAILED (${res.status})`);
  }
  return data.access_token;
}

async function verifyPayPalWebhookSignature(params: {
  apiBase: string;
  accessToken: string;
  webhookId: string;
  req: Request;
  rawEvent: Record<string, any>;
}): Promise<boolean> {
  const { apiBase, accessToken, webhookId, req, rawEvent } = params;
  const authAlgo = req.headers.get("paypal-auth-algo");
  const certUrl = req.headers.get("paypal-cert-url");
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionSig = req.headers.get("paypal-transmission-sig");
  const transmissionTime = req.headers.get("paypal-transmission-time");

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  const verifyRes = await withEdgeTimeout(
    (signal) =>
      fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: rawEvent,
        }),
        signal,
      }),
    10_000
  );

  if (!verifyRes.ok) {
    throw new Error(`PAYPAL_VERIFY_API_ERROR (${verifyRes.status})`);
  }

  const verifyData = await verifyRes.json();
  return verifyData?.verification_status === "SUCCESS";
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Server configuration missing" }), { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const rawBody = await req.json();
    const parsed = parsePayPalWebhookEvent(rawBody);

    // Load settings (prefer Edge Function Secrets over site_settings)
    const { data: settingsRows } = await supabaseAdmin
      .from("site_settings")
      .select("key, value")
      .in("key", [
        "payments_paypal_sandbox",
        "payments_paypal_client_id",
        "payments_paypal_client_secret",
        "payments_paypal_secret_key",
        "payments_paypal_webhook_id",
        "payments_paypal_merchant_id",
      ]);

    const config = Object.fromEntries((settingsRows || []).map((r: any) => [r.key, r.value]));
    let ppConfig;
    try {
      ppConfig = resolvePayPalRuntimeConfig({
        supabaseUrl,
        env: Deno.env.toObject(),
        siteSettings: config,
        requireWebhookId: true,
      });
    } catch (cfgErr: any) {
      console.error("[paypal-webhook] PayPal config rejected:", cfgErr?.code || cfgErr?.message);
      return new Response(JSON.stringify({ error: cfgErr?.code || "PayPal webhook verification not configured" }), { status: 500 });
    }
    const { isSandbox, clientId, clientSecret, apiBase } = ppConfig;
    const webhookId = ppConfig.webhookId!;
    const expectedMerchantId = ppConfig.merchantId;

    const accessToken = await getPayPalAccessToken(apiBase, clientId, clientSecret);

    const isValidSig = await verifyPayPalWebhookSignature({
      apiBase,
      accessToken,
      webhookId,
      req,
      rawEvent: rawBody,
    });

    if (!isValidSig) {
      console.warn("[paypal-webhook] Rejected forged/invalid signature for event:", parsed.eventId);
      return new Response(JSON.stringify({ error: "Invalid PayPal webhook signature" }), { status: 401 });
    }

    // Deduplication gate via paypal_webhook_events
    const { data: existingEvt } = await supabaseAdmin
      .from("paypal_webhook_events")
      .select("id, processing_status")
      .eq("provider_event_id", parsed.eventId)
      .maybeSingle();

    if (existingEvt && ["processed", "ignored"].includes(existingEvt.processing_status)) {
      return new Response(JSON.stringify({ ok: true, deduplicated: true, event_id: parsed.eventId }), { status: 200 });
    }

    if (!existingEvt) {
      await supabaseAdmin.from("paypal_webhook_events").insert({
        provider_event_id: parsed.eventId,
        event_type: parsed.eventType,
        environment: isSandbox ? "sandbox" : "live",
        paypal_order_id: parsed.paypalOrderId,
        capture_id: parsed.captureId,
        order_reference: parsed.orderIdReference,
        processing_status: "received",
        raw_summary: {
          create_time: parsed.createTime,
          resource_type: parsed.resourceType,
          captured_amount: parsed.capturedAmount,
          captured_currency: parsed.capturedCurrency,
          merchant_id: parsed.merchantId,
        },
      });
    }

    // Resolve internal Collectibles order
    let order: any = null;
    if (parsed.orderIdReference) {
      const { data } = await supabaseAdmin
        .from("orders")
        .select("id, status, payment_status, payment_processed_at, total_amount, currency, payment_total, payment_currency, payment_id")
        .eq("id", parsed.orderIdReference)
        .maybeSingle();
      order = data;
    }
    if (!order && parsed.paypalOrderId) {
      const { data } = await supabaseAdmin
        .from("orders")
        .select("id, status, payment_status, payment_processed_at, total_amount, currency, payment_total, payment_currency, payment_id")
        .eq("payment_id", parsed.paypalOrderId)
        .maybeSingle();
      order = data;
    }

    const decision = evaluatePayPalWebhookTransition({
      event: parsed,
      order,
      expectedMerchantId,
    });

    const markEvent = async (status: string, reason?: string) => {
      await supabaseAdmin
        .from("paypal_webhook_events")
        .update({
          order_id: order?.id || null,
          processing_status: status,
          dead_letter_reason: status === "dead_letter" ? (reason || decision.reason) : null,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("provider_event_id", parsed.eventId);
    };

    if (
      decision.action === "IGNORE_UNSUPPORTED_EVENT" ||
      decision.action === "IGNORE_ALREADY_FINALIZED" ||
      decision.action === "IGNORE_OUT_OF_ORDER"
    ) {
      await markEvent("ignored", decision.reason);
      return new Response(JSON.stringify({ ok: true, action: decision.action, reason: decision.reason }), { status: 200 });
    }

    if (decision.action === "DEAD_LETTER") {
      await markEvent("dead_letter", decision.reason);
      return new Response(JSON.stringify({ ok: true, dead_letter: true, reason: decision.reason }), { status: 200 });
    }

    let authoritativeCaptureId = parsed.captureId || parsed.paypalOrderId || parsed.eventId;

    // Authoritative server-side PayPal API verification / capture
    if (decision.action === "CAPTURE_AND_FINALIZE") {
      if (!parsed.paypalOrderId) {
        await markEvent("dead_letter", "Missing paypalOrderId for CHECKOUT.ORDER.APPROVED capture");
        return new Response(JSON.stringify({ ok: true, dead_letter: true }), { status: 200 });
      }
      const captureRes = await fetch(`${apiBase}/v2/checkout/orders/${parsed.paypalOrderId}/capture`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });
      const captureData = await captureRes.json();
      if (!captureRes.ok || (captureData.status !== "COMPLETED" && captureData.status !== "APPROVED")) {
        throw new Error(`PAYPAL_ASYNC_CAPTURE_FAILED (${captureRes.status}): ${captureData?.message || captureData?.status}`);
      }
      verifyPayPalCaptureReconciliation({
        expectedPaymentCurrency: order.payment_currency,
        expectedPaymentTotal: order.payment_total,
        captureData,
      });
      authoritativeCaptureId =
        captureData?.purchase_units?.[0]?.payments?.captures?.[0]?.id ||
        captureData?.id ||
        authoritativeCaptureId;
    } else if (decision.action === "VERIFY_CAPTURE_AND_FINALIZE") {
      if (!parsed.captureId) {
        await markEvent("dead_letter", "Missing captureId for PAYMENT.CAPTURE.COMPLETED verification");
        return new Response(JSON.stringify({ ok: true, dead_letter: true }), { status: 200 });
      }
      const verifyCapRes = await fetch(`${apiBase}/v2/payments/captures/${parsed.captureId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      const verifyCapData = await verifyCapRes.json();
      if (!verifyCapRes.ok || verifyCapData.status !== "COMPLETED") {
        throw new Error(`PAYPAL_CAPTURE_NOT_COMPLETED (${verifyCapRes.status}): ${verifyCapData?.status}`);
      }
      verifyPayPalCaptureReconciliation({
        expectedPaymentCurrency: order.payment_currency,
        expectedPaymentTotal: order.payment_total,
        captureData: { purchase_units: [{ payments: { captures: [verifyCapData] } }] },
      });
    }

    // Atomic persistence via record_payment_transaction_atomic
    const { error: txErr } = await supabaseAdmin.rpc("record_payment_transaction_atomic", {
      p_order_id: order.id,
      p_provider: "paypal",
      p_external_payment_id: authoritativeCaptureId,
      p_provider_event_id: `paypal-wh-${parsed.eventId}`,
      p_provider_status: parsed.eventType.toLowerCase(),
      p_normalized_status: decision.effectiveNormalizedStatus,
      p_amount: parsed.capturedAmount ?? Number(order.payment_total || order.total_amount),
      p_currency: parsed.capturedCurrency || order.payment_currency || order.currency,
      p_raw_payload: {
        event_id: parsed.eventId,
        event_type: parsed.eventType,
        decision: decision.action,
        reason: decision.reason,
      },
    });

    if (txErr) {
      throw new Error(`PAYPAL_ATOMIC_TX_FAILED: ${txErr.message}`);
    }

    if (decision.action === "CAPTURE_AND_FINALIZE" || decision.action === "VERIFY_CAPTURE_AND_FINALIZE") {
      try {
        await finalizeOrderIfNeeded(
          supabaseAdmin,
          supabaseUrl,
          supabaseServiceKey,
          order.id,
          authoritativeCaptureId
        );
      } catch (finErr: any) {
        if (/STOCK_EXHAUSTED_ON_LATE_APPROVAL|STOCK_EXHAUSTED_ON_ORDER_CONFIRMATION/i.test(String(finErr?.message))) {
          await markEvent("dead_letter", finErr.message);
          return new Response(JSON.stringify({ ok: true, dead_letter: true, reason: finErr.message }), { status: 200 });
        }
        throw finErr;
      }
    }

    await markEvent(decision.shouldDeadLetter ? "dead_letter" : "processed", decision.reason);
    return new Response(JSON.stringify({ ok: true, action: decision.action, order_id: order.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[paypal-webhook] Processing error:", err?.message || err);
    return new Response(JSON.stringify({ error: "PayPal webhook processing failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
