import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });
    
    // Check if user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");
    if (!ZINC_API_KEY) throw new Error("ZINC_API_KEY no configurada");

    const { order_id } = await req.json();
    if (!order_id) throw new Error("Invalid payload: order_id is required");

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    
    const { data: order } = await serviceClient.from('orders').select('*, order_items(*)').eq('id', order_id).single();
    if (!order) throw new Error("Order not found");

    const { data: settings } = await serviceClient.from('international_sync_settings').select('*').eq('id', 1).single();

    let orderStatus = 'pending_zinc_purchase';
    let allOk = true;

    for (const item of order.order_items) {
       // if it's not international, skip
       if (!item.product_id) continue;
       const { data: prod } = await serviceClient.from('international_products').select('*').eq('id', item.product_id).single();
       if (!prod) continue; // standard product

       try {
           const validUntil = prod.price_valid_until ? new Date(prod.price_valid_until) : new Date(0);
           const now = new Date();
           
           if (validUntil > now && prod.availability === 'in_stock') {
               // Price is frozen and still valid. Proceed.
               continue;
           }

           const url = `https://api.zinc.com/products/${prod.external_product_id}?retailer=amazon`;
           const res = await fetch(url, { headers: { 'Authorization': `Bearer ${ZINC_API_KEY}` } });
           
           if (!res.ok) throw new Error(`Zinc API error: ${res.status}`);
           const data = await res.json();
           
           const priceRaw = data.price || (data.offers && data.offers.length > 0 ? data.offers[0].price : null);
           const price = priceRaw ? priceRaw / 100 : null;

           let newAvail = 'unavailable';
           const status = (data.status || '').toLowerCase();
           if (status === 'available') newAvail = 'in_stock';
           else if (status === 'out_of_stock' || status.includes('unavailable')) newAvail = 'unavailable';
           else newAvail = 'in_stock';

           if (settings?.only_prime && data.buy_box && !data.buy_box.prime) {
               newAvail = 'unavailable';
           }

           if (!price) {
               newAvail = 'unavailable';
           }

           if (newAvail === 'unavailable') {
               orderStatus = 'manual_review_unavailable';
               allOk = false;
               break;
           }

           let safety_margin = prod.safety_margin_percent || settings?.safety_margin_percent || 8;
           let max_price = prod.base_price_usd * (1 + (safety_margin / 100));

           if (price! > max_price) {
               orderStatus = 'manual_review_price_changed';
               allOk = false;
               break;
           }
       } catch (err: any) {
           orderStatus = 'manual_review_unavailable'; // Or some other generic review status
           allOk = false;
           break;
       }
    }

    if (!allOk) {
       // Update order status if something went wrong
       await serviceClient.from('orders').update({ status: orderStatus }).eq('id', order_id);
    } else if (settings?.auto_purchase_enabled) {
       // Actually execute Zinc purchase logic... (omitted for now)
       // orderStatus would become 'zinc_purchase_created'
    }

    return new Response(JSON.stringify({ success: true, orderStatus, allOk }), { headers: getCorsHeaders(), status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: getCorsHeaders(), status: 500 });
  }
});
