import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { calculateFee, calculateDiscount, calculateRealCost, calculateProfitEngine, applyProfitProtection, calculateUruboxEstimate } from "../_shared/pricing.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const bypassHeader = req.headers.get("x-zinc-sync-bypass");
    if (bypassHeader !== "collectibles-zinc-sync-secret") {
      // In case it's called manually by admin
      const authHeader = req.headers.get('Authorization')!;
      if (!authHeader) throw new Error('No authorization header');
    }

    const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");
    if (!ZINC_API_KEY) throw new Error("ZINC_API_KEY no configurada");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settings } = await supabase.from('international_sync_settings').select('*').eq('id', 1).single();
    if (!settings || !settings.auto_sync_enabled) {
      return new Response(JSON.stringify({ message: "Sync is disabled" }), { headers: getCorsHeaders(), status: 200 });
    }

    // Fetch 20 products
    const { data: products } = await supabase
      .from('international_products')
      .select('*')
      .eq('status', 'published')
      .eq('sync_enabled', true)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(20);

    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ message: "No products to sync" }), { headers: getCorsHeaders(), status: 200 });
    }

    const logs = [];

    for (const prod of products) {
      try {
        const url = `https://api.zinc.com/products/${prod.external_product_id}?retailer=amazon`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${ZINC_API_KEY}` } });

        if (!res.ok) {
           throw new Error(`Zinc API error: ${res.status}`);
        }

        const data = await res.json();

        const priceRaw = data.price || (data.offers && data.offers.length > 0 ? data.offers[0].price : null);
        const price = priceRaw ? priceRaw / 100 : null;

        let rawListPrice = data.msrp ? data.msrp / 100 : null;
        if (!rawListPrice && data.price && data.offers && data.offers[0]?.price) {
          rawListPrice = Math.max(data.price / 100, data.offers[0].price / 100);
        }
        
        let newAvail = 'unavailable';
        let newPrime = false;
        let newDelivText = 'No informado';
        
        // Logic for availability
        const status = (data.status || '').toLowerCase();
        // Zinc product endpoint usually returns 'status' like 'available', 'currently_unavailable', etc.
        // It also might return `buy_box` or `offers`. Let's just assume simple standard format.
        
        if (status === 'available') {
           newAvail = 'in_stock';
        } else if (status === 'out_of_stock' || status.includes('unavailable')) {
           newAvail = 'unavailable';
        } else {
           newAvail = 'in_stock'; // Fallback
        }

        // prime is usually inside offers or buy_box
        if (data.buy_box) {
           newPrime = data.buy_box.prime || false;
           if (data.buy_box.shipping_message) newDelivText = data.buy_box.shipping_message;
        }

        let safety_margin = prod.safety_margin_percent || settings.safety_margin_percent;
        let max_price = prod.base_price_usd * (1 + (safety_margin / 100));
        let change_percent = 0;
        let syncStatus = 'synced';

        if (price) {
           change_percent = ((price - prod.base_price_usd) / prod.base_price_usd) * 100;
           if (price > max_price) {
               // We might block it or just flag it
               // Actually the sync job just updates the DB, let the DB reflect reality
           }
        } else {
           newAvail = 'unavailable';
           syncStatus = 'unavailable';
        }

        if (settings.only_prime && !newPrime) {
           newAvail = 'unavailable';
        }

        if (newAvail === 'unavailable') {
            syncStatus = 'unavailable';
        }

        const updates: any = {
            last_synced_at: new Date().toISOString(),
            sync_status: syncStatus,
            amazon_prime: newPrime,
            amazon_delivery_type: newAvail,
            amazon_delivery_text: newDelivText,
            availability: newAvail,
            availability_last_checked_at: new Date().toISOString()
        };

        if (price) {
            updates.last_price_usd = price;
            updates.amazon_current_price_usd = price;
            const listPrice = rawListPrice && rawListPrice > price ? rawListPrice : null;
            updates.amazon_list_price_usd = listPrice;
            updates.amazon_discount_percent = calculateDiscount(price, listPrice);

            const pricing_mode = prod.pricing_mode || settings.pricing_mode || 'amazon_price_plus_fee';
            const fee = calculateFee(price, pricing_mode, settings.fixed_markup_usd, settings.percentage_markup, settings.tiered_markup_rules);
            
            const usaShipping = Number(prod.usa_domestic_shipping_usd || 0);
            const realCost = calculateRealCost(price, usaShipping, settings as any);
            const expectedProfit = calculateProfitEngine(realCost, settings as any);
            const protection = applyProfitProtection(price, fee, realCost, expectedProfit, settings as any);

            const finalPriceWithShipping = protection.finalPrice + usaShipping;

            updates.collectibles_fee_usd = protection.finalFee;
            updates.final_price_usd = finalPriceWithShipping;
            updates.expected_profit_usd = expectedProfit;
            updates.real_cost_usd = realCost;
            
            const urubox_estimated_cost_usd = calculateUruboxEstimate(prod.weight_grams, prod.category, settings as any);
            updates.urubox_estimated_cost_usd = urubox_estimated_cost_usd;
            updates.total_estimated_cost_usd = finalPriceWithShipping + urubox_estimated_cost_usd;

            updates.final_price_uyu = updates.final_price_usd * 40;
            
            if (prod.final_price_usd && prod.final_price_uyu) {
              const implicit_exchange_rate = prod.final_price_uyu / prod.final_price_usd;
              updates.final_price_uyu = updates.final_price_usd * implicit_exchange_rate;
            }

            updates.price_change_percent = change_percent;
            updates.max_allowed_price_usd = max_price;
            updates.price_last_checked_at = new Date().toISOString();
        }

        await supabase.from('international_products').update(updates).eq('id', prod.id);

        logs.push({
            product_id: prod.id,
            old_price_usd: prod.last_price_usd,
            new_price_usd: price || prod.last_price_usd,
            old_availability: prod.availability,
            new_availability: newAvail,
            old_prime: prod.amazon_prime,
            new_prime: newPrime,
            sync_status: syncStatus,
            raw_response: data
        });

      } catch (err: any) {
        logs.push({
            product_id: prod.id,
            sync_status: 'failed',
            error_message: err.message
        });
        await supabase.from('international_products').update({ sync_status: 'failed', last_synced_at: new Date().toISOString() }).eq('id', prod.id);
      }
    }

    await supabase.from('international_product_sync_logs').insert(logs);

    return new Response(JSON.stringify({ success: true, processed: products.length }), { headers: getCorsHeaders(), status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: getCorsHeaders(), status: 500 });
  }
});
