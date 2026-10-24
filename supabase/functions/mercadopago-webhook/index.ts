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
    // FINANCIAL INTEGRITY GATE: Validate amount & currency BEFORE updating order status
    // ══════════════════════════════════════════════════════════
    const paidAmount = Number(paymentData.transaction_amount || 0);
    const orderAmount = Number(order.total_amount || 0);
    const paidCurrency = String(paymentData.currency_id || "").toUpperCase();
    const expectedCurrency = String(order.currency || "UYU").toUpperCase();

    const isCurrencyValid = paidCurrency === expectedCurrency;
    const paidCents = Math.round(paidAmount * 100);
    const orderCents = Math.round(orderAmount * 100);
    const isAmountValid = paidCents === orderCents;

    let effectiveNormalizedStatus = normalizedStatus;
    let isFraudOrMismatch = false;

    if (mpStatus === "approved" && (!isCurrencyValid || !isAmountValid)) {
      isFraudOrMismatch = true;
      // Map to status that complies with payments.status and payment_attempts.normalized_status CHECK constraints
      // while signaling that manual verification is required and preventing order accreditation
      effectiveNormalizedStatus = "manual_verification_required";
      console.error(`🚨 [MP Webhook] FINANCIAL MISMATCH on approved payment ${paymentId} for order ${orderId}: paid ${paidAmount} ${paidCurrency}, expected ${orderAmount} ${expectedCurrency}`);
    }

    // ══════════════════════════════════════════════════════════
    // Traceability: Consistent Multi-table Persistence
    // Stable provider_event_id: mp-wh-{paymentId}-{status} for true deduplication
    // ══════════════════════════════════════════════════════════
    const stableEventId = `mp-wh-${paymentId}-${mpStatus}`;

    const { data: atomicPersistResult, error: atomicPersistErr } = await supabaseAdmin.rpc("record_payment_transaction_atomic", {
      p_order_id: orderId,
      p_provider: "mercadopago",
      p_external_payment_id: paymentId.toString(),
      p_amount: paidAmount,
      p_currency: paidCurrency,
      p_normalized_status: effectiveNormalizedStatus,
      p_provider_status: mpStatus,
      p_provider_status_detail: paymentData.status_detail || "",
      p_raw_payload: paymentData,
      p_source: "webhook",
      p_provider_event_id: stableEventId,
    });

    let currentAttemptId: string | null = atomicPersistResult?.attempt_id || null;

    if (atomicPersistErr) {
      console.error("[MP Webhook] CRITICAL: record_payment_transaction_atomic failed:", atomicPersistErr.message);
      // Return 500 to trigger Mercado Pago legitimate webhook retry without silent data loss
      // Never proceed to finalize or credit an order when atomic transaction persistence fails!
      return new Response(JSON.stringify({ 
        error: "Database atomic persistence failed", 
        detail: atomicPersistErr.message,
        retryable: true 
      }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    // If financial mismatch occurred on approved payment, halt order confirmation
    if (isFraudOrMismatch) {
      return new Response(JSON.stringify({ received: true, error: "Financial integrity mismatch: payment recorded as manual_verification_required without crediting order" }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    // ══════════════════════════════════════════════════════════
    // Financial Execution: ONLY genuinely approved payments credit and finalize order
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
