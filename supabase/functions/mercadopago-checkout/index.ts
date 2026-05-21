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

    // Cargar costos de envío y descuentos desde shipping_address
    const shippingCost = Number(order.shipping_address?.shipping_cost || 0);
    const shippingMethod = order.shipping_address?.shipping_method || order.shipping_method;
    if (shippingCost > 0) {
      let title = "Envío a domicilio";
      if (shippingMethod === "dac_home" || shippingMethod === "dac") {
        title = "Envío DAC a domicilio";
      } else if (shippingMethod === "dac_agency") {
        title = "Retiro en agencia DAC";
      }
      items.push({
        id: "shipping",
        title: title,
        quantity: 1,
        unit_price: shippingCost,
        currency_id: order.currency || "UYU",
      });
    }

    const discountAmount = Number(order.shipping_address?.discount_amount || 0);
    if (discountAmount > 0) {
      items.push({
        id: "discount_coupon",
        title: "Descuento por Cupón",
        quantity: 1,
        unit_price: -discountAmount,
        currency_id: order.currency || "UYU",
      });
    }

    const bankDiscount = Number(order.shipping_address?.bank_discount || 0);
    if (bankDiscount > 0) {
      items.push({
        id: "discount_bank",
        title: "Descuento Bancario",
        quantity: 1,
        unit_price: -bankDiscount,
        currency_id: order.currency || "UYU",
      });
    }

    // Reconciliación exacta con order.total_amount
    const currentSum = items.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity), 0);
    const diff = Number((Number(order.total_amount) - currentSum).toFixed(2));
    if (Math.abs(diff) > 0.001) {
      const shippingItem = items.find((item: any) => item.id === "shipping");
      if (shippingItem) {
        shippingItem.unit_price = Number((shippingItem.unit_price + diff).toFixed(2));
      } else {
        items.push({
          id: "adjustment",
          title: "Ajuste por redondeo",
          quantity: 1,
          unit_price: diff,
          currency_id: order.currency || "UYU",
        });
      }
    }

    const preferencePayload = {
      items,
      payer: {
        email: order.customer_email || "test_user_123@testuser.com",
        name: order.shipping_address?.first_name || "Cliente",
        surname: order.shipping_address?.last_name || "Guest"
      },
      back_urls: {
        success: `${base_url}/checkout/success?order_id=${order.id}&provider=mercadopago`,
        failure: `${base_url}/checkout?error=pagorechazado`,
        pending: `${base_url}/checkout/success?order_id=${order.id}&provider=mercadopago&status=pending`
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
