import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { verifyOptionalAuth } from "../_shared/auth.ts";

import { corsHeaders, handleOptions, getCorsHeaders } from "../_shared/cors.ts";


interface PaymentRequest {
  provider: "dlocal" | "paypal" | "mercadopago";
  order_id: string;
  customer_email?: string;
}

function getCustomerName(order: Record<string, any>) {
  const shippingAddress = order.shipping_address || {};
  const firstName = shippingAddress.first_name || "";
  const lastName = shippingAddress.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || order.customer_email || "Cliente";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const user = await verifyOptionalAuth(req);
    const body = await req.json() as PaymentRequest;
    const { provider, order_id: orderId, customer_email: customerEmail } = body;

    if (!orderId) {
      throw new Error("Debes crear una orden validada antes de iniciar el pago.");
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, customer_email, customer_phone, total_amount, currency, status, payment_method, payment_id, payment_processed_at, shipping_address")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error("La orden indicada no existe.");
    }

    if (order.payment_processed_at || order.status === "paid") {
      throw new Error("Esta orden ya fue pagada.");
    }

    if (order.customer_id) {
      if (!user || user.id !== order.customer_id) {
        throw new Error("No tienes permisos para iniciar el pago de esta orden.");
      }
    } else if (!customerEmail || customerEmail.toLowerCase() !== String(order.customer_email || "").toLowerCase()) {
      throw new Error("No se pudo validar el email de la orden.");
    }

    const { data: settings } = await supabaseAdmin.from("site_settings").select("key, value");
    const safeSettings = Array.isArray(settings) ? settings : [];
    const config = Object.fromEntries(safeSettings.map((item) => [item.key, item.value]));

    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
      .from("order_items")
      .select("product_id, variant_id, quantity, unit_price, product:products(title)")
      .eq("order_id", orderId);

    const safeOrderItems = Array.isArray(orderItems) ? orderItems : [];
    
    if (orderItemsError || safeOrderItems.length === 0) {
      throw new Error("La orden no tiene items para procesar el pago.");
    }

    const amount = Number(order.total_amount);
    const currency = order.currency || "UYU";
    const customer = {
      name: getCustomerName(order),
      email: order.customer_email,
      address: order.shipping_address?.street || order.shipping_address?.full_address || "",
      phone: order.customer_phone || undefined,
    };
    const origin = req.headers.get("origin") || "https://collectibles-ecommerce.vercel.app";

    if (provider === "dlocal") {
      const apiKey = (config.payments_dlocal_go_api_key || "").trim();
      if (!apiKey) {
        throw new Error("dLocal Go API key not configured. Set it in Admin > Settings > Payments.");
      }

      const isSandbox = config.payments_dlocal_go_sandbox === "true";
      const apiBaseUrl = isSandbox ? "https://api-sbx.dlocalgo.com" : "https://api.dlocalgo.com";
      const requestBody = JSON.stringify({
        amount: amount.toFixed(2),
        currency,
        country: "UY",
        order_id: String(orderId),
        description: `Order ${orderId}`,
        success_url: `${origin}/checkout/success?order_id=${orderId}&provider=dlocalgo`,
        back_url: `${origin}/checkout`,
        notification_url: `${supabaseUrl}/functions/v1/dlocalgo-webhook`,
        payer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone || undefined,
        },
      });

      const response = await fetch(`${apiBaseUrl}/v1/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: requestBody,
      });

      const result = await response.json();
      if (!response.ok || result.errorCode) {
        const errorMessage = result.errorMessage || result.message || JSON.stringify(result);
        throw new Error(`dLocal Go Error (${result.errorCode || response.status}): ${errorMessage}`);
      }

      const checkoutUrl = result.redirect_url || result.checkout_url || result.link;
      if (checkoutUrl) {
        await supabaseAdmin
          .from("orders")
          .update({
            payment_status: "redirected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        return new Response(JSON.stringify({ checkout_url: checkoutUrl }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      if (result.id) {
        await supabaseAdmin
          .from("orders")
          .update({
            payment_status: "redirected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        return new Response(JSON.stringify({
          checkout_url: `https://checkout.dlocalgo.com/collect/${result.id}`,
          payment_id: result.id,
        }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      throw new Error(`dLocal Go no devolvio URL de checkout. Response: ${JSON.stringify(result)}`);
    }

    if (provider === "paypal") {
      const clientId = (config.payments_paypal_client_id || "").trim();
      const clientSecret = (config.payments_paypal_client_secret || config.payments_paypal_secret_key || "").trim();
      if (!clientId || !clientSecret) {
        throw new Error("PayPal credentials not configured. Set Client ID and Client Secret in Admin > Settings > Payments.");
      }

      const isSandbox = config.payments_paypal_sandbox === "true";
      const apiBase = isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
      const tokenResponse = await fetch(`${apiBase}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(`PayPal Auth Error: ${JSON.stringify(tokenData)}`);
      }

      const paypalCurrency = currency === "UYU" ? "USD" : currency;
      const paypalAmount = paypalCurrency === "USD" && currency === "UYU"
        ? (amount / 42).toFixed(2)
        : amount.toFixed(2);

      const orderPayload = {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: String(orderId),
          description: `Collectibles Order #${orderId}`,
          amount: {
            currency_code: paypalCurrency,
            value: paypalAmount,
          },
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "Collectibles Store",
              locale: "es-UY",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: `${origin}/checkout/success?order_id=${orderId}&provider=paypal`,
              cancel_url: `${origin}/checkout`,
            },
          },
        },
      };

      const orderResponse = await fetch(`${apiBase}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
        body: JSON.stringify(orderPayload),
      });

      const orderResult = await orderResponse.json();
      if (!orderResponse.ok) {
        throw new Error(`PayPal Order Error (${orderResponse.status}): ${JSON.stringify(orderResult)}`);
      }

      const approvalLink = orderResult.links?.find((link: any) => link.rel === "payer-action" || link.rel === "approve");
      if (!approvalLink?.href) {
        throw new Error(`PayPal no devolvio URL de aprobacion. Response: ${JSON.stringify(orderResult)}`);
      }

      await supabaseAdmin
        .from("orders")
        .update({
          payment_id: orderResult.id,
          payment_method: "paypal",
          payment_status: "redirected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      return new Response(JSON.stringify({ checkout_url: approvalLink.href }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (provider === "mercadopago") {
      const mpAccessToken = (config.payments_mercadopago_access_token || "").trim();
      if (!mpAccessToken) {
        throw new Error("Mercado Pago Access Token no configurado. Configuralo en Admin > Settings > Payments.");
      }

      const isSandbox = mpAccessToken.startsWith("TEST-");
      const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;
      const mpItems = safeOrderItems.map((item: any) => ({
        id: String(item.product_id),
        title: item.product?.title || "Producto",
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        currency_id: currency,
      }));

      // Cargar costos de envío y descuentos desde shipping_address JSONB
      const shippingCost = Number(order.shipping_address?.shipping_cost || 0);
      const shippingMethod = order.shipping_address?.shipping_method || "";
      if (shippingCost > 0) {
        mpItems.push({
          id: "shipping",
          title: shippingMethod === "dac" ? "Envío DAC al interior" : "Envío a domicilio",
          quantity: 1,
          unit_price: shippingCost,
          currency_id: currency,
        });
      }

      const discountAmount = Number(order.shipping_address?.discount_amount || 0);
      if (discountAmount > 0) {
        mpItems.push({
          id: "discount_coupon",
          title: "Descuento por Cupón",
          quantity: 1,
          unit_price: -discountAmount,
          currency_id: currency,
        });
      }

      const bankDiscount = Number(order.shipping_address?.bank_discount || 0);
      if (bankDiscount > 0) {
        mpItems.push({
          id: "discount_bank",
          title: "Descuento Bancario",
          quantity: 1,
          unit_price: -bankDiscount,
          currency_id: currency,
        });
      }

      // Reconciliación exacta con order.total_amount (amount)
      const currentSum = mpItems.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity), 0);
      const diff = Number((amount - currentSum).toFixed(2));
      if (Math.abs(diff) > 0.001) {
        const shippingItem = mpItems.find((item: any) => item.id === "shipping");
        if (shippingItem) {
          shippingItem.unit_price = Number((shippingItem.unit_price + diff).toFixed(2));
        } else {
          mpItems.push({
            id: "adjustment",
            title: "Ajuste por redondeo",
            quantity: 1,
            unit_price: diff,
            currency_id: currency,
          });
        }
      }

      const isLocalhost = origin.includes("localhost") || origin.includes("127.0.0.1");
      const mpOrigin = isLocalhost ? "https://collectibles-ecommerce.vercel.app" : origin;

      const preferencePayload = {
        items: mpItems,
        payer: {
          email: customer.email || "guest@collectibles.uy",
          name: customer.name.split(" ")[0] || "Cliente",
          surname: customer.name.split(" ").slice(1).join(" ") || "Guest",
        },
        back_urls: {
          success: `${mpOrigin}/checkout/success?order_id=${orderId}&provider=mercadopago`,
          failure: `${mpOrigin}/checkout?error=pagorechazado`,
          pending: `${mpOrigin}/checkout/success?order_id=${orderId}&provider=mercadopago&status=pending`,
        },
        auto_return: "approved",
        external_reference: String(orderId),
        notification_url: webhookUrl,
        statement_descriptor: "COLLECTIBLES STORE",
      };

      const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mpAccessToken}`,
        },
        body: JSON.stringify(preferencePayload),
      });

      const mpResult = await mpResponse.json();
      if (!mpResponse.ok) {
        throw new Error(`Mercado Pago Error (${mpResponse.status}): ${JSON.stringify(mpResult)}`);
      }

      const checkoutUrl = isSandbox ? mpResult.sandbox_init_point : mpResult.init_point;
      if (!checkoutUrl) {
        throw new Error(`Mercado Pago no devolvio URL de checkout. Response: ${JSON.stringify(mpResult)}`);
      }

      await supabaseAdmin
        .from("orders")
        .update({
          payment_id: mpResult.id,
          payment_method: "mercadopago",
          payment_status: "redirected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      return new Response(JSON.stringify({ checkout_url: checkoutUrl }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    throw new Error("Proveedor no configurado");
  } catch (err: any) {
    console.error("Payment Function Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
