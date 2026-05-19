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

    if (webhookData.mappedStatus === "approved") {
      await finalizeOrderIfNeeded(
        supabaseAdmin,
        supabaseUrl,
        supabaseServiceKey,
        payment.order_id,
        webhookData.providerTransactionId || webhookData.transactionExternalId,
      );
    } else {
      const orderPaymentStatus = webhookData.mappedStatus === "pending" ? "pending_payment" : webhookData.mappedStatus;
      const orderStatus = webhookData.mappedStatus === "cancelled" ? "cancelled" : "pending";

      await supabaseAdmin
        .from("orders")
        .update({
          status: orderStatus,
          payment_status: orderPaymentStatus,
          updated_at: new Date().toISOString(),
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
