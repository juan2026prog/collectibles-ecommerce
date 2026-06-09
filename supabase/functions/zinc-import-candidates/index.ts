import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { calculateFee, calculateDiscount, calculateRealCost, calculateProfitEngine, applyProfitProtection, calculateUruboxEstimate } from "../_shared/pricing.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    await verifyAdmin(req);
    
    const { 
      candidate_ids, 
      collectibles_fee_usd, 
      usa_domestic_shipping_usd, 
      exchange_rate, 
      estimated_delivery_min_days, 
      estimated_delivery_max_days,
      target_category_id,
      target_subcategory_id
    } = await req.json();

    if (!Array.isArray(candidate_ids) || candidate_ids.length === 0) {
      throw new Error("No hay candidatos seleccionados");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: candidates, error: candidatesError } = await supabase
      .from('international_import_candidates')
      .select('*')
      .in('id', candidate_ids);

    if (candidatesError) throw candidatesError;

    let importedCount = 0;
    let skippedCount = 0;

    // Fetch Settings for Pricing Mode once
    const { data: settings } = await supabase.from('international_sync_settings').select('*').eq('id', 1).single();

    for (const c of candidates) {
      if (c.price_usd == null) {
        skippedCount++;
        continue;
      }
      if (!c.product_url_external) {
        skippedCount++;
        continue;
      }

      // Check duplicates
      const { count } = await supabase
        .from('international_products')
        .select('id', { count: 'exact', head: true })
        .eq('product_url_external', c.product_url_external);

      if (count && count > 0) {
        skippedCount++;
        continue;
      }

      const amazon_current_price_usd = Number(c.price_usd);
      
      let rawListPrice = c.raw_data?.msrp ? c.raw_data.msrp / 100 : null;
      if (!rawListPrice && c.raw_data?.price && c.raw_data.offers && c.raw_data.offers[0]?.price) {
        // sometimes price is MSRP and offers is current price
        rawListPrice = Math.max(c.raw_data.price / 100, c.raw_data.offers[0].price / 100);
      }
      
      const amazon_list_price_usd = rawListPrice && rawListPrice > amazon_current_price_usd ? rawListPrice : null;
      const amazon_discount_percent = calculateDiscount(amazon_current_price_usd, amazon_list_price_usd);

      // Compute fee
      const calculated_fee = settings ? calculateFee(amazon_current_price_usd, settings.pricing_mode, settings.fixed_markup_usd, settings.percentage_markup, settings.tiered_markup_rules) : Number(collectibles_fee_usd);
      
      const usaShipping = Number(usa_domestic_shipping_usd);
      const realCost = settings ? calculateRealCost(amazon_current_price_usd, usaShipping, settings as any) : (amazon_current_price_usd + usaShipping);
      const expectedProfit = settings ? calculateProfitEngine(realCost, settings as any) : calculated_fee;
      
      const protection = settings ? applyProfitProtection(amazon_current_price_usd, calculated_fee, realCost, expectedProfit, settings as any) : { finalPrice: amazon_current_price_usd + usaShipping + calculated_fee, finalFee: calculated_fee, isLoss: false };

      const final_price_usd = protection.finalPrice + usaShipping; // The finalPrice from applyProfitProtection might just be amazon + fee, we need to ensure shipping is handled, actually applyProfitProtection takes currentBasePrice=amazon, currentFee=fee. So the final item price should include shipping.
      
      const finalPriceWithShipping = protection.finalPrice + usaShipping;
      const final_price_uyu = finalPriceWithShipping * Number(exchange_rate);

      // Estimate Urubox
      const urubox_estimated_cost_usd = settings ? calculateUruboxEstimate(null, c.category, settings as any) : 0;
      const total_estimated_cost_usd = finalPriceWithShipping + urubox_estimated_cost_usd;

      const categoryToUse = target_category_id || c.suggested_category_id || null;
      const subcategoryToUse = target_subcategory_id || c.suggested_subcategory_id || null;

      const { error: insertError } = await supabase
        .from('international_products')
        .insert({
          source_provider: c.provider,
          source_retailer: c.retailer,
          external_product_id: c.external_product_id,
          title: c.title,
          brand: c.brand,
          category: c.category,
          image_url: c.image_url,
          product_url_external: c.product_url_external,
          base_price_usd: c.price_usd,
          amazon_current_price_usd,
          amazon_list_price_usd,
          amazon_discount_percent,
          pricing_mode: settings?.pricing_mode || 'amazon_price_plus_fee',
          usa_domestic_shipping_usd: usaShipping,
          collectibles_fee_usd: protection.finalFee,
          final_price_usd: finalPriceWithShipping,
          final_price_uyu,
          currency: c.currency,
          expected_profit_usd: expectedProfit,
          urubox_estimated_cost_usd,
          total_estimated_cost_usd,
          real_cost_usd: realCost,
          availability: c.availability,
          rating: c.rating,
          review_count: c.review_count,
          estimated_delivery_min_days,
          estimated_delivery_max_days,
          collectibles_category_id: categoryToUse,
          collectibles_subcategory_id: subcategoryToUse,
          gallery_images: c.raw_data?.images || [],
          video_urls: c.raw_data?.videos || [],
          external_sku: c.external_product_id,
          status: 'draft',
          raw_data: c.raw_data
        });

      if (insertError) {
        console.error("Error inserting product:", insertError);
        skippedCount++;
        continue;
      }

      // Mark as imported
      await supabase.from('international_import_candidates').update({ status: 'imported' }).eq('id', c.id);
      importedCount++;
    }

    return new Response(
      JSON.stringify({ success: true, imported: importedCount, skipped: skippedCount }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("zinc-import-candidates error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
