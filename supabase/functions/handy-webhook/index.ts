import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractHandyWebhookData, getFirstValue } from "../_shared/handy.ts";
import { finalizeOrderIfNeeded } from "../_shared/order-payments.ts";

const responseHeaders = {
  "Content-Type": "application/json",
};

/** Handy v2 uses a separate Success boolean for refund notifications.
 * Never feed these callbacks through purchase-status mapping. */
async function handleHandyRefundNotice(payload: Record<string, any>, supabaseAdmin: any, supabaseUrl: string, serviceKey: string) {
  const transactionId = String(payload.TransactionExternalId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(transactionId)) {
    return new Response(JSON.stringify({ error: "Invalid transaction ID" }), { status: 422, headers: responseHeaders });
  }
  const { data: payment, error: paymentError } = await supabaseAdmin.from('payments')
    .select('id,order_id,provider,status,amount,currency,transaction_external_id')
    .eq('provider','handy').eq('transaction_external_id',transactionId).maybeSingle();
  if (paymentError || !payment) {
    // Unknown events must never mutate orders. Let Handy retry while we investigate.
    return new Response(JSON.stringify({ error: "Unknown Handy payment" }), { status: 404, headers: responseHeaders });
  }
  const { data: refunds, error: refundsError } = await supabaseAdmin.from('refunds')
    .select('id,order_id,payment_id,provider,amount,idempotency_key,status,api_response')
    .eq('order_id',payment.order_id).eq('provider','handy')
    .in('status',['processing','reconciliation_required','completed']).order('created_at',{ascending:false}).limit(5);
  if (refundsError) throw refundsError;
  const existing = (refunds || []).find((r: any) => r.payment_id === payment.id &&
    r.api_response?.handy_refund_requested === true &&
    r.api_response?.transaction_external_id === transactionId &&
    Math.abs(Number(r.amount) - Number(payment.amount)) < 0.01);
  if (!existing) return new Response(JSON.stringify({ error: "No authorized Handy refund request" }), {
    status: 409, headers: responseHeaders,
  });
  if (existing.status === 'completed') {
    return new Response(JSON.stringify({ received: true, already_processed: true }), { status: 200, headers: responseHeaders });
  }

  const isSuccessful = payload.Success === true;
  if (!isSuccessful) {
    // Do not automatically retry one-shot DELETE; late callbacks and ambiguous failures require reconciliation.
    const { error } = await supabaseAdmin.from('refunds').update({
      status: 'reconciliation_required',
      api_response: {
        ...existing.api_response, handy_refund_requested: true,
        handy_webhook_success: false,
        reconciliation_note: String(payload.Message || 'Handy refund rejected').slice(0,500),
        last_callback_at: new Date().toISOString(),
      },
    }).eq('id',existing.id).in('status',['processing','reconciliation_required']);
    if (error) throw error;
    await supabaseAdmin.from('payment_audit_logs').insert({
      action: 'handy_refund_failed_callback',order_id: payment.order_id,
      payment_id: payment.id,refund_id:existing.id,provider:'handy',amount:Number(payment.amount),
      api_response: { message: String(payload.Message || '').slice(0,500) },
    });
    return new Response(JSON.stringify({ received: true, reconciliation_required: true }), {
      status: 200, headers: responseHeaders,
    });
  }

  if (!existing.idempotency_key || payment.status !== 'approved' || payment.currency !== 'UYU') {
    return new Response(JSON.stringify({ error: "Handy settlement requires reconciliation" }), { status: 409, headers: responseHeaders });
  }
  // Reuse the already tested refund-order bookkeeping and marketplace liquidation handling.
  // No new DELETE is issued: an authenticated internal service-role settlement skips the provider call.
  const settlement = await fetch(`${supabaseUrl}/functions/v1/refund-order`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type':'application/json' },
    body: JSON.stringify({
      orderId:payment.order_id,
      handyRefundId:existing.id,
      handyWebhookSettlement:true,
      idempotencyKey:existing.idempotency_key,
      amount:Number(payment.amount),
      reason:'Devolución Handy confirmada por webhook',
      operationType:existing.api_response?.operation_type || 'monetary_compensation',
      bypassLiquidationCheck: existing.api_response?.bypass_liquidation_check === true,
      restoreStock:false,
    }),
  });
  const result = await settlement.json().catch(() => null);
  if (!settlement.ok || result?.refundSuccess !== true) {
    // ACK with 503 (not 200) so we do not claim completion. Safe to reconcile/retry the settlement,
    // but NEVER automatically send another DELETE to Handy.
    console.error('[Handy] Verified refund callback could not settle locally', payment.order_id);
    return new Response(JSON.stringify({ error:'Refund settlement pending reconciliation' }), { status:503, headers:responseHeaders });
  }
  return new Response(JSON.stringify({ received:true,refund_completed:true }), { status:200, headers:responseHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: responseHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: responseHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Webhook signature/secret verification
    const handySecret = (Deno.env.get("HANDY_WEBHOOK_SECRET") || "").trim();
    if (handySecret.length >= 24) {
      const authHeader = req.headers.get("x-handy-secret") || req.headers.get("x-handy-signature") || req.headers.get("merchant-secret-key") || "";
      const urlObj = new URL(req.url);
      const querySecret = urlObj.searchParams.get("secret") || urlObj.searchParams.get("token") || "";
      if (authHeader !== handySecret && querySecret !== handySecret) {
        console.warn("[Handy Webhook] Unauthorized webhook invocation rejected.");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: responseHeaders,
        });
      }
    } else {
      console.error("🚨 [Handy Webhook] CRITICAL SECURITY GATE: HANDY_WEBHOOK_SECRET is not configured securely.");
      return new Response(JSON.stringify({ error: "Handy webhook authentication not configured" }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    const rawBody = await req.text();
    let payload: Record<string, any>;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = { raw: rawBody };
    }

    // Handy sends { Success: boolean, TransactionExternalId: UUID } when a
    // reversal succeeds/fails. It has no PurchaseData.Status field.
    if (typeof payload.Success === 'boolean' && payload.TransactionExternalId) {
      try {
        return await handleHandyRefundNotice(payload, supabaseAdmin, supabaseUrl, supabaseServiceKey);
      } catch (error) {
        // Acknowledge only after durable reconciliation. On DB/settlement failure
        // return retryable error instead of falsely replying "received: true".
        console.error("[Handy] Refund callback could not be reconciled", error instanceof Error ? error.message : "unknown");
        return new Response(JSON.stringify({ error: "Refund callback reconciliation unavailable" }), {
          status: 503, headers: responseHeaders,
        });
      }
    }

    const webhookData = extractHandyWebhookData(payload);
    if (webhookData.mappedStatus === "unknown") {
      console.warn("[Handy Webhook] Unknown payment status. Not applying any financial changes.");
      return new Response(JSON.stringify({ error: "Unknown payment status" }), { status: 422, headers: responseHeaders });
    }
    if (!webhookData.transactionExternalId) {
      console.warn("[Handy Webhook] Missing TransactionExternalId", payload);
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, order_id, status, amount, currency, transaction_external_id")
      .eq("provider", "handy")
      .eq("transaction_external_id", webhookData.transactionExternalId)
      .single();

    if (paymentError || !payment) {
      console.warn("[Handy Webhook] Payment not found", webhookData.transactionExternalId);
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    // An approved payment must not be downgraded by a late/out-of-order event.
    if (payment.status === "approved" && webhookData.mappedStatus !== "refunded") {
      console.log(`[Handy Webhook] Payment ${payment.id} already approved. Skipping redundant finalization.`);
      return new Response(JSON.stringify({ received: true, already_processed: true }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    // STRICT FINANCIAL INTEGRITY VALIDATION: Verify Amount and Currency against order
    if (webhookData.mappedStatus === "approved") {
      const { data: orderRecord } = await supabaseAdmin
        .from("orders")
        .select("total_amount, currency, status, payment_processed_at")
        .eq("id", payment.order_id)
        .single();

      if (!orderRecord) {
        console.error(`🚨 [Handy Webhook] Order ${payment.order_id} not found in database.`);
        return new Response(JSON.stringify({ received: true, error: "Order not found" }), {
          status: 200,
          headers: responseHeaders,
        });
      }

      // Official Handy v2 callbacks include PurchaseData.TotalAmount and Currency.
      // Never synthesize missing values from the order itself.
      const rawAmount = getFirstValue(payload, ["PurchaseData.TotalAmount", "purchaseData.totalAmount", "TotalAmount", "totalAmount"]);
      const rawCurrency = getFirstValue(payload, ["PurchaseData.Currency", "purchaseData.currency", "Currency", "currency"]);
      const receivedAmount = Number(rawAmount);
      const receivedCurrency = Number(rawCurrency);
      const orderAmount = Number(orderRecord.total_amount);
      const expectedCurrency = String(orderRecord.currency || "").toUpperCase();
      const expectedHandyCurrencyCode = expectedCurrency === "UYU" ? 858 : NaN;

      if (rawAmount === undefined || rawCurrency === undefined ||
          !Number.isFinite(receivedAmount) || receivedAmount <= 0 ||
          !Number.isFinite(receivedCurrency) || receivedCurrency !== expectedHandyCurrencyCode ||
          !Number.isFinite(orderAmount) || Math.abs(receivedAmount - orderAmount) > 0.01 ||
          Math.abs(receivedAmount - Number(payment.amount)) > 0.01 ||
          String(payment.currency || "").toUpperCase() !== expectedCurrency) {
        console.error("[Handy Webhook] Financial verification failed; keeping order unpaid.", payment.order_id);
        return new Response(JSON.stringify({ received: true, error: "Payment verification mismatch" }), {
          status: 200,
          headers: responseHeaders,
        });
      }
    }

    const paymentUpdate: Record<string, any> = {
      status: webhookData.mappedStatus,
      raw_webhook: payload,
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from("payments")
      .update(paymentUpdate)
      .eq("id", payment.id);

    const nowStr = new Date().toISOString();
    const providerEventId = webhookData.providerTransactionId || webhookData.transactionExternalId || `handy-wh-${Date.now()}`;

    // Update payment_attempts
    const { data: attempt } = await supabaseAdmin
      .from("payment_attempts")
      .select("id")
      .eq("order_id", payment.order_id)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attempt) {
      await supabaseAdmin
        .from("payment_attempts")
        .update({
          normalized_status: webhookData.mappedStatus,
          provider_status: webhookData.rawStatus || webhookData.mappedStatus,
          external_payment_id: webhookData.providerTransactionId || payment.transaction_external_id,
          approved_at: webhookData.mappedStatus === "approved" ? nowStr : undefined,
          rejected_at: (webhookData.mappedStatus === "rejected" || webhookData.mappedStatus === "failed") ? nowStr : undefined,
          cancelled_at: webhookData.mappedStatus === "cancelled" ? nowStr : undefined,
          expired_at: webhookData.mappedStatus === "expired" ? nowStr : undefined,
          updated_at: nowStr,
        })
        .eq("id", attempt.id);
    }

    // Insert payment_events (Append-Only)
    await supabaseAdmin.from("payment_events").insert({
      order_id: payment.order_id,
      payment_attempt_id: attempt?.id,
      provider: "handy",
      event_type: `webhook_${webhookData.mappedStatus}`,
      normalized_status: webhookData.mappedStatus,
      provider_status: webhookData.rawStatus || webhookData.mappedStatus,
      provider_event_id: providerEventId,
      source: "webhook",
      payload_sanitized: payload,
      processing_result: `Webhook de Handy procesado: ${webhookData.mappedStatus}`,
      occurred_at: nowStr,
    });

    if (webhookData.mappedStatus === "approved") {
      await finalizeOrderIfNeeded(
        supabaseAdmin,
        supabaseUrl,
        supabaseServiceKey,
        payment.order_id,
        webhookData.providerTransactionId || webhookData.transactionExternalId,
      );
    } else if (webhookData.mappedStatus === "refunded") {
      // A purchase-status string is NOT proof of reversal. Handy v2 uses
      // Success:true webhook, processed through handleHandyRefundNotice.
      console.warn("[Handy] Unverified refund status ignored; waiting for authenticated Success callback.");
    } else {
      let orderPaymentStatus = webhookData.mappedStatus;
      let orderStatus = "awaiting_payment";

      if (webhookData.mappedStatus === "pending") {
        orderPaymentStatus = "pending";
        orderStatus = "awaiting_payment";
      } else if (webhookData.mappedStatus === "cancelled") {
        orderPaymentStatus = "cancelled";
        orderStatus = "cancelled";
      } else if (webhookData.mappedStatus === "rejected" || webhookData.mappedStatus === "failed") {
        orderPaymentStatus = "rejected";
        orderStatus = "awaiting_payment"; // allow retry
      }

      await supabaseAdmin
        .from("orders")
        .update({
          status: orderStatus,
          payment_status: orderPaymentStatus,
          updated_at: nowStr,
        })
        .eq("id", payment.order_id);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("handy-webhook error:", error);
    return new Response(JSON.stringify({ received: true, error: "Internal webhook error" }), {
      status: 200,
      headers: responseHeaders,
    });
  }
});
