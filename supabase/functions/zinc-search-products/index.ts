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
      page = 1,
      sort_by
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
    let zincUrl = `https://api.zinc.com/products/search?query=${encodeURIComponent(query)}&retailer=amazon&page=${page}`;
    if (sort_by) zincUrl += `&sort=${sort_by}`;
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

    // Fetch Mapping Rules and Categories for Heuristics
    const [{ data: brandMappings }, { data: keywordMappings }, { data: dbCategories }] = await Promise.all([
      supabase.from('amazon_brand_mapping').select('*'),
      supabase.from('keyword_mapping_rules').select('*').order('priority', { ascending: false }),
      supabase.from('categories').select('*')
    ]);

    const categories = dbCategories || [];
    const getCategoryId = (name: string, parentName?: string) => {
      let cat = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (cat && parentName) {
        // optionally check parent if we want to be strict
        const parent = categories.find(c => c.id === cat.parent_id);
        if (parent && parent.name.toLowerCase() !== parentName.toLowerCase()) {
           cat = categories.find(c => c.name.toLowerCase() === name.toLowerCase() && c.parent_id);
        }
      }
      return cat?.id || null;
    };

    const products = rawResponse.results || [];
    const candidates = [];

    for (const p of products) {
      if (!p.title || !p.product_id) continue;

      const price = p.price ? p.price / 100 : null;

      if (min_price && price !== null && price < min_price) continue;
      if (max_price && price !== null && price > max_price) continue;
      if (min_rating && p.stars && p.stars < min_rating) continue;
      if (brand && p.brand && !p.brand.toLowerCase().includes(brand.toLowerCase())) continue;
      
      let suggested_category_id = null;
      let suggested_subcategory_id = null;
      let mapping_confidence = 0;

      // 1. Check brand mapping
      if (p.brand) {
        const bMap = brandMappings?.find(b => b.brand_name.toLowerCase() === p.brand.toLowerCase());
        if (bMap) {
          suggested_category_id = bMap.collectibles_category_id;
          suggested_subcategory_id = bMap.collectibles_subcategory_id;
          mapping_confidence = bMap.confidence_score || 90;
        }
      }

      // 2. Check keyword mapping
      if (!suggested_category_id && p.title) {
        const titleLower = p.title.toLowerCase();
        for (const kMap of keywordMappings || []) {
          if (titleLower.includes(kMap.keyword.toLowerCase())) {
            suggested_category_id = kMap.target_category_id;
            suggested_subcategory_id = kMap.target_subcategory_id;
            mapping_confidence = 80;
            break;
          }
        }
      }

      // 3. Fallback Heuristics
      if (!suggested_category_id) {
        const titleL = p.title.toLowerCase();
        const brandL = (p.brand || '').toLowerCase();
        
        const figParent = getCategoryId('Figuras') || getCategoryId('Figuras / Coleccionables');
        const indParent = getCategoryId('Indumentaria') || getCategoryId('Ropa');

        if (brandL.includes('pokemon') || titleL.includes('pokemon')) {
          suggested_category_id = figParent;
          suggested_subcategory_id = getCategoryId('Pokémon');
          mapping_confidence = 70;
        } else if (brandL === 'neca') {
          suggested_category_id = figParent;
          suggested_subcategory_id = getCategoryId('NECA');
          mapping_confidence = 70;
        } else if (brandL === 'funko' || titleL.includes('funko pop')) {
          suggested_category_id = figParent;
          suggested_subcategory_id = getCategoryId('Funko POP') || getCategoryId('Funko');
          mapping_confidence = 70;
        } else if (titleL.includes('marvel legends')) {
          suggested_category_id = figParent;
          suggested_subcategory_id = getCategoryId('Marvel Legends') || getCategoryId('Marvel');
          mapping_confidence = 70;
        } else if (titleL.includes('black series') && titleL.includes('star wars')) {
          suggested_category_id = figParent;
          suggested_subcategory_id = getCategoryId('Star Wars Black Series') || getCategoryId('Star Wars');
          mapping_confidence = 70;
        } else if (titleL.includes('t-shirt') || titleL.includes('hoodie') || titleL.includes('jacket') || titleL.includes('cap')) {
          suggested_category_id = indParent;
          // No subcategory inferred for now
          mapping_confidence = 60;
        }
      }

      candidates.push({
        search_id: searchRecord.id,
        external_product_id: p.product_id,
        title: p.title,
        brand: p.brand || null,
        category: null, 
        image_url: p.image || null,
        main_image_url_external: p.image || null,
        image_urls_external: p.image ? [p.image] : [],
        product_url_external: `https://www.amazon.com/dp/${p.product_id}`,
        price_usd: price,
        currency: 'USD',
        rating: p.stars || null,
        review_count: p.num_reviews || 0,
        availability: 'available',
        raw_data: p,
        status: 'review',
        suggested_category_id,
        suggested_subcategory_id,
        mapping_confidence
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
