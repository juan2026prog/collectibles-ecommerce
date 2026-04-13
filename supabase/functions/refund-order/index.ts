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

    // Obtener la orden (sin join a profiles para evitar errores si customer_id es null)
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      console.error("Error fetching order:", error);
      throw new Error("Orden no encontrada");
    }
    if (order.status === "cancelada") throw new Error("La orden ya está cancelada");

    // Fetch order items separately
    const { data: orderItems } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    // Fetch customer email if customer_id exists
    let customerEmail = order.customer_email;
    let customerPhone = order.customer_phone;
    if (order.customer_id && !customerEmail) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", order.customer_id)
        .single();
      if (profile) customerEmail = profile.email;
    }

    // Fetch site settings to get MP token
    const { data: settings } = await supabaseAdmin.from('site_settings').select('key, value');
    const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));
      
    let mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || config.payments_mercadopago_access_token;

    let refundSuccess = false;

    // Refund logic for Mercado Pago - ONLY if order is paid
    if (order.status === "paid" && order.payment_id && !order.payment_id.startsWith('MP-MOCK') && mpAccessToken && !mpAccessToken.includes("mock")) {
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
              // Don't throw - still cancel the order even if refund fails
              console.log("Refund failed but continuing with cancellation");
          } else {
              refundSuccess = true;
          }
       } catch (e: any) {
          console.error("MP refund error:", e.message);
          // Don't throw - still cancel the order
       }
    } else if (order.status === "pending") {
       // Pending orders don't need refund
       console.log("Order is pending, no refund needed. Cancelling directly.");
       refundSuccess = true; // Mark as success since no refund is needed
    } else {
       // Mock payment or other status
       console.log("Mock payment or non-paid status, skipping refund. Marking as cancelled.");
       refundSuccess = true;
    }

    // Restore Inventory (wrapped in try/catch so it doesn't crash the cancellation)
    try {
      if (orderItems && orderItems.length > 0) {
        for (const item of orderItems) {
          if (item.variant_id) {
            // product_variants uses inventory_count column
            const { data: variant } = await supabaseAdmin
              .from('product_variants')
              .select('inventory_count')
              .eq('id', item.variant_id)
              .single();
            if (variant) {
              await supabaseAdmin
                .from('product_variants')
                .update({ inventory_count: (variant.inventory_count || 0) + item.quantity })
                .eq('id', item.variant_id);
            }
          }
          // If product_id exists on the item, we could restore product-level stock too
          // but products table doesn't have a stock column in the schema
        }
      }
    } catch (stockErr: any) {
      console.error("Error restoring inventory (non-fatal):", stockErr.message);
      // Don't block the cancellation if stock restore fails
    }

    // Update Order Status to Cancelled
    await supabaseAdmin.from("orders").update({ 
        status: "cancelada",
        delivery_notes: order.delivery_notes ? `${order.delivery_notes}\nCancelada: ${reason}` : `Cancelada: ${reason}` 
    }).eq("id", orderId);

    // Send the cancellation email/whatsapp through the transactional emails endpoint
    if (customerEmail) {
      const internalUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/transactional-emails";
      await fetch(internalUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
              type: 'custom_order_cancelled',
              order: { ...order, customer_email: customerEmail, customer_phone: customerPhone },
              reason: reason || "Cancelada por el administrador"
          })
      }).catch(e => console.error("Error enviando email de cancelacion:", e));
    }

    return new Response(JSON.stringify({ success: true, refundSuccess }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("refund-order error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
