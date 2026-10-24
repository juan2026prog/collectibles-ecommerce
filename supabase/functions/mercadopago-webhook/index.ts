import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/order-token.ts";
import { finalizeOrderIfNeeded } from "../_shared/order-payments.ts";

const responseHeaders = {
  'Content-Type': 'application/json',
};

/**
 * Verify MercadoPago webhook signature (x-signature header) using constant-time comparison.
 * Format: id:{data.id};request-id:{x-request-id};ts:{ts};
 * See: https://www.mercadopago.com.uy/developers/en/docs/your-integrations/notifications/webhooks#verify-origin
 */
async function verifyMPSignature(
  req: Request,
  body: any,
  webhookSecret: string
): Promise<{ isValid: boolean; reason?: string; timestamp?: number }> {
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  if (!xSignature || !xRequestId) {
    return { isValid: false, reason: "Missing x-signature or x-request-id header" };
  }

  // Parse the x-signature header: "ts=...,v1=..."
  const parts: Record<string, string> = {};
  xSignature.split(",").forEach((part) => {
    const [key, value] = part.trim().split("=", 2);
    if (key && value) parts[key] = value;
  });

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) {
    return { isValid: false, reason: "Malformed x-signature header" };
  }

  // Validate ts format (must be numeric timestamp)
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || tsNum <= 0) {
    return { isValid: false, reason: "Invalid timestamp in signature header" };
  }

  // Build the manifest string
  // Format: id:{data.id};request-id:{x-request-id};ts:{ts};
  const reqUrl = new URL(req.url);
  const dataId = body?.data?.id || body?.id || reqUrl.searchParams.get("data.id") || reqUrl.searchParams.get("id");
  if (!dataId) {
    return { isValid: false, reason: "Missing payment data.id for signature manifest" };
  }
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  // Generate HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(manifest));
  const hashHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  const isValid = timingSafeEqual(hashHex.toLowerCase(), v1.toLowerCase());
  return { isValid, reason: isValid ? undefined : "Signature mismatch", timestamp: tsNum };
}

