import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

interface ConfirmRequest {
  provider: "dlocal" | "paypal" | "mercadopago";
  order_id: string; // The internal order id
  external_id?: string; // The provider's transaction/order id
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { provider, order_id, external_id } = await req.json() as ConfirmRequest;

    // Fetch site settings
    const { data: settings } = await supabaseClient.from('site_settings').select('key, value');
    const config = Object.fromEntries((settings || []).map(s => [s.key, s.value]));

    if (provider === 'paypal') {
      const isSandbox = config.payments_paypal_sandbox === 'true';
      const clientId = config.payments_paypal_client_id;
      const secret = config.payments_paypal_client_secret || config.payments_paypal_secret_key;
      const baseUrl = isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

      if (!clientId || !secret) throw new Error("Missing PayPal credentials");

      // 1. Get Token
      const auth = btoa(`${clientId}:${secret}`);
      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials"
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error("PayPal Token Auth Failed: " + JSON.stringify(tokenData));

      // 2. Capture Order
      // external_id is the PayPal order_id from the success URL params
      const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${external_id}/capture`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json"
        }
      });
      const captureData = await captureRes.json();
      
      if (!captureRes.ok || (captureData.status !== 'COMPLETED' && captureData.status !== 'APPROVED')) {
          console.error("PayPal Capture Error:", captureData);
          throw new Error("PayPal Capture Failed: " + (captureData.message || captureData.status));
      }

      // 3. Mark as Paid
      await supabaseClient.from('orders').update({ 
        status: 'paid', 
        payment_info: captureData 
      }).eq('id', order_id);

      return new Response(JSON.stringify({ success: true, status: 'paid' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (provider === 'mercadopago' || provider === 'dlocal') {
      // Typically asynchronous via webhooks, but we check if it already reached paid state
      const { data: order } = await supabaseClient.from('orders').select('status').eq('id', order_id).single();
      return new Response(JSON.stringify({ success: true, status: order?.status || 'pending' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    throw new Error("Proveedor desconocido: " + provider);

  } catch (err: any) {
    console.error("Confirm Payment error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200, // Returning 200 with error property for frontend handle
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
