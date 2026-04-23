import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log("📥 MercadoPago Webhook:", body.action, body.type, body.data?.id);

    // Only handle payment notifications
    if (body.type === "payment" && (body.action === "payment.created" || body.action === "payment.updated")) {
      const paymentId = body.data.id;
      
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      // Fetch the token from site_settings
      const { data: settings } = await supabaseAdmin.from('site_settings').select('key, value');
      const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));
      
      let mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || config.payments_mercadopago_access_token;
      
      if (!mpAccessToken) throw new Error("Mercado Pago Access Token no configurado.");

      // Verify payment status with MP
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
          headers: { ...corsHeaders, "Content-Type": "application/json" }
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
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (order?.status !== 'paid') {
          console.log(`[MP Webhook] Marking Order ${orderId} as PAID`);
          
          // Update Order
          await supabaseAdmin
            .from("orders")
            .update({ 
              status: "paid", 
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
                await supabaseAdmin.rpc("decrement_inventory", { 
                  p_variant_id: item.variant_id, 
                  p_quantity: item.quantity 
                }).catch((err: any) => console.error("Inventory error:", err));
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
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", orderId);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Webhook Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, // Return 200 so MP doesn't keep retrying on permanent errors
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
