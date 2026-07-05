import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { calculateFee, calculateRealCost, calculateProfitEngine, applyProfitProtection } from "../_shared/pricing.ts";

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

    const { cart_items } = await req.json();
    if (!cart_items || !Array.isArray(cart_items)) {
       throw new Error("Invalid payload: cart_items is required");
    }

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const { data: settings } = await serviceClient.from('international_sync_settings').select('*').eq('id', 1).single();
    if (!settings) throw new Error("Sync settings not found");
    const results = [];
    let all_ok = true;

    for (const item of cart_items) {
       const { data: prod } = await serviceClient.from('international_products').select('*').eq('id', item.product_id).single();
       if (!prod) continue; // Not an international product or not found

       try {
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

           if (settings.only_prime && data.buy_box && !data.buy_box.prime) {
               newAvail = 'unavailable';
           }

           if (!price) {
               newAvail = 'unavailable';
           }

           if (newAvail === 'unavailable') {
               results.push({ product_id: prod.id, ok: false, message: "Este producto internacional ya no está disponible." });
               all_ok = false;
               await serviceClient.from('international_products').update({ sync_status: 'unavailable', availability: 'unavailable' }).eq('id', prod.id);
               continue;
           }

           const pricing_mode = prod.pricing_mode || settings.pricing_mode || 'amazon_price_plus_fee';
           const fee = calculateFee(price, pricing_mode, settings.fixed_markup_usd, settings.percentage_markup, settings.tiered_markup_rules);
           
           const usaShipping = Number(prod.usa_domestic_shipping_usd || 0);
           const realCost = calculateRealCost(price, usaShipping, settings as any);
           const expectedProfit = calculateProfitEngine(realCost, settings as any);
           const protection = applyProfitProtection(price, fee, realCost, expectedProfit, settings as any);

           const finalPriceWithShipping = protection.finalPrice + usaShipping;
           const oldPrice = prod.final_price_usd;
           const variationPercent = Math.abs((finalPriceWithShipping - oldPrice) / oldPrice) * 100;

           if (protection.isLoss) {
               results.push({ product_id: prod.id, ok: false, message: `La rentabilidad mínima del producto internacional ya no es válida. Por favor, consulta con soporte.` });
               all_ok = false;
           } else if (variationPercent > (settings.max_price_variation_percent || 5.0)) {
               if (settings.price_variation_action === 'manual_review') {
                   results.push({ product_id: prod.id, ok: false, message: `El precio del producto ha cambiado más del ${settings.max_price_variation_percent}%. Por favor revisa el catálogo.` });
                   all_ok = false;
               } else if (settings.price_variation_action === 'unpublish') {
                   results.push({ product_id: prod.id, ok: false, message: `El producto ya no está disponible a este precio.` });
                   all_ok = false;
                   await serviceClient.from('international_products').update({ sync_status: 'stale', status: 'unavailable' }).eq('id', prod.id);
               } else {
                   // recalculate
                   results.push({ product_id: prod.id, ok: true, price_changed: true, new_price: finalPriceWithShipping });
               }
           } else {
               results.push({ product_id: prod.id, ok: true });
           }

           // Update DB with valid_until 10 mins
           const validUntil = new Date(Date.now() + 10 * 60000).toISOString();
           await serviceClient.from('international_products').update({
               last_price_usd: price,
               amazon_current_price_usd: price,
               final_price_usd: finalPriceWithShipping,
               collectibles_fee_usd: protection.finalFee,
               expected_profit_usd: expectedProfit,
               real_cost_usd: realCost,
               price_valid_until: validUntil,
               availability: newAvail,
               sync_status: 'synced',
               last_synced_at: new Date().toISOString()
           }).eq('id', prod.id);

       } catch (err: any) {
           results.push({ product_id: prod.id, ok: false, message: "No se pudo verificar el producto con Amazon temporalmente." });
           all_ok = false;
       }
    }

    return new Response(JSON.stringify({ success: true, all_ok, results }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status: 200
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status: 500
    });
  }
});