Deno.serve(async (req: Request) => {
  // Webhooks are server-to-server — no CORS preflight needed
  if (req.method === 'OPTIONS') return new Response('ok', { status: 204 });

  let rawBody = "";
  let body: any = null;

  try {
    rawBody = await req.text();
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      console.error("[MP Webhook] Invalid JSON body");
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    console.log("📥 MercadoPago Webhook:", body.action, body.type, body.data?.id);

    // ══════════════════════════════════════════════════════════
    // SEC-HIGH-01: Signature verification
    // ══════════════════════════════════════════════════════════
    const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("🚨 [MP Webhook] CRITICAL SECURITY GATE: MERCADOPAGO_WEBHOOK_SECRET is not configured.");
      return new Response(JSON.stringify({ error: "Webhook secret not configured on server" }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    const { isValid, reason } = await verifyMPSignature(req, body, webhookSecret);
    if (!isValid) {
      console.error(`🚨 [MP Webhook] INVALID SIGNATURE: ${reason}`);
      return new Response(JSON.stringify({ error: "Invalid signature", reason }), {
        status: 401,
        headers: responseHeaders,
      });
    }
    console.log("✅ [MP Webhook] Signature verified successfully");

    let paymentId: string | null = null;
    let topic: string | null = null;

    // 1. Check JSON body formats
    if (body) {
      if (body.type === "payment" || body.topic === "payment") {
        topic = "payment";
        paymentId = body.data?.id || body.id || null;
      } else if (body.data?.id) {
        paymentId = body.data.id;
      } else if (body.id && body.action?.startsWith("payment")) {
        paymentId = body.id;
      }
    }

    // 2. Check URL query params format (IPN format from Mercado Pago)
    const reqUrl = new URL(req.url);
    if (!paymentId) {
      const qTopic = reqUrl.searchParams.get("topic") || reqUrl.searchParams.get("type");
      const qId = reqUrl.searchParams.get("id") || reqUrl.searchParams.get("data.id");
      if (qTopic === "payment" || qId) {
        topic = "payment";
        paymentId = qId;
      }
    }

    if (!paymentId) {
      console.log("[MP Webhook] Non-payment notification or missing ID. Body:", body, "URL:", req.url);
      return new Response(JSON.stringify({ received: true, info: "Ignored non-payment or ping event" }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the access token — prefer env var over site_settings
    let mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpAccessToken) {
      const { data: settings } = await supabaseAdmin.from('site_settings').select('key, value');
      const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));
      mpAccessToken = config.payments_mercadopago_access_token;
    }

    if (!mpAccessToken) {
      console.error("[MP Webhook] Mercado Pago Access Token not configured.");
      return new Response(JSON.stringify({ error: "Mercado Pago credentials not configured" }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    // Fetch payment from Mercado Pago API
    let mpResponse: Response;
    try {
      mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { "Authorization": `Bearer ${mpAccessToken}` },
      });
    } catch (networkErr: any) {
      console.error("[MP Webhook] Network error fetching payment from MP:", networkErr);
      return new Response(JSON.stringify({ error: "Failed to connect to Mercado Pago API" }), {
        status: 502,
        headers: responseHeaders,
      });
    }

    // Handle 404 / Non-existent payment without infinite retry loops
    if (mpResponse.status === 404) {
      console.warn(`[MP Webhook] Payment ${paymentId} not found in MP (404). Safely ignored to avoid retry storm.`);
      return new Response(JSON.stringify({ received: true, ignored: true, info: "Payment not found in MP" }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    // Handle MP upstream server errors with 500 so MP will retry legitimately
    if (mpResponse.status >= 500) {
      console.error(`[MP Webhook] MP upstream 5xx error: ${mpResponse.status}`);
      return new Response(JSON.stringify({ error: `MP upstream error (${mpResponse.status})` }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    const paymentData = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error(`[MP Webhook] Fetch failed from MP (${mpResponse.status}):`, paymentData);
      return new Response(JSON.stringify({ error: "Error fetching payment from MP" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    const orderId = paymentData.external_reference;
    console.log(`[MP Webhook] Payment ${paymentId}, Status: ${paymentData.status}, Order: ${orderId}`);

    if (!orderId) {
      console.warn(`[MP Webhook] Payment ${paymentId} has no external_reference (Order ID). Rejection required.`);
      return new Response(JSON.stringify({ received: true, ignored: true, error: "Missing external_reference" }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    const nowStr = new Date().toISOString();
    const mpStatus = String(paymentData.status || "");

    const { data: normStatus } = await supabaseAdmin.rpc("normalize_payment_status", {
      p_provider: "mercadopago",
      p_provider_status: mpStatus,
      p_status_detail: paymentData.status_detail || "",
    });
    const normalizedStatus = normStatus || mpStatus;

    // Check if order exists in DB
    const { data: order, error: orderFetchErr } = await supabaseAdmin
      .from('orders')
      .select('id, status, payment_status, payment_processed_at, total_amount, currency')
      .eq('id', orderId)
      .maybeSingle();

    if (orderFetchErr) {
      console.error(`[MP Webhook] DB error fetching order ${orderId}:`, orderFetchErr);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    if (!order) {
      console.error(`🚨 [MP Webhook] Order ${orderId} not found in database.`);
      return new Response(JSON.stringify({ received: true, error: "Order not found in database" }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    // ══════════════════════════════════════════════════════════
    // Traceability: Consistent Multi-table Persistence
    // Attempts to use record_payment_transaction_atomic RPC if available,
    // otherwise executes with robust sequential error checking.
    // ══════════════════════════════════════════════════════════
    const { data: atomicPersistResult, error: atomicPersistErr } = await supabaseAdmin.rpc("record_payment_transaction_atomic", {
      p_order_id: orderId,
      p_provider: "mercadopago",
      p_external_payment_id: paymentId.toString(),
      p_amount: Number(paymentData.transaction_amount || 0),
      p_currency: String(paymentData.currency_id || "UYU"),
      p_normalized_status: normalizedStatus,
      p_provider_status: mpStatus,
      p_provider_status_detail: paymentData.status_detail || "",
      p_raw_payload: paymentData,
      p_source: "webhook"
    });

    let currentAttemptId: string | null = atomicPersistResult?.attempt_id || null;

    if (atomicPersistErr) {
      console.warn("[MP Webhook] Atomic persistence RPC unavailable or failed. Executing fallback sequential persistence:", atomicPersistErr.message);

      // Fallback 1: Update or Insert payment_attempts
      const { data: existingAttempt } = await supabaseAdmin
        .from("payment_attempts")
        .select("id")
        .eq("order_id", orderId)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingAttempt) {
        currentAttemptId = existingAttempt.id;
        const { error: updErr } = await supabaseAdmin
          .from("payment_attempts")
          .update({
            normalized_status: normalizedStatus,
            provider_status: mpStatus,
            provider_status_detail: paymentData.status_detail || "",
            external_payment_id: paymentId.toString(),
            approved_at: (normalizedStatus === "approved") ? nowStr : undefined,
            rejected_at: (normalizedStatus === "rejected") ? nowStr : undefined,
            cancelled_at: (normalizedStatus === "cancelled") ? nowStr : undefined,
            error_code: paymentData.status_detail,
            updated_at: nowStr,
          })
          .eq("id", existingAttempt.id);
        if (updErr) console.error("[MP Webhook] payment_attempts update error:", updErr.message);
      } else {
        const { data: newAttempt, error: insErr } = await supabaseAdmin
          .from("payment_attempts")
          .insert({
            order_id: orderId,
            provider: "mercadopago",
            payment_method_type: "mercadopago",
            attempt_number: 1,
            amount: paymentData.transaction_amount || 0,
            currency: paymentData.currency_id || "UYU",
            normalized_status: normalizedStatus,
            provider_status: mpStatus,
            provider_status_detail: paymentData.status_detail || "",
            external_payment_id: paymentId.toString(),
            initiated_at: nowStr,
            approved_at: (normalizedStatus === "approved") ? nowStr : undefined,
          })
          .select("id")
          .single();
        if (newAttempt) currentAttemptId = newAttempt.id;
        if (insErr) console.error("[MP Webhook] payment_attempts insert error:", insErr.message);
      }

      // Fallback 2: Upsert payments table
      const { data: existingPayment } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("order_id", orderId)
        .eq("provider", "mercadopago")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPayment) {
        const { error: payUpdErr } = await supabaseAdmin
          .from("payments")
          .update({
            status: normalizedStatus,
            transaction_external_id: paymentId.toString(),
            raw_webhook: paymentData,
            updated_at: nowStr,
          })
          .eq("id", existingPayment.id);
        if (payUpdErr) console.error("[MP Webhook] payments update error:", payUpdErr.message);
      } else {
        const { error: payInsErr } = await supabaseAdmin
          .from("payments")
          .insert({
            order_id: orderId,
            provider: "mercadopago",
            transaction_external_id: paymentId.toString(),
            amount: paymentData.transaction_amount || 0,
            currency: paymentData.currency_id || "UYU",
            status: normalizedStatus,
            raw_webhook: paymentData,
          });
        if (payInsErr) console.error("[MP Webhook] payments insert error:", payInsErr.message);
      }

      // Fallback 3: Insert payment_events (Append-Only)
      const providerEventId = `mp-wh-${paymentId}-${body.action || Date.now()}`;
      const { error: evtErr } = await supabaseAdmin.from("payment_events").insert({
        order_id: orderId,
        payment_attempt_id: currentAttemptId,
        provider: "mercadopago",
        event_type: `webhook_${mpStatus}`,
        normalized_status: normalizedStatus,
        provider_status: mpStatus,
        provider_event_id: providerEventId,
        source: "webhook",
        payload_sanitized: { payment_id: paymentId, status: mpStatus, detail: paymentData.status_detail },
        processing_result: `Webhook Mercado Pago: ${normalizedStatus}`,
        occurred_at: nowStr,
      });
      if (evtErr) console.error("[MP Webhook] payment_events insert error:", evtErr.message);
    }

    // ══════════════════════════════════════════════════════════
    // Financial Execution: ONLY 'approved' status credits the order
    // 'authorized', 'in_process', 'pending' DO NOT credit the order
    // ══════════════════════════════════════════════════════════
    if (mpStatus === "approved") {
      // IDEMPOTENCY: Skip if already finalized
      if (order.payment_processed_at || ['paid', 'confirmed'].includes(order.status)) {
        console.log(`⚠️ [MP Webhook] Order ${orderId} already processed. Skipping duplicate finalization.`);
        return new Response(JSON.stringify({ received: true, skipped: true, info: "Order already finalized" }), {
          status: 200,
          headers: responseHeaders,
        });
      }

      // STRICT FINANCIAL INTEGRITY VALIDATION
      const paidAmount = Number(paymentData.transaction_amount || 0);
      const orderAmount = Number(order.total_amount || 0);
      const paidCurrency = String(paymentData.currency_id || "").toUpperCase();
      const expectedCurrency = String(order.currency || "UYU").toUpperCase();

      if (paidCurrency !== expectedCurrency) {
        console.error(`🚨 [MP Webhook] CURRENCY MISMATCH for order ${orderId}: expected ${expectedCurrency}, received ${paidCurrency}`);
        await supabaseAdmin.from("payment_events").insert({
          order_id: orderId,
          payment_attempt_id: currentAttemptId,
          provider: "mercadopago",
          event_type: "currency_mismatch_rejected",
          normalized_status: "fraud_suspected",
          provider_status: mpStatus,
          provider_event_id: `mismatch-curr-${paymentId}-${Date.now()}`,
          source: "webhook",
          payload_sanitized: { paidCurrency, expectedCurrency },
          processing_result: "Rechazado por discrepancia de moneda",
          occurred_at: nowStr,
        }).catch(() => {});
        return new Response(JSON.stringify({ received: true, error: "Currency mismatch rejected" }), {
          status: 200,
          headers: responseHeaders,
        });
      }

      // Strict amount check with zero tolerance: cents comparison
      const paidCents = Math.round(paidAmount * 100);
      const orderCents = Math.round(orderAmount * 100);
      if (paidCents !== orderCents) {
        console.error(`🚨 [MP Webhook] AMOUNT MISMATCH for order ${orderId}: expected ${orderAmount} (${orderCents}c), received ${paidAmount} (${paidCents}c)`);
        await supabaseAdmin.from("payment_events").insert({
          order_id: orderId,
          payment_attempt_id: currentAttemptId,
          provider: "mercadopago",
          event_type: "amount_mismatch_rejected",
          normalized_status: "fraud_suspected",
          provider_status: mpStatus,
          provider_event_id: `mismatch-amt-${paymentId}-${Date.now()}`,
          source: "webhook",
          payload_sanitized: { paidAmount, orderAmount, paidCents, orderCents },
          processing_result: "Rechazado por discrepancia en el importe cobrado",
          occurred_at: nowStr,
        }).catch(() => {});
        return new Response(JSON.stringify({ received: true, error: "Amount mismatch rejected" }), {
          status: 200,
          headers: responseHeaders,
        });
      }

      // Finalize order atomically and durably via finalizeOrderIfNeeded
      console.log(`[MP Webhook] Finalizing order ${orderId} with verified payment ${paymentId}`);
      await finalizeOrderIfNeeded(
        supabaseAdmin,
        supabaseUrl,
        supabaseServiceKey,
        orderId,
        paymentId.toString()
      );
    } else if (mpStatus === "authorized" || mpStatus === "in_process" || mpStatus === "pending") {
      // Pending / Authorized states: Update payment status only; do NOT finalize order nor decrement stock
      console.log(`[MP Webhook] Order ${orderId} payment in non-final state: ${mpStatus}`);
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "pending_payment",
          payment_provider: "mercadopago",
          last_payment_attempt_id: currentAttemptId,
          updated_at: nowStr,
        })
        .eq("id", orderId);
    } else if (mpStatus === "cancelled" || mpStatus === "rejected") {
      const orderStatus = mpStatus === "cancelled" ? "cancelled" : "awaiting_payment";
      const orderPaymentStatus = mpStatus === "cancelled" ? "cancelled" : "rejected";

      await supabaseAdmin
        .from("orders")
        .update({
          status: orderStatus,
          payment_status: orderPaymentStatus,
          last_payment_attempt_id: currentAttemptId,
          updated_at: nowStr,
        })
        .eq("id", orderId);
    } else if (mpStatus === "refunded") {
      const refundAmt = Number(paymentData.transaction_amount_refunded || paymentData.transaction_amount || 0);

      await supabaseAdmin
        .from("orders")
        .update({
          status: "cancelada",
          payment_status: "refunded",
          updated_at: nowStr,
        })
        .eq("id", orderId);

      await supabaseAdmin
        .from("order_suborders")
        .update({
          status: "refunded",
          liquidation_status: "cancelled",
          updated_at: nowStr,
        })
        .eq("parent_order_id", orderId)
        .neq("liquidation_status", "paid");

      const { data: dbPayment } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("order_id", orderId)
        .eq("provider", "mercadopago")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const paymentUuid = dbPayment?.id || null;
      if (paymentUuid) {
        await supabaseAdmin
          .from("payments")
          .update({
            status: "refunded",
            refund_amount: refundAmt,
            refund_date: nowStr,
            updated_at: nowStr,
          })
          .eq("id", paymentUuid);
      }

      const { data: existingRefund } = await supabaseAdmin
        .from("refunds")
        .select("id")
        .eq("order_id", orderId)
        .eq("status", "completed")
        .maybeSingle();

      if (!existingRefund) {
        await supabaseAdmin.from("refunds").insert({
          order_id: orderId,
          payment_id: paymentUuid,
          provider: "mercadopago",
          amount: refundAmt,
          reason: "Reembolso notificado por webhook de Mercado Pago",
          status: "completed",
          processed_at: nowStr,
          api_response: paymentData,
        });
      }
    } else if (mpStatus === "charged_back" || mpStatus === "in_mediation") {
      const isChargeback = mpStatus === "charged_back";
      const disputeAmt = Number(paymentData.transaction_amount || 0);

      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: isChargeback ? "charged_back" : "in_mediation",
          updated_at: nowStr,
        })
        .eq("id", orderId);

      if (!isChargeback) {
        await supabaseAdmin
          .from("order_suborders")
          .update({
            status: "claim_open",
            updated_at: nowStr,
          })
          .eq("parent_order_id", orderId);
      }

      const { data: dbPayment } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("order_id", orderId)
        .eq("provider", "mercadopago")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const paymentUuid = dbPayment?.id || null;
      if (paymentUuid) {
        await supabaseAdmin
          .from("payments")
          .update({
            status: isChargeback ? "failed" : "pending",
            updated_at: nowStr,
          })
          .eq("id", paymentUuid);
      }

      await supabaseAdmin.from("payment_disputes").insert({
        provider: "mercadopago",
        payment_id: paymentUuid,
        order_id: orderId,
        dispute_reason: isChargeback ? "charged_back" : "in_mediation",
        status: "open",
        amount: disputeAmt,
      });
    }

    return new Response(JSON.stringify({ received: true, success: true }), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("🚨 [MP Webhook] Unexpected runtime error:", error);
    // Transient / unexpected errors return 500 so Mercado Pago can retry legitimately
    return new Response(JSON.stringify({ error: "Internal processing error", message: error?.message }), {
      status: 500,
      headers: responseHeaders,
    });
  }
});
