import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { resolveInternationalCategory } from "../_shared/categoryResolver.ts";

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

    // Fetch Mapping Rules for Centralized Resolver
    const [{ data: catMappings }, { data: brandMappings }, { data: keywordMappings }] = await Promise.all([
      supabase.from('amazon_category_mapping').select('*'),
      supabase.from('amazon_brand_mapping').select('*'),
      supabase.from('keyword_mapping_rules').select('*').order('priority', { ascending: false })
    ]);

    const inferBrandFromTitle = (title: string) => {
      const t = title.toLowerCase();
      if (t.includes('pokemon') || t.includes('pokémon')) return 'Pokémon';
      if (t.includes('neca')) return 'NECA';
      if (t.includes('funko')) return 'Funko';
      if (t.includes('hasbro')) return 'Hasbro';
      if (t.includes('marvel')) return 'Marvel';
      if (t.includes('star wars')) return 'Star Wars';
      if (t.includes('dc multiverse') || t.includes('dc comics')) return 'DC Comics';
      if (t.includes('lego')) return 'LEGO';
      if (t.includes('bandai')) return 'Bandai';
      if (t.includes('mcfarlane')) return 'McFarlane Toys';
      return null;
    };

    const products = rawResponse.results || [];
    const candidates = [];

    for (const p of products) {
      if (!p.title || !p.product_id) continue;

      const price = p.price ? p.price / 100 : null;

      if (min_price && price !== null && price < min_price) continue;
      if (max_price && price !== null && price > max_price) continue;
      if (min_rating && p.stars && p.stars < min_rating) continue;
      
      // Normalize Brand
      let normalizedBrand = p.brand || p.manufacturer || p.raw_data?.brand || p.raw_data?.manufacturer || inferBrandFromTitle(p.title) || null;
      if (brand && normalizedBrand && !normalizedBrand.toLowerCase().includes(brand.toLowerCase())) continue;

      // Normalize Image
      const normalizedImageUrl = p.image_url || p.main_image_url_external || p.image || p.raw_data?.image || p.raw_data?.main_image || p.raw_data?.images?.[0] || null;

      // Centralized Category Resolution
      const resolution = resolveInternationalCategory({
        category_path: p.categories || p.category_path || null,
        brand: normalizedBrand,
        title: p.title,
        category_mappings: catMappings || [],
        brand_mappings: brandMappings || [],
        keyword_rules: keywordMappings || []
      });

      // Delivery Information Parsing
      let amazon_delivery_type = 'unknown';
      let amazon_delivery_text = 'Tiempo de entrega no informado por Amazon';

      const availLow = (p.availability || '').toLowerCase();
      const delivLow = (p.delivery_message || '').toLowerCase();
      
      if (p.prime) {
        amazon_delivery_type = 'prime';
        amazon_delivery_text = p.delivery_message || 'Envío Prime';
      } else if (availLow.includes('pre-order') || availLow.includes('preorder')) {
        amazon_delivery_type = 'preorder';
        amazon_delivery_text = p.availability || 'Preventa';
      } else if (availLow.includes('in stock') || availLow.includes('available')) {
        amazon_delivery_type = 'in_stock';
        amazon_delivery_text = p.delivery_message || 'En stock';
      } else if (availLow.includes('backorder') || availLow.includes('out of stock')) {
        amazon_delivery_type = 'backorder';
        amazon_delivery_text = p.availability || 'Backorder / Sin stock';
      } else if (p.delivery_message) {
        amazon_delivery_text = p.delivery_message;
        amazon_delivery_type = 'unknown';
      }

      // Populate _normalized
      const enrichedRawData = {
        ...p,
        _normalized: {
          brand: normalizedBrand,
          manufacturer: p.manufacturer || p.raw_data?.manufacturer || null,
          imageUrl: normalizedImageUrl,
          category_detected: p.categories || null,
          category_inferred: resolution.source !== 'unmapped',
          amazon_delivery_type,
          amazon_delivery_text
        }
      };

      candidates.push({
        search_id: searchRecord.id,
        external_product_id: p.product_id,
        title: p.title,
        brand: normalizedBrand,
        category: null, 
        image_url: normalizedImageUrl,
        main_image_url_external: normalizedImageUrl,
        image_urls_external: normalizedImageUrl ? [normalizedImageUrl] : [],
        product_url_external: `https://www.amazon.com/dp/${p.product_id}`,
        price_usd: price,
        currency: 'USD',
        rating: p.stars || null,
        review_count: p.num_reviews || 0,
        availability: 'available',
        amazon_delivery_text,
        amazon_delivery_type,
        raw_data: enrichedRawData,
        status: 'review',
        suggested_category_id: resolution.category_id,
        suggested_subcategory_id: resolution.subcategory_id,
        mapping_confidence: resolution.confidence,
        category_mapping_source: resolution.source
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
