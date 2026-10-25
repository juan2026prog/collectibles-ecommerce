import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyOptionalAuth } from "../_shared/auth.ts";
import { getGuestTokenSecret, verifyOrderAccessToken } from "../_shared/order-token.ts";

declare const Deno: any;

serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const user = await verifyOptionalAuth(req);

    const body = await req.json().catch(() => ({}));
    const { orderId, order_token: orderToken } = body;
    if (!orderId) throw new Error("Falta confirmar el ID de la orden");

    // 1. Obtener la orden de la base de datos
    const { data: order, error } = await supabaseClient
      .from("orders")
      .select("*, order_items(*, products(*))")
      .eq("id", orderId)
      .single();

    if (error || !order) throw new Error("Orden no encontrada en la base de datos.");
    if (order.status !== "pending") throw new Error("La orden ya fue procesada o no está pendiente.");
    if (order.payment_processed_at || order.status === "paid") {
      throw new Error("Esta orden ya fue pagada.");
    }

    // 2. Control estricto de identidad / autorización
    const guestSecret = await getGuestTokenSecret(supabaseServiceKey);
    if (order.customer_id) {
      if (!user || user.id !== order.customer_id) {
        return new Response(
          JSON.stringify({ error: "No tienes permisos para iniciar el pago de esta orden." }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 403 }
        );
      }
    } else {
      // Pedido de invitado: debe validar el token criptográfico emitido al crear la orden
      const isValidGuest = await verifyOrderAccessToken(orderToken, orderId, guestSecret);
      if (!isValidGuest) {
        return new Response(
          JSON.stringify({ error: "Acceso no autorizado: token de orden de invitado inválido o ausente." }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 401 }
        );
      }
    }

    // 3. Fallback resolution: Environment Variable first, then site_settings
    let MP_ACCESS_TOKEN = (Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "").trim();
    if (!MP_ACCESS_TOKEN) {
      const { data: settings } = await supabaseClient
        .from("site_settings")
        .select("key, value")
        .eq("key", "payments_mercadopago_access_token")
        .maybeSingle();
      if (settings?.value) {
        MP_ACCESS_TOKEN = settings.value.trim();
      }
    }

    // Fail-Closed: Rechazo estricto si no existe credencial real
    if (!MP_ACCESS_TOKEN || MP_ACCESS_TOKEN.includes("mock") || MP_ACCESS_TOKEN === "TEST-mock") {
      throw new Error("Mercado Pago no está configurado adecuadamente para procesar cobros reales. Contacte al administrador.");
    }

    // 4. Determinar base URL permitida (origen)
    const rawOrigin = req.headers.get("origin") || "";
    const isAllowedOrigin = rawOrigin.includes("collectibles.uy") || 
                            rawOrigin.includes("collectibles-ecommerce.vercel.app") || 
                            rawOrigin.includes("localhost") || 
                            rawOrigin.includes("127.0.0.1");
    const base_url = isAllowedOrigin ? rawOrigin : "https://collectibles.uy";
    const webhook_url = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

    const items = (order.order_items || []).map((item: any) => ({
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
        email: order.customer_email || "cliente@collectibles.uy",
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
      notification_url: webhook_url,
      statement_descriptor: "COLLECTIBLES STORE"
    };

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

    const redirectUrl = MP_ACCESS_TOKEN.startsWith("TEST-") ? mpData.sandbox_init_point : mpData.init_point;

    // Registrar intento para trazabilidad financiera
    const { data: existingAttempts } = await supabaseClient
      .from("payment_attempts")
      .select("attempt_number")
      .eq("order_id", order.id);
    
    const attemptNumber = (existingAttempts && existingAttempts.length > 0)
      ? Math.max(...existingAttempts.map((a: any) => a.attempt_number)) + 1
      : 1;

    const { data: attempt } = await supabaseClient
      .from("payment_attempts")
      .insert({
        order_id: order.id,
        user_id: order.customer_id,
        provider: "mercadopago",
        payment_method_type: "mercadopago",
        attempt_number: attemptNumber,
        amount: order.total_amount,
        currency: order.currency || "UYU",
        normalized_status: "initiated",
        provider_status: "preference_created",
        external_preference_id: mpData.id,
        initiated_at: new Date().toISOString(),
        metadata: { preference_id: mpData.id, init_point: redirectUrl }
      })
      .select()
      .single();

    await supabaseClient.from("payment_events").insert({
      order_id: order.id,
      payment_attempt_id: attempt?.id,
      provider: "mercadopago",
      event_type: "preference_created",
      normalized_status: "initiated",
      provider_status: "preference_created",
      source: "checkout",
      payload_sanitized: { preference_id: mpData.id, redirect_url: redirectUrl },
      processing_result: "Preferencia de Mercado Pago creada exitosamente"
    });

    await supabaseClient
      .from("orders")
      .update({ 
        payment_id: mpData.id,
        payment_provider: "mercadopago",
        payment_status: "initiated",
        last_payment_attempt_id: attempt?.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", order.id);

    return new Response(JSON.stringify({ redirect_url: redirectUrl }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
