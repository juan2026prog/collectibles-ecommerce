// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
// @ts-ignore
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

declare const Deno: any;

serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { orderId, reason } = await req.json();
    if (!orderId) throw new Error("Falta el ID de la orden");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Obtener la orden
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*, customer:profiles(email), order_items(*)")
      .eq("id", orderId)
      .single();

    if (error || !order) throw new Error("Orden no encontrada");
    if (order.status === "cancelada") throw new Error("La orden ya está cancelada");

    // Fetch site settings to get MP token
    const { data: settings } = await supabaseAdmin.from('site_settings').select('key, value');
    const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));
      
    let mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || config.payments_mercadopago_access_token;

    let refundSuccess = false;

    // Refund logic for Mercado Pago
    if (order.payment_id && !order.payment_id.startsWith('MP-MOCK') && mpAccessToken && !mpAccessToken.includes("mock") && order.status === "paid") {
       try {
          const resp = await fetch(`https://api.mercadopago.com/v1/payments/${order.payment_id}/refunds`, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${mpAccessToken}`,
                  'Content-Type': 'application/json'
              }
          });
          const mpData = await resp.json();
          if (!resp.ok) {
              console.error("Error Mercado Pago Refund:", mpData);
              throw new Error("No se pudo reembolsar en Mercado Pago. Puede que el pago resulte irrecuperable o ya esté devuelto.");
          }
          refundSuccess = true;
       } catch (e: any) {
           throw new Error(e.message);
       }
    } else {
       // If no real payment ID or it's a mock payment
       console.log("Mock payment or no payment ID, skipping real refund. Marking as cancelled.");
       refundSuccess = true;
    }

    // Restore Inventory
    if (order.order_items && order.order_items.length > 0) {
        for (const item of order.order_items) {
           const variantId = item.variant_id;
           if (variantId) {
                // Return stock back. Requires a custom RPC. If we don't have it, we could just do an update query if it wasn't RLS protected. We will use a safe update here.
               const { data: variant } = await supabaseAdmin.from('product_variants').select('stock').eq('id', variantId).single();
               if (variant) {
                   await supabaseAdmin.from('product_variants').update({ stock: (variant.stock || 0) + item.quantity }).eq('id', variantId);
               }
           } else if (item.product_id) {
               // Base product stock
               const { data: product } = await supabaseAdmin.from('products').select('stock').eq('id', item.product_id).single();
               if(product) {
                    await supabaseAdmin.from('products').update({ stock: (product.stock || 0) + item.quantity }).eq('id', item.product_id);
               }
           }
        }
    }

    // Update Order Status to Cancelled
    await supabaseAdmin.from("orders").update({ 
        status: "cancelada",
        delivery_notes: order.delivery_notes ? `${order.delivery_notes}\nCancelada: ${reason}` : `Cancelada: ${reason}` 
    }).eq("id", orderId);

    // Send the cancellation email/whatsapp through the transactional emails endpoint
    const internalUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/transactional-emails";
    await fetch(internalUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
            type: 'custom_order_cancelled',
            order: order,
            reason: reason || "Cancelada por el administrador"
        })
    }).catch(e => console.error("Error enviando email de cancelacion:", e));


    return new Response(JSON.stringify({ success: true, refundSuccess }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
