import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

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
      estimated_delivery_max_days 
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

      const final_price_usd = Number(c.price_usd) + Number(usa_domestic_shipping_usd) + Number(collectibles_fee_usd);
      const final_price_uyu = final_price_usd * Number(exchange_rate);

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
          usa_domestic_shipping_usd,
          collectibles_fee_usd,
          final_price_usd,
          final_price_uyu,
          currency: c.currency,
          availability: c.availability,
          rating: c.rating,
          review_count: c.review_count,
          estimated_delivery_min_days,
          estimated_delivery_max_days,
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
