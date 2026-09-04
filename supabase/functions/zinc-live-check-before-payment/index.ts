import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { calculateFee, calculateCanonicalPricing } from "../_shared/pricing.ts";
import { getEffectiveExchangeRate } from "../_shared/internationalPricing.ts";

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

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    const { resolveZincApiKey } = await import("../_shared/zinc/index.ts");
    let ZINC_API_KEY = "";
    try {
      ZINC_API_KEY = await resolveZincApiKey(serviceClient, "production");
    } catch {
      ZINC_API_KEY = await resolveZincApiKey(serviceClient, "sandbox");
    }

    const body = await req.json();
    const { cart_items, reserve_capacity = false, reservation_minutes = 15 } = body;
    if (!cart_items || !Array.isArray(cart_items)) {
       throw new Error("Invalid payload: cart_items is required");
    }

    const { data: settings } = await serviceClient.from('international_sync_settings').select('*').eq('id', 1).single();
    if (!settings) throw new Error("Sync settings not found");
    
    const { effective_rate } = await getEffectiveExchangeRate(serviceClient);
    const results = [];
    let all_ok = true;
    let total_acquisition_cost_usd = 0;

    for (const item of cart_items) {
       const { data: prod } = await serviceClient.from('international_products').select('*').eq('id', item.product_id).single();
       if (!prod) continue; // Not an international product or not found

       try {
           const url = `https://api.zinc.com/products/${prod.external_product_id}?retailer=amazon`;
           const res = await fetch(url, { headers: { 'Authorization': `Bearer ${ZINC_API_KEY}` } });
           
           if (!res.ok) throw new Error(`Retailer API error: ${res.status}`);
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

           // Canonical Pricing: no double US shipping
           const canonical = calculateCanonicalPricing(price, usaShipping, fee, settings as any);
           const quantity = Number(item.quantity || 1);
           total_acquisition_cost_usd += (canonical.acquisition_cost_usd * quantity);

           const oldPrice = prod.final_price_usd;
           const variationPercent = oldPrice > 0 ? Math.abs((canonical.final_price_usd - oldPrice) / oldPrice) * 100 : 0;

           if (canonical.is_loss_adjusted && settings.never_sell_at_loss === false) {
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
                   // Recalculate
                   results.push({ product_id: prod.id, ok: true, price_changed: true, new_price: canonical.final_price_usd });
               }
           } else {
               results.push({ product_id: prod.id, ok: true });
           }

           // Update DB with valid_until 10 mins
           const validUntil = new Date(Date.now() + 10 * 60000).toISOString();
           const finalPriceUyu = Number((canonical.final_price_usd * effective_rate).toFixed(2));
           await serviceClient.from('international_products').update({
               last_price_usd: price,
               amazon_current_price_usd: price,
               final_price_usd: canonical.final_price_usd,
               final_price_uyu: finalPriceUyu,
               collectibles_fee_usd: canonical.collectibles_fee_usd,
               expected_profit_usd: canonical.expected_profit_usd,
               real_cost_usd: canonical.acquisition_cost_usd,
               price_valid_until: validUntil,
               availability: newAvail,
               sync_status: 'synced',
               last_synced_at: new Date().toISOString()
           }).eq('id', prod.id);

       } catch (err: any) {
           results.push({ product_id: prod.id, ok: false, message: "No se pudo verificar el producto internacional temporalmente." });
           all_ok = false;
       }
    }

    let reservationResult = null;
    // Perform capacity reservation if requested and all items are ok
    if (all_ok && reserve_capacity && total_acquisition_cost_usd > 0) {
      const { data: resData, error: resErr } = await serviceClient.rpc('reserve_international_capacity', {
        p_amount_usd: Number(total_acquisition_cost_usd.toFixed(2)),
        p_order_id: null,
        p_user_id: user.id,
        p_reservation_minutes: reservation_minutes,
        p_metadata: { source: 'checkout_live_check', items_count: cart_items.length }
      });

      if (resErr || !resData?.success) {
        all_ok = false;
        reservationResult = {
          success: false,
          error: resData?.error || 'CAPACITY_RESERVATION_FAILED',
          message: resData?.message || 'Cupos internacionales temporalmente completos'
        };
      } else {
        reservationResult = resData;
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      all_ok, 
      results,
      total_acquisition_cost_usd: Number(total_acquisition_cost_usd.toFixed(2)),
      reservation: reservationResult
    }), {
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
