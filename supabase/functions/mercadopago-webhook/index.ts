import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enqueueMlSyncEvent } from "../_shared/mercadolibre.ts";

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
        if (order?.status !== 'paid') {
          console.log(`[MP Webhook] Marking Order ${orderId} as PAID`);
          
          // Update Order
          await supabaseAdmin
            .from("orders")
            .update({ 
              status: "paid", 
              payment_status: "approved",
              payment_id: paymentId.toString(),
              payment_processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("id", orderId);

          // Inventory Management
          const { data: orderItems } = await supabaseAdmin.from("order_items").select("*").eq("order_id", orderId);
          if (orderItems) {
            for (const item of orderItems) {
              if (item.variant_id) {
                const { error: invErr } = await supabaseAdmin.rpc("decrement_inventory", { 
                  p_variant_id: item.variant_id, 
                  p_quantity: item.quantity 
                });
                if (invErr) {
                  console.error("Inventory error:", invErr);
                } else {
                  // Enqueue ML stock sync event
                  await enqueueMlSyncEvent(supabaseAdmin, item.variant_id);
                }
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

          // Trigger DAC Creation
          try {
            const { data: orderCheck } = await supabaseAdmin
              .from('orders')
              .select('shipping_method')
              .eq('id', orderId)
              .single();

            if (orderCheck && (orderCheck.shipping_method === "dac_home" || orderCheck.shipping_method === "dac_agency")) {
              console.log(`[MP Webhook] Triggering DAC shipment creation for order ${orderId}`);
              await fetch(`${supabaseUrl}/functions/v1/dac-create-shipment`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseServiceKey}`
                },
                body: JSON.stringify({ order_id: orderId })
              }).catch((err: any) => console.error("Error triggering DAC create shipment from MP Webhook:", err));
            }
          } catch (err: any) {
            console.error("Error checking DAC shipping method in MP Webhook:", err);
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
        }
      } 
      // CANCELLED or REJECTED STATUS
      else if (paymentData.status === "cancelled" || paymentData.status === "rejected") {
        await supabaseAdmin
          .from("orders")
          .update({
            status: "cancelled",
            payment_status: paymentData.status === "rejected" ? "rejected" : "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);
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
