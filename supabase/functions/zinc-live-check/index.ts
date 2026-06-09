import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { calculateFee, calculateRealCost, calculateProfitEngine, applyProfitProtection } from "../_shared/pricing.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const { product_id } = await req.json();

    if (!product_id) throw new Error("product_id es requerido");

    const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");
    if (!ZINC_API_KEY) throw new Error("ZINC_API_KEY no configurada");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: prod } = await supabase.from('international_products').select('*').eq('id', product_id).single();
    if (!prod) throw new Error("Producto no encontrado");

    const { data: settings } = await supabase.from('international_sync_settings').select('*').eq('id', 1).single();

    const url = `https://api.zinc.com/products/${prod.external_product_id}?retailer=amazon`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${ZINC_API_KEY}` } });

    if (!res.ok) {
       throw new Error(`Zinc API error: ${res.status}`);
    }

    const data = await res.json();

    const priceRaw = data.price || (data.offers && data.offers.length > 0 ? data.offers[0].price : null);
    const newPrice = priceRaw ? priceRaw / 100 : null;

    if (!newPrice) {
      return new Response(JSON.stringify({ 
        status: 'unavailable', 
        message: 'Producto sin precio disponible' 
      }), { headers: getCorsHeaders(), status: 200 });
    }

    const pricing_mode = prod.pricing_mode || settings.pricing_mode || 'amazon_price_plus_fee';
    const fee = calculateFee(newPrice, pricing_mode, settings.fixed_markup_usd, settings.percentage_markup, settings.tiered_markup_rules);
    
    const usaShipping = Number(prod.usa_domestic_shipping_usd || 0);
    const realCost = calculateRealCost(newPrice, usaShipping, settings);
    const expectedProfit = calculateProfitEngine(realCost, settings);
    const protection = applyProfitProtection(newPrice, fee, realCost, expectedProfit, settings);

    const finalPriceWithShipping = protection.finalPrice + usaShipping;

    // Check if the price changed significantly
    const oldPrice = prod.final_price_usd;
    const variationPercent = Math.abs((finalPriceWithShipping - oldPrice) / oldPrice) * 100;

    let action = 'ok';
    let message = 'Precio validado correctamente';

    if (protection.isLoss) {
      action = 'manual_review';
      message = 'Rentabilidad por debajo del mínimo absoluto. Requiere revisión.';
    } else if (variationPercent > (settings.max_price_variation_percent || 5.0)) {
      if (settings.price_variation_action === 'manual_review') {
        action = 'manual_review';
        message = `Variación de precio mayor al ${settings.max_price_variation_percent}%. Requiere revisión manual.`;
      } else if (settings.price_variation_action === 'recalculate') {
        action = 'recalculate';
        message = 'El precio ha cambiado. Se aplicará el nuevo precio.';
      } else {
        action = 'unpublish';
        message = 'El precio varió demasiado. Producto será despublicado.';
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      action,
      message,
      new_amazon_price: newPrice,
      new_final_price_usd: finalPriceWithShipping,
      real_cost: realCost,
      expected_profit: expectedProfit,
      protection_applied: protection.isLoss
    }), { headers: getCorsHeaders(), status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: getCorsHeaders(), status: 500 });
  }
});
