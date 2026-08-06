import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enqueueMlSyncEvent } from "../_shared/mercadolibre.ts";
import { triggerZincVerificationIfNeeded } from "../_shared/order-payments.ts";

// SEC-HIGH-01: Webhooks do NOT need CORS headers — they are server-to-server calls.
// We include minimal headers only for the response format.
const responseHeaders = {
  'Content-Type': 'application/json',
};

/**
 * Verify MercadoPago webhook signature (x-signature header).
 * See: https://www.mercadopago.com.uy/developers/en/docs/your-integrations/notifications/webhooks#verify-origin
 */
async function verifyMPSignature(
  req: Request,
  body: any,
  webhookSecret: string
): Promise<boolean> {
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  if (!xSignature || !xRequestId) {
    console.warn("[MP Webhook] Missing x-signature or x-request-id headers");
    return false;
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
    console.warn("[MP Webhook] Malformed x-signature header");
    return false;
  }

  // Build the manifest string
  // Format: id:{data.id};request-id:{x-request-id};ts:{ts};
  const dataId = body?.data?.id;
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

  return hashHex === v1;
}

Deno.serve(async (req: Request) => {
  // Webhooks are server-to-server — no CORS preflight needed
  if (req.method === 'OPTIONS') return new Response('ok', { status: 204 });

  try {
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error("[MP Webhook] Invalid JSON body");
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: responseHeaders
      });
    }
    
    console.log("📥 MercadoPago Webhook:", body.action, body.type, body.data?.id);

    // ══════════════════════════════════════════════════════════
    // SEC-HIGH-01: Signature verification
    // If a webhook secret is configured, verify the signature.
    // If not configured, log a warning but still process 
    // (backwards compat + existing API verification provides partial protection)
    // ══════════════════════════════════════════════════════════
    const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    
    if (webhookSecret) {
      const isValid = await verifyMPSignature(req, body, webhookSecret);
      if (!isValid) {
        console.error("🚨 [MP Webhook] INVALID SIGNATURE — potential forgery attempt blocked");
        // Return 200 to prevent MP from retrying, but don't process
        return new Response(JSON.stringify({ received: true, error: "Invalid signature" }), {
          status: 200, headers: responseHeaders
        });
      }
      console.log("✅ [MP Webhook] Signature verified successfully");
    } else {
      console.warn("⚠️ [MP Webhook] No MERCADOPAGO_WEBHOOK_SECRET configured — signature verification skipped. Set this secret for production security.");
    }

    // Only handle payment notifications
    if (body.type === "payment" && (body.action === "payment.created" || body.action === "payment.updated")) {
      const paymentId = body.data.id;
      
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      // Fetch the token — prefer env var over site_settings
      let mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
      
      if (!mpAccessToken) {
        const { data: settings } = await supabaseAdmin.from('site_settings').select('key, value');
        const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));
        mpAccessToken = config.payments_mercadopago_access_token;
      }
      
      if (!mpAccessToken) throw new Error("Mercado Pago Access Token no configurado.");

      // Verify payment status with MP API (double-check regardless of signature)
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { "Authorization": `Bearer ${mpAccessToken}` }
      });
      const paymentData = await mpResponse.json();
      
      if (!mpResponse.ok) throw new Error(`Fetch failed from MP: ${JSON.stringify(paymentData)}`);
      
      const orderId = paymentData.external_reference;
      console.log(`[MP Webhook] Processed ${paymentId}, Status: ${paymentData.status}, Order: ${orderId}`);

      if (!orderId) {
        console.warn("[MP Webhook] No external_reference (Order ID) in MP payment");
        return new Response(JSON.stringify({ received: true, info: "No order id" }), {
          headers: responseHeaders
        });
      }

      const nowStr = new Date().toISOString();
      const mpStatus = paymentData.status;

      const { data: normStatus } = await supabaseAdmin.rpc("normalize_payment_status", {
        p_provider: "mercadopago",
        p_provider_status: mpStatus,
        p_status_detail: paymentData.status_detail || "",
      });
      const normalizedStatus = normStatus || mpStatus;

      // Update or insert payment_attempts
      const { data: existingAttempt } = await supabaseAdmin
        .from("payment_attempts")
        .select("id")
        .eq("order_id", orderId)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      let currentAttemptId = existingAttempt?.id;

      if (existingAttempt) {
        await supabaseAdmin
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
      } else {
        const { data: newAttempt } = await supabaseAdmin
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
          .select()
          .single();
        if (newAttempt) currentAttemptId = newAttempt.id;
      }

      // Insert payment_events (Append-Only)
      await supabaseAdmin.from("payment_events").insert({
        order_id: orderId,
        payment_attempt_id: currentAttemptId,
        provider: "mercadopago",
        event_type: `webhook_${mpStatus}`,
        normalized_status: normalizedStatus,
        provider_status: mpStatus,
        provider_event_id: `mp-wh-${paymentId}-${body.action || Date.now()}`,
        source: "webhook",
        payload_sanitized: { payment_id: paymentId, status: mpStatus, detail: paymentData.status_detail },
        processing_result: `Webhook Mercado Pago procesado: ${normalizedStatus}`,
        occurred_at: nowStr,
      });

      // Update order payment status
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: normalizedStatus,
          payment_provider: "mercadopago",
          last_payment_attempt_id: currentAttemptId,
          updated_at: nowStr,
        })
        .eq("id", orderId);

      // Check order current status + idempotency
      const { data: order } = await supabaseAdmin.from('orders').select('status, payment_processed_at').eq('id', orderId).single();
      
      // APPROVED STATUS
      if (paymentData.status === "approved" || paymentData.status === "authorized") {
        // IDEMPOTENCY: Skip if already processed
        if (order?.payment_processed_at) {
          console.log(`⚠️ Order ${orderId} already processed. Skipping duplicate MP webhook.`);
          return new Response(JSON.stringify({ received: true, skipped: true }), {
            headers: responseHeaders
          });
        }
        const totalPaymentFee = paymentData.fee_details 
          ? paymentData.fee_details.reduce((sum: number, fee: any) => sum + fee.amount, 0) 
          : (paymentData.transaction_amount - paymentData.transaction_details?.net_received_amount) || 0;

        if (order?.status === 'awaiting_payment' || order?.status === 'pending') {
          console.log(`[MP Webhook] Confirming payment for Order ${orderId}`);
          
          // Update Order and Reservation atomically
          const { error: confirmError } = await supabaseAdmin.rpc("confirm_payment_atomic", {
            p_order_id: orderId,
            p_payment_provider: "mercadopago",
            p_payment_ref: paymentId.toString(),
          });

          if (confirmError) {
            console.error("[MP Webhook] confirm_payment_atomic failed:", confirmError);
            throw new Error(confirmError.message || "No se pudo confirmar la orden.");
          }

          // Fetch updated order to get total amount
          const { data: updatedOrder, error: fetchErr } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

          if (fetchErr || !updatedOrder) {
            console.error("[MP Webhook] Failed to fetch updated order:", fetchErr);
            throw new Error("No se pudo recuperar la orden actualizada.");
          }

          // Update total_payment_fee
          await supabaseAdmin
            .from("orders")
            .update({ 
              total_payment_fee: totalPaymentFee,
              updated_at: new Date().toISOString()
            })
            .eq("id", orderId);

          const orderTotal = Number(updatedOrder.total_amount);

          // Fetch suborders and update them
          const { data: suborders } = await supabaseAdmin
            .from('order_suborders')
            .select('*')
            .eq('parent_order_id', orderId);

          if (suborders) {
            for (const sub of suborders) {
              const suborderTotal = Number(sub.product_subtotal) + Number(sub.shipping_cost) - Number(sub.discount_total);
              const feeShare = orderTotal > 0 ? (totalPaymentFee * suborderTotal / orderTotal) : 0;
              const vendorNetAmount = Number(sub.product_subtotal) + Number(sub.shipping_cost) - Number(sub.marketplace_fee) - feeShare;

              await supabaseAdmin
                .from('order_suborders')
                .update({
                  status: 'confirmed',
                  payment_fee_share: feeShare,
                  vendor_net_amount: vendorNetAmount,
                  updated_at: new Date().toISOString()
                })
                .eq('id', sub.id);
            }
          }

          // Inventory Management (Physical stock decremented in confirm_payment_atomic RPC, we only sync to ML here)
          const { data: orderItems } = await supabaseAdmin.from("order_items").select("*").eq("order_id", orderId);
          if (orderItems) {
            for (const item of orderItems) {
              if (item.variant_id) {
                // Enqueue ML stock sync event without blocking
                await enqueueMlSyncEvent(supabaseAdmin, item.variant_id).catch((e: any) => console.error("ML Sync error:", e));
              }
            }
          }

          // Trigger Commissions Calculation
          await fetch(`${supabaseUrl}/functions/v1/calculate-commissions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ order_id: orderId })
          }).catch((err: any) => console.error("Error triggering commissions:", err));

          // Trigger SoyDelivery Sync
          await fetch(`${supabaseUrl}/functions/v1/soydelivery-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ order_id: orderId })
          }).catch((err: any) => console.error("Error triggering soydelivery:", err));

          // Trigger DAC Creation per suborder
          if (suborders) {
            for (const sub of suborders) {
              if (sub.shipping_method === "dac_home" || sub.shipping_method === "dac_agency" || sub.shipping_method === "dac") {
                console.log(`[MP Webhook] Triggering DAC shipment creation for suborder ${sub.suborder_number} (${sub.id})`);
                await fetch(`${supabaseUrl}/functions/v1/dac-create-shipment`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseServiceKey}`
                  },
                  body: JSON.stringify({ order_id: sub.id }) // polymorphic: passes suborder ID
                }).catch((err: any) => console.error(`Error triggering DAC for suborder ${sub.id}:`, err));
              }
            }
          }

          // Trigger transactional email
          const { data: fullOrder } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

          if (fullOrder) {
            await fetch(`${supabaseUrl}/functions/v1/transactional-emails`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                type: 'UPDATE',
                table: 'orders',
                record: fullOrder,
                old_record: { ...fullOrder, status: 'pending' }
              })
            }).catch((err: any) => console.error('MP email error:', err));
          }

          // Trigger Zinc verification and automatic purchase for international items
          await triggerZincVerificationIfNeeded(
            supabaseAdmin,
            supabaseUrl,
            supabaseServiceKey,
            orderId
          );
        }
      } 
      // CANCELLED or REJECTED STATUS
      else if (paymentData.status === "cancelled" || paymentData.status === "rejected") {
        const orderStatus = paymentData.status === "cancelled" ? "cancelled" : "awaiting_payment";
        const orderPaymentStatus = paymentData.status === "cancelled" ? "cancelled" : "rejected";
        
        await supabaseAdmin
          .from("orders")
          .update({
            status: orderStatus,
            payment_status: orderPaymentStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);
      }
      // REFUNDED STATUS
      else if (paymentData.status === "refunded") {
        const refundAmt = Number(paymentData.transaction_amount_refunded || paymentData.transaction_amount || 0);
        
        await supabaseAdmin
          .from("orders")
          .update({
            status: "cancelada",
            payment_status: "refunded",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        await supabaseAdmin
          .from("order_suborders")
          .update({
            status: "refunded",
            liquidation_status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("parent_order_id", orderId)
          .neq("liquidation_status", "paid"); // Don't overwrite paid status

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
              refund_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentUuid);
        }

        // Insert into refunds table if not exists
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
            processed_at: new Date().toISOString(),
            api_response: paymentData
          });
        }
      }
      // CHARGEBACK / DISPUTE STATUS
      else if (paymentData.status === "charged_back" || paymentData.status === "in_mediation") {
        const isChargeback = paymentData.status === "charged_back";
        const refundAmt = Number(paymentData.transaction_amount || 0);

        await supabaseAdmin
          .from("orders")
          .update({
            payment_status: isChargeback ? "charged_back" : "in_mediation",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        if (!isChargeback) {
          // mediation: flag claim_open to block liquidations
          await supabaseAdmin
            .from("order_suborders")
            .update({
              status: "claim_open",
              updated_at: new Date().toISOString(),
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
              status: isChargeback ? "failed" : "pending", // mark as failed if chargeback
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentUuid);
        }

        // Create dispute record
        await supabaseAdmin.from("payment_disputes").insert({
          provider: "mercadopago",
          payment_id: paymentUuid,
          order_id: orderId,
          dispute_reason: isChargeback ? "charged_back" : "in_mediation",
          status: "open",
          amount: refundAmt
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: responseHeaders
    });
  } catch (error: any) {
    console.error("Webhook Error:", error);
    return new Response(JSON.stringify({ error: "Internal webhook error" }), {
      status: 200, // Return 200 so MP doesn't keep retrying on permanent errors
      headers: responseHeaders
    });
  }
});
