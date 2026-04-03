import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

interface PaymentRequest {
  provider: "dlocal" | "paypal";
  amount: number;
  currency: string;
  order_id: string;
  customer?: {
    name: string;
    email: string;
    document?: string;
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = await req.json();
    const { provider, amount, currency, order_id, customer } = body as PaymentRequest;

    // Fetch site settings for credentials
    const { data: settings, error: settingsError } = await supabaseClient
      .from('site_settings')
      .select('key, value');

    if (settingsError) throw new Error(`Settings fetch error: ${settingsError.message}`);

    const config = Object.fromEntries((settings || []).map(s => [s.key, s.value]));

    if (provider === 'dlocal' && config.payments_dlocal_go_enabled === 'true') {
      const isSandbox = config.payments_dlocal_go_sandbox === 'true';
      const baseUrl = "https://api.dlocalgo.com/v1"; 
      // Use secret key for backend calls if available, otherwise fallback to api key
      const apiKey = config.payments_dlocal_go_secret_key || config.payments_dlocal_go_api_key;
      
      console.log(`Initiating dLocal Go payment for order ${order_id}...`);

      const response = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          amount: amount,
          currency: currency,
          country: "UY", 
          order_id: order_id,
          payment_method_flow: "REDIRECT",
          success_url: `${req.headers.get("origin") || 'http://localhost:5173'}/checkout/success?order_id=${order_id}&provider=dlocal`,
          back_url: `${req.headers.get("origin") || 'http://localhost:5173'}/checkout`,
          notification_url: `${supabaseUrl}/functions/v1/payment-webhook?provider=dlocal`,
          payer: {
            name: customer?.name || "Customer",
            email: customer?.email
          }
        })
      });

      const result = await response.json();
      if (!response.ok) {
        console.error("dLocal Error Response:", result);
        throw new Error(result.message || result.error_description || "Error de dLocal Go: No se pudo generar el checkout");
      }
      
      // Handle both possible field names for the redirect URL
      const checkoutUrl = result.checkout_url || result.redirect_url;
      
      if (!checkoutUrl) {
        console.error("dLocal Response missing URL:", result);
        throw new Error("dLocal Go no proporcionó una URL de checkout");
      }

      return new Response(JSON.stringify({ checkout_url: checkoutUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (provider === 'paypal' && config.payments_paypal_enabled === 'true') {
      const isSandbox = config.payments_paypal_sandbox === 'true';
      const clientId = config.payments_paypal_client_id;
      const secret = config.payments_paypal_secret_key;
      const baseUrl = isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

      // 1. Get Access Token
      const auth = btoa(`${clientId}:${secret}`);
      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
      });
      
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error_description || "Error de auth PayPal");

      // 2. Create Order
      const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: order_id,
            amount: { 
              currency_code: currency, 
              value: Number(amount).toFixed(2) 
            }
          }],
          application_context: {
            brand_name: config.store_name || "Store",
            return_url: `${req.headers.get("origin")}/checkout/success?order_id=${order_id}&provider=paypal`,
            cancel_url: `${req.headers.get("origin")}/checkout`,
            user_action: "PAY_NOW"
          }
        })
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        console.error("PayPal Error Response:", orderData);
        throw new Error(orderData.message || "Error creando orden PayPal");
      }

      const approveLink = orderData.links.find((l: any) => l.rel === "approve");
      return new Response(JSON.stringify({ checkout_url: approveLink.href }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    throw new Error("Proveedor de pago no disponible o desactivado");

  } catch (err: any) {
    console.error("Payment Function Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
