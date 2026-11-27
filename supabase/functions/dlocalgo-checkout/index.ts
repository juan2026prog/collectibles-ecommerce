import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions, resolveTrustedReturnOrigin } from "../_shared/cors.ts";

declare const Deno: any;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { orderId } = await req.json();
    if (!orderId) throw new Error("orderId is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: settings } = await supabaseClient
      .from("site_settings")
      .select("key, value")
      .in("key", ["payments_dlocal_go_enabled", "payments_dlocal_go_sandbox", "payments_dlocal_go_api_key"]);
    const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));

    if (config.payments_dlocal_go_enabled !== "true") {
      return new Response(
        JSON.stringify({ error: "dLocal Go se encuentra deshabilitado actualmente." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: order, error } = await supabaseClient
      .from("orders")
      .select("id, customer_email, customer_phone, total_amount, currency, status, shipping_address")
      .eq("id", orderId)
      .single();

    if (error || !order) throw new Error("Order not found");
    if (order.status !== "pending") throw new Error("Order is not in pending state");

    const origin = resolveTrustedReturnOrigin(req.headers.get("origin"), { allowLocalhost: false });
    const isSandbox = config.payments_dlocal_go_sandbox === "true";
    const apiBaseUrl = isSandbox ? "https://api-sbx.dlocalgo.com" : "https://api.dlocalgo.com";
    const apiKey = (Deno.env.get("DLOCALGO_API_KEY") || config.payments_dlocal_go_api_key || "").trim();

    if (!apiKey) {
      throw new Error("DLOCALGO_API_KEY is not configured on the server.");
    }

    const paymentPayload = {
      amount: Number(order.total_amount).toFixed(2),
      currency: order.currency || "UYU",
      country: "UY",
      order_id: String(order.id),
      description: `Order ${order.id}`,
      success_url: `${origin}/checkout/success?order_id=${order.id}&provider=dlocalgo`,
      back_url: `${origin}/checkout`,
      notification_url: `${supabaseUrl}/functions/v1/dlocalgo-webhook`,
      payer: {
        name: `${order.shipping_address?.first_name || ""} ${order.shipping_address?.last_name || ""}`.trim() || "Cliente",
        email: order.customer_email,
        phone: order.customer_phone || undefined,
      },
    };

    const response = await fetch(`${apiBaseUrl}/v1/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(paymentPayload),
    });

    const dlocalData = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(dlocalData));

    await supabaseClient
      .from("orders")
      .update({ payment_id: dlocalData.id })
      .eq("id", order.id);

    return new Response(JSON.stringify({ redirect_url: dlocalData.redirect_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
