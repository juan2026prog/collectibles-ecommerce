import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const user = await verifyAdmin(req);
    
    const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");
    if (!ZINC_API_KEY) {
      throw new Error("ZINC_API_KEY no configurada");
    }

    const { 
      query, 
      brand, 
      category, 
      min_price, 
      max_price, 
      min_rating, 
      max_results = 20, 
      page = 1 
    } = await req.json();

    if (!query) {
      throw new Error("Falta el término de búsqueda (query)");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Save search history
    const { data: searchRecord, error: searchError } = await supabase
      .from('international_import_searches')
      .insert({
        query,
        brand_filter: brand,
        category_filter: category,
        min_price,
        max_price,
        min_rating,
        max_results,
        page,
        created_by: user.id
      })
      .select()
      .single();

    if (searchError) throw searchError;

    // Call Zinc API
    const zincUrl = `https://api.zinc.com/products/search?query=${encodeURIComponent(query)}&retailer=amazon&page=${page}`;
    const zincRes = await fetch(zincUrl, {
      headers: {
        'Authorization': `Bearer ${ZINC_API_KEY}`
      }
    });

    if (!zincRes.ok) {
      throw new Error(`Error de Zinc API: ${zincRes.statusText}`);
    }

    const rawResponse = await zincRes.json();
    
    // Update raw response in search
    await supabase.from('international_import_searches').update({ raw_response: rawResponse }).eq('id', searchRecord.id);

    const products = rawResponse.results || [];
    const candidates = [];

    for (const p of products) {
      if (!p.title || !p.url) continue;

      const price = p.price ? p.price / 100 : null; // zinc returns cents usually, check docs: "price: 1999"

      if (min_price && price !== null && price < min_price) continue;
      if (max_price && price !== null && price > max_price) continue;
      if (min_rating && p.stars && p.stars < min_rating) continue;
      if (brand && p.brand && !p.brand.toLowerCase().includes(brand.toLowerCase())) continue;
      
      candidates.push({
        search_id: searchRecord.id,
        external_product_id: p.product_id || p.asin,
        title: p.title,
        brand: p.brand || null,
        category: null, // Zinc might not return a clean category in search
        image_url: p.image || "https://via.placeholder.com/400?text=No+Image",
        product_url_external: p.url,
        price_usd: price,
        currency: 'USD',
        rating: p.stars || null,
        review_count: p.num_reviews || 0,
        availability: 'available',
        raw_data: p,
        status: 'review'
      });

      if (candidates.length >= max_results) break;
    }

    if (candidates.length > 0) {
      const { error: insertError } = await supabase
        .from('international_import_candidates')
        .insert(candidates);

      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({ success: true, candidates }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("zinc-search-products error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
