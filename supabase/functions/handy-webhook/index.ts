import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractHandyWebhookData } from "../_shared/handy.ts";
import { finalizeOrderIfNeeded } from "../_shared/order-payments.ts";

const responseHeaders = {
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: responseHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.text();
    let payload: Record<string, any>;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = { raw: rawBody };
    }

    const webhookData = extractHandyWebhookData(payload);
    if (!webhookData.transactionExternalId) {
      console.warn("[Handy Webhook] Missing TransactionExternalId", payload);
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, order_id, status, transaction_external_id")
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
      await supabaseAdmin
        .from("orders")
        .update({
          status: "cancelada",
          payment_status: "refunded",
          updated_at: nowStr,
        })
        .eq("id", payment.order_id);

      await supabaseAdmin
        .from("order_suborders")
        .update({
          status: "refunded",
          liquidation_status: "cancelled",
          updated_at: nowStr,
        })
        .eq("parent_order_id", payment.order_id)
        .neq("liquidation_status", "paid");

      // Register refund in refunds if not exists
      const { data: existingRefund } = await supabaseAdmin
        .from("refunds")
        .select("id")
        .eq("order_id", payment.order_id)
        .eq("status", "completed")
        .maybeSingle();

      if (!existingRefund) {
        await supabaseAdmin.from("refunds").insert({
          order_id: payment.order_id,
          payment_id: payment.id,
          provider: "handy",
          amount: payment.amount || 0,
          reason: "Reembolso notificado por webhook de Handy",
          status: "completed",
          processed_at: nowStr,
          api_response: payload
        });
      }
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
