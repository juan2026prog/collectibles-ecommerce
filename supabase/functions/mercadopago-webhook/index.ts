import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const url = new URL(req.url);
    const bodyText = await req.text();
    let body;
    
    try {
      body = JSON.parse(bodyText);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // MercadoPago webhooks can be "payment" or "merchant_order"
    // We only care about payments that are created or updated
    console.log("📥 MercadoPago Webhook:", body.action, body.type);

    if (body.type === "payment" && body.action === "payment.created") {
      const paymentId = body.data.id;
      const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

      if (!MP_ACCESS_TOKEN) throw new Error("No MP token set");

      // Verify payment with MP directly to prevent spoofing
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` }
      });
      const paymentData = await mpResponse.json();
      
      if (!mpResponse.ok) throw new Error("Payment fetch failed from MP");
      
      const orderId = paymentData.external_reference;
      if (!orderId) throw new Error("No external_reference (order ID) found in payment");

      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Si el pago está aprobado, actualizamos la base de datos
      if (paymentData.status === "approved" || paymentData.status === "authorized") {
        await supabaseClient
          .from("orders")
          .update({ 
            status: "paid", 
            payment_id: paymentId.toString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", orderId);

        // Descontar inventario (Llamar función interna o hacer query directa)
        const { data: orderItems } = await supabaseClient.from("order_items").select("*").eq("order_id", orderId);
        
        if (orderItems) {
           for (const item of orderItems) {
              if (item.variant_id) {
                 await supabaseClient.rpc("decrement_inventory", { 
                    p_variant_id: item.variant_id, 
                    p_quantity: item.quantity 
                 });
              }
           }
        }

        // Llamar a la función de cálculo de comisiones para Affiliates/Vendedores
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/calculate-commissions`, {
           method: "POST",
           headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` // Invoking internally as service role
           },
           body: JSON.stringify({ order_id: orderId })
        }).catch(err => console.error("Error triggering commissions:", err));
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Webhook Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
