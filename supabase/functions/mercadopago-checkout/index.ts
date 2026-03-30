import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { orderId } = await req.json();
    if (!orderId) throw new Error("Falta confirmar el ID de la orden");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Obtener la orden de la base de datos
    const { data: order, error } = await supabaseClient
      .from("orders")
      .select("*, order_items(*, products(*))")
      .eq("id", orderId)
      .single();

    if (error || !order) throw new Error("Orden no encontrada en la base de datos.");
    if (order.status !== "pending") throw new Error("La orden ya fue procesada o no está pendiente.");

    const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "TEST-mock";
    
    // Crear la preferencia de Mercado Pago
    const base_url = req.headers.get("origin") || "http://localhost:5173";
    const webhook_url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`;

    const items = order.order_items.map((item: any) => ({
      id: item.product_id,
      title: item.products?.title || "Producto",
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      currency_id: order.currency || "UYU",
    }));

    const preferencePayload = {
      items,
      payer: {
        email: order.customer_email || "test_user_123@testuser.com",
        name: order.shipping_address?.first_name || "Cliente",
        surname: order.shipping_address?.last_name || "Guest"
      },
      back_urls: {
        success: `${base_url}/checkout/success?order_id=${order.id}`,
        failure: `${base_url}/checkout?error=pagorechazado`,
        pending: `${base_url}/checkout/success?order_id=${order.id}&status=pending`
      },
      auto_return: "approved",
      external_reference: order.id,
      notification_url: webhook_url, // Escucha el Webhook!
      statement_descriptor: "MERCADOLIBRE STORE"
    };

    if (MP_ACCESS_TOKEN.includes("mock")) {
      // Entorno de simulación
      console.log("Generando Link Mock (Sin Token Real):", preferencePayload);
      const mockPaymentId = "MP-MOCK-" + Math.floor(Math.random() * 100000);
      await supabaseClient.from("orders").update({ payment_id: mockPaymentId }).eq("id", order.id);
      
      return new Response(JSON.stringify({ 
        redirect_url: `${base_url}/checkout/success?order_id=${order.id}`, 
        id: mockPaymentId,
        is_mock: true
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify(preferencePayload)
    });

    const mpData = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(mpData));

    // El init_point o sandbox_init_point es la URL a la que el usuario va para pagar
    const redirectUrl = MP_ACCESS_TOKEN.includes("TEST") ? mpData.sandbox_init_point : mpData.init_point;

    await supabaseClient
      .from("orders")
      .update({ payment_id: mpData.id })
      .eq("id", order.id);

    return new Response(JSON.stringify({ redirect_url: redirectUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
