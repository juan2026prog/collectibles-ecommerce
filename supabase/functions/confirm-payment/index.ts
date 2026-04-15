// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

declare const Deno: any;

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
    const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));

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
        payment_id: captureData.id || external_id,
        payment_info: captureData 
      }).eq('id', order_id);

      // ── Post-payment actions (same as MP & dLocalGo webhooks) ──

      // 3a. Decrement inventory
      const { data: orderItems } = await supabaseClient
        .from('order_items')
        .select('*')
        .eq('order_id', order_id);

      if (orderItems) {
        for (const item of orderItems) {
          if (item.variant_id) {
            await supabaseClient.rpc('decrement_inventory', {
              p_variant_id: item.variant_id,
              p_quantity: item.quantity
            }).catch((err: any) => console.error('PayPal inventory error:', err));
          }
        }
      }

      // 3b. Trigger commission calculation
      const fnUrl = `${supabaseUrl}/functions/v1/calculate-commissions`;
      await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceRoleKey}`
        },
        body: JSON.stringify({ order_id })
      }).catch((err: any) => console.error('PayPal commissions error:', err));

      // 3c. Trigger transactional email
      const { data: fullOrder } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();

      if (fullOrder) {
        const emailUrl = `${supabaseUrl}/functions/v1/transactional-emails`;
        await fetch(emailUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceRoleKey}`
          },
          body: JSON.stringify({
            type: 'UPDATE',
            table: 'orders',
            record: fullOrder,
            old_record: { ...fullOrder, status: 'pending' }
          })
        }).catch((err: any) => console.error('PayPal email error:', err));
      }

      // 3d. Trigger SoyDelivery Sync
      const sdUrl = `${supabaseUrl}/functions/v1/soydelivery-sync`;
      await fetch(sdUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceRoleKey}`
        },
        body: JSON.stringify({ order_id })
      }).catch((err: any) => console.error('PayPal SoyDelivery error:', err));

      return new Response(JSON.stringify({ success: true, status: 'paid' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (provider === 'mercadopago') {
      // Actively check payment status with MP API
      const { data: currentOrder } = await supabaseClient.from('orders').select('status, payment_id').eq('id', order_id).single();
      
      // If already paid, return immediately
      if (currentOrder?.status === 'paid') {
        return new Response(JSON.stringify({ success: true, status: 'paid' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Try to verify payment via external_id (payment_id from MP redirect) or order's stored payment_id
      const mpPaymentId = external_id || currentOrder?.payment_id;
      if (mpPaymentId && !String(mpPaymentId).startsWith('MP-MOCK')) {
        const mpAccessToken = config.payments_mercadopago_access_token || Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
        
        if (mpAccessToken) {
          // If external_id is a preference ID, we need to search for payments with that external_reference
          const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${order_id}&sort=date_created&criteria=desc`;
          const searchRes = await fetch(searchUrl, {
            headers: { "Authorization": `Bearer ${mpAccessToken}` }
          });
          const searchData = await searchRes.json();
          
          if (searchRes.ok && searchData.results?.length > 0) {
            const latestPayment = searchData.results[0];
            console.log(`[Confirm MP] Payment ${latestPayment.id} status: ${latestPayment.status}`);
            
            if (latestPayment.status === 'approved' || latestPayment.status === 'authorized') {
              // Mark as paid
              await supabaseClient.from('orders').update({ 
                status: 'paid', 
                payment_id: latestPayment.id.toString(),
                updated_at: new Date().toISOString()
              }).eq('id', order_id);

              // Decrement inventory
              const { data: orderItems } = await supabaseClient.from('order_items').select('*').eq('order_id', order_id);
              if (orderItems) {
                for (const item of orderItems) {
                  if (item.variant_id) {
                    await supabaseClient.rpc('decrement_inventory', {
                      p_variant_id: item.variant_id,
                      p_quantity: item.quantity
                    }).catch((err: any) => console.error('MP inventory error:', err));
                  }
                }
              }

              // Trigger commissions
              await fetch(`${supabaseUrl}/functions/v1/calculate-commissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceRoleKey}` },
                body: JSON.stringify({ order_id })
              }).catch((err: any) => console.error('MP commissions error:', err));

              // Trigger SoyDelivery
              await fetch(`${supabaseUrl}/functions/v1/soydelivery-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceRoleKey}` },
                body: JSON.stringify({ order_id })
              }).catch((err: any) => console.error('MP SoyDelivery error:', err));

              return new Response(JSON.stringify({ success: true, status: 'paid' }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true, status: currentOrder?.status || 'pending' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (provider === 'dlocal') {
      // dLocal uses webhooks, just return current status
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
