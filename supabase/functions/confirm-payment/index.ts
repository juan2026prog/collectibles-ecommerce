// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { verifyOptionalAuth } from "../_shared/auth.ts";
import { finalizeOrderIfNeeded, orderSummary } from "../_shared/order-payments.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

declare const Deno: any;

interface ConfirmRequest {
  provider: "dlocalgo" | "dlocal" | "paypal" | "mercadopago" | "handy";
  order_id: string;
  external_id?: string;
  customer_email?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const user = await verifyOptionalAuth(req);
    const { provider, order_id, external_id, customer_email } = await req.json() as ConfirmRequest;

    const { data: currentOrder, error: orderError } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !currentOrder) {
      throw new Error("La orden no existe.");
    }

    if (currentOrder.customer_id) {
      if (!user || user.id !== currentOrder.customer_id) {
        throw new Error("No tienes permisos para consultar esta orden.");
      }
    } else if (customer_email && customer_email.toLowerCase() !== String(currentOrder.customer_email || "").toLowerCase()) {
      throw new Error("No se pudo validar el email de la orden.");
    }

    const { data: settings } = await supabaseClient.from("site_settings").select("key, value");
    const config = Object.fromEntries((settings || []).map((item: any) => [item.key, item.value]));

    if (provider === "paypal") {
      if (!external_id || (currentOrder.payment_id && currentOrder.payment_id !== external_id)) {
        throw new Error("No se pudo validar la orden de PayPal retornada por el proveedor.");
      }

      if (currentOrder.payment_processed_at) {
        return new Response(JSON.stringify({ success: true, status: "paid", order: orderSummary(currentOrder) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isSandbox = config.payments_paypal_sandbox === "true";
      const clientId = config.payments_paypal_client_id;
      const secret = config.payments_paypal_client_secret || config.payments_paypal_secret_key;
      const baseUrl = isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
      if (!clientId || !secret) {
        throw new Error("Missing PayPal credentials");
      }

      const auth = btoa(`${clientId}:${secret}`);
      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(`PayPal Token Auth Failed: ${JSON.stringify(tokenData)}`);
      }

      const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${external_id}/capture`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
      });
      const captureData = await captureRes.json();
      if (!captureRes.ok || (captureData.status !== "COMPLETED" && captureData.status !== "APPROVED")) {
        throw new Error(`PayPal Capture Failed: ${captureData.message || captureData.status}`);
      }

      const paidOrder = await finalizeOrderIfNeeded(
        supabaseClient,
        supabaseUrl,
        supabaseServiceRoleKey,
        order_id,
        captureData.id || external_id,
      );

      return new Response(JSON.stringify({ success: true, status: "paid", order: orderSummary(paidOrder) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (provider === "mercadopago") {
      if (currentOrder.payment_processed_at) {
        return new Response(JSON.stringify({ success: true, status: "paid", order: orderSummary(currentOrder) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mpAccessToken = config.payments_mercadopago_access_token || Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
      if (mpAccessToken) {
        const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${order_id}&sort=date_created&criteria=desc`;
        const searchRes = await fetch(searchUrl, {
          headers: { "Authorization": `Bearer ${mpAccessToken}` },
        });
        const searchData = await searchRes.json();

        if (searchRes.ok && searchData.results?.length > 0) {
          const latestPayment = searchData.results[0];
          if (latestPayment.status === "approved" || latestPayment.status === "authorized") {
            const paidOrder = await finalizeOrderIfNeeded(
              supabaseClient,
              supabaseUrl,
              supabaseServiceRoleKey,
              order_id,
              String(latestPayment.id),
            );

            return new Response(JSON.stringify({ success: true, status: "paid", order: orderSummary(paidOrder) }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      return new Response(JSON.stringify({ success: true, status: currentOrder.status || "pending", order: orderSummary(currentOrder) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (provider === "dlocalgo" || provider === "dlocal") {
      return new Response(JSON.stringify({ success: true, status: currentOrder.status || "pending", order: orderSummary(currentOrder) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (provider === "handy") {
      return new Response(JSON.stringify({
        success: true,
        status: currentOrder.payment_status || currentOrder.status || "pending_payment",
        order: orderSummary(currentOrder),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Proveedor desconocido: ${provider}`);
  } catch (err: any) {
    console.error("Confirm Payment error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
