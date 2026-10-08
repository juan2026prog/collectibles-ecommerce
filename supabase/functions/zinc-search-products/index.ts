import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { resolveInternationalCategory } from "../_shared/categoryResolver.ts";
import { getNormalizedBrand } from "../_shared/brandUtils.ts";

const MAX_DEEP_RESULTS = 1000;
const MAX_PROVIDER_PAGES = 100;
const SEARCH_TIME_BUDGET_MS = 50_000;
const GENERIC_BRANDS = new Set(["generic", "unbranded", "unknown", "no brand", "n/a", "na"]);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeAsin(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function isGenericBrand(brand: string | null | undefined): boolean {
  const normalized = String(brand || "").trim().toLowerCase();
  return !normalized || GENERIC_BRANDS.has(normalized);
}

function categoryText(p: any): string {
  const categories = Array.isArray(p.categories) ? p.categories.join(" ") : String(p.categories || "");
  return `${categories} ${p.category_path || ""} ${p.category || ""} ${p.title || ""}`.toLowerCase();
}

function matchesAvailability(p: any, availability?: string): boolean {
  if (!availability) return true;
  const raw = String(p.availability || "").toLowerCase();
  if (availability === "in_stock") return raw.includes("in stock") || raw.includes("available");
  if (availability === "preorder") return raw.includes("pre-order") || raw.includes("preorder") || raw.includes("preventa");
  if (availability === "out_of_stock") return raw.includes("out of stock") || raw.includes("unavailable");
  return true;
}

function collectImageUrls(p: any): string[] {
  const urls: string[] = [];
  const add = (u: any) => {
    if (typeof u === "string") {
      const t = u.trim();
      if (t && /^https?:\/\//i.test(t) && !urls.includes(t)) urls.push(t);
    } else if (u && typeof u === "object") {
      if (typeof u.url === "string") add(u.url);
      if (typeof u.link === "string") add(u.link);
    }
  };

  add(p.image_url);
  add(p.main_image_url_external);
  add(p.image);
  if (Array.isArray(p.images)) p.images.forEach(add);
  if (Array.isArray(p.additional_images)) p.additional_images.forEach(add);
  if (Array.isArray(p.raw_data?.images)) p.raw_data.images.forEach(add);
  if (Array.isArray(p.raw_data?.additional_images)) p.raw_data.additional_images.forEach(add);
  add(p.raw_data?.image);
  add(p.raw_data?.main_image);

  return urls;
}

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const user = await verifyAdmin(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { resolveZincApiKey, searchZincProducts } = await import("../_shared/zinc/index.ts");
    let ZINC_API_KEY = "";
    try {
      ZINC_API_KEY = await resolveZincApiKey(supabase, "production");
    } catch {
      ZINC_API_KEY = await resolveZincApiKey(supabase, "sandbox");
    }

    const {
      query,
      brand,
      category,
      min_price,
      max_price,
      min_rating,
      min_reviews,
      availability,
      onlyRecognizedBrands = false,
      includeGenerics = true,
      max_results = 100,
      page = 1,
      sort_by
    } = await req.json();

    if (!query || !String(query).trim()) {
      throw new Error("Falta el término de búsqueda (query)");
    }

    const targetResults = Math.min(MAX_DEEP_RESULTS, Math.max(1, Number(max_results) || 100));
    const startPage = Math.max(1, Number(page) || 1);

    // Resilient search history persistence: must NEVER fail the search if DB insert errors
    let searchId = crypto.randomUUID();
    try {
      const { data: searchRecord, error: searchError } = await supabase
        .from("international_import_searches")
        .insert({
          query: String(query).trim(),
          brand_filter: brand || null,
          category_filter: category || null,
          min_price: min_price || null,
          max_price: max_price || null,
          min_rating: min_rating || null,
          max_results: targetResults,
          page: startPage,
          created_by: user.id
        })
        .select()
        .single();

      if (searchError) {
        console.warn("[Amazon Search] Error persisting search history record:", searchError);
      } else if (searchRecord?.id) {
        searchId = searchRecord.id;
      }
    } catch (insertErr) {
      console.warn("[Amazon Search] Unexpected exception persisting search record:", insertErr);
    }

    const [{ data: catMappings }, { data: brandMappings }, { data: keywordMappings }] = await Promise.all([
      supabase.from("amazon_category_mapping").select("*"),
      supabase.from("amazon_brand_mapping").select("*"),
      supabase.from("keyword_mapping_rules").select("*").order("priority", { ascending: false })
    ]);

    const recognizedBrands = new Set(
      (brandMappings || [])
        .filter((r: any) => r.is_active !== false && r.brand_name)
        .map((r: any) => String(r.brand_name).trim().toLowerCase())
    );

    const startedAt = Date.now();
    const uniqueProducts = new Map<string, any>();
    const rawPageStats: any[] = [];
    let providerPage = startPage;
    let pagesConsulted = 0;
    let duplicateCount = 0;
    let filteredOutCount = 0;
    let stopReason = "TARGET_REACHED";
    let consecutiveNoNew = 0;

    while (uniqueProducts.size < targetResults && pagesConsulted < MAX_PROVIDER_PAGES) {
      if (Date.now() - startedAt > SEARCH_TIME_BUDGET_MS) {
        stopReason = "TIME_BUDGET";
        break;
      }

      let rawResponse: any = null;
      let lastError: any = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          rawResponse = await searchZincProducts(ZINC_API_KEY, {
            query: String(query).trim(),
            retailer: "amazon",
            page: providerPage
          });
          lastError = null;
          break;
        } catch (err: any) {
          lastError = err;
          // Only back off if rate limited (429); do not blind retry 400s
          if (!String(err?.message || "").includes("HTTP 429") || attempt === 2) break;
          await sleep(350 * Math.pow(2, attempt));
        }
      }

      // If page error occurs:
      // If we already collected products on previous pages, deliver partial results gracefully!
      if (lastError) {
        if (uniqueProducts.size > 0) {
          console.warn(`[Amazon Search] Provider error on page ${providerPage}, returning partial results:`, lastError?.message);
          stopReason = "PROVIDER_ERROR";
          break;
        }
        throw lastError;
      }

      pagesConsulted++;
      const products = Array.isArray(rawResponse?.results) ? rawResponse.results : [];
      rawPageStats.push({ page: providerPage, returned: products.length });

      if (products.length === 0) {
        stopReason = "PROVIDER_EXHAUSTED";
        break;
      }

      let newOnPage = 0;

      for (const p of products) {
        if (!p?.title || !p?.product_id) continue;

        const asin = normalizeAsin(p.product_id);
        if (!asin) continue;

        if (uniqueProducts.has(asin)) {
          duplicateCount++;
          continue;
        }

        const price = p.price != null ? Number(p.price) / 100 : null;

        if (min_price && price !== null && price < Number(min_price)) { filteredOutCount++; continue; }
        if (max_price && price !== null && price > Number(max_price)) { filteredOutCount++; continue; }
        if (min_rating && Number(p.stars || 0) < Number(min_rating)) { filteredOutCount++; continue; }
        if (min_reviews && Number(p.num_reviews || 0) < Number(min_reviews)) { filteredOutCount++; continue; }
        if (!matchesAvailability(p, availability)) { filteredOutCount++; continue; }

        const normalizedBrand = getNormalizedBrand({
          brand: p.brand || p.raw_data?.brand,
          manufacturer: p.manufacturer || p.raw_data?.manufacturer,
          title: p.title
        });

        if (brand && String(brand).trim()) {
          const target = String(brand).toLowerCase().trim();
          const brandMatch =
            (normalizedBrand && normalizedBrand.toLowerCase().includes(target)) ||
            (p.brand && String(p.brand).toLowerCase().includes(target)) ||
            (p.manufacturer && String(p.manufacturer).toLowerCase().includes(target)) ||
            String(p.title).toLowerCase().includes(target);

          if (!brandMatch) { filteredOutCount++; continue; }
        }

        if (category && String(category).trim()) {
          const targetCategory = String(category).toLowerCase().trim();
          if (!categoryText(p).includes(targetCategory)) { filteredOutCount++; continue; }
        }

        const generic = isGenericBrand(normalizedBrand);
        const recognized = !generic && recognizedBrands.has(String(normalizedBrand).trim().toLowerCase());

        if (onlyRecognizedBrands) {
          if (!(recognized || (includeGenerics && generic))) { filteredOutCount++; continue; }
        } else if (!includeGenerics && generic) {
          filteredOutCount++;
          continue;
        }

        uniqueProducts.set(asin, { ...p, __asin: asin, __normalizedBrand: normalizedBrand });
        newOnPage++;
        if (uniqueProducts.size >= targetResults) break;
      }

      // Check if provider signals end of results
      if (rawResponse.next_page === null || rawResponse.next_page === undefined) {
        stopReason = "PROVIDER_EXHAUSTED";
        break;
      }

      consecutiveNoNew = newOnPage === 0 ? consecutiveNoNew + 1 : 0;
      if (consecutiveNoNew >= 3) {
        stopReason = "NO_NEW_RESULTS";
        break;
      }

      providerPage++;
      if (uniqueProducts.size < targetResults) await sleep(100);
    }

    if (pagesConsulted >= MAX_PROVIDER_PAGES && uniqueProducts.size < targetResults && stopReason === "TARGET_REACHED") {
      stopReason = "PAGE_LIMIT";
    }

    let selectedProducts = Array.from(uniqueProducts.values());

    if (sort_by === "price_asc") {
      selectedProducts.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sort_by === "price_desc") {
      selectedProducts.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (sort_by === "rating_desc") {
      selectedProducts.sort((a, b) => Number(b.stars || 0) - Number(a.stars || 0));
    } else if (sort_by === "reviews_desc") {
      selectedProducts.sort((a, b) => Number(b.num_reviews || 0) - Number(a.num_reviews || 0));
    }

    selectedProducts = selectedProducts.slice(0, targetResults);
    const candidates: any[] = [];

    for (const p of selectedProducts) {
      const asin = normalizeAsin(p.__asin || p.product_id);
      const normalizedBrand = p.__normalizedBrand || null;
      const price = p.price != null ? Number(p.price) / 100 : null;
      const imageUrls = collectImageUrls(p).filter(u =>
        !u.includes("example.jpg") &&
        !u.includes("xyz.jpg") &&
        !u.toLowerCase().includes("placeholder")
      );
      const normalizedImageUrl = imageUrls[0] || null;

      const resolution = resolveInternationalCategory({
        category_path: p.categories || p.category_path || null,
        brand: normalizedBrand,
        title: p.title,
        category_mappings: catMappings || [],
        brand_mappings: brandMappings || [],
        keyword_rules: keywordMappings || []
      });

      let amazon_delivery_type = "unknown";
      let amazon_delivery_text = "Plazo doméstico USA pendiente de confirmación";
      const availLow = String(p.availability || "").toLowerCase();

      if (p.prime) {
        amazon_delivery_type = "prime";
        amazon_delivery_text = p.delivery_message || "Envío Prime";
      } else if (availLow.includes("pre-order") || availLow.includes("preorder")) {
        amazon_delivery_type = "preorder";
        amazon_delivery_text = p.availability || "Preventa";
      } else if (availLow.includes("in stock") || availLow.includes("available")) {
        amazon_delivery_type = "in_stock";
        amazon_delivery_text = p.delivery_message || "En stock";
      } else if (availLow.includes("backorder") || availLow.includes("out of stock")) {
        amazon_delivery_type = "backorder";
        amazon_delivery_text = p.availability || "Backorder / Sin stock";
      } else if (p.delivery_message) {
        amazon_delivery_text = p.delivery_message;
      }

      const enrichedRawData = {
        ...p,
        __asin: undefined,
        __normalizedBrand: undefined,
        search_context: {
          search_id: searchId,
          query: String(query).trim(),
          requested_results: targetResults,
          provider_pages_consulted: pagesConsulted,
          only_recognized_brands: Boolean(onlyRecognizedBrands),
          include_generics: Boolean(includeGenerics)
        },
        _normalized: {
          brand: normalizedBrand,
          manufacturer: p.manufacturer || p.raw_data?.manufacturer || null,
          imageUrl: normalizedImageUrl,
          imageUrls,
          category_detected: p.categories || null,
          category_inferred: resolution.source !== "unmapped",
          amazon_delivery_type,
          amazon_delivery_text
        }
      };

      candidates.push({
        id: `ephemeral_${asin}`,
        search_id: searchId,
        external_product_id: asin,
        title: p.title,
        brand: normalizedBrand,
        category: null,
        image_url: normalizedImageUrl,
        main_image_url_external: normalizedImageUrl,
        image_urls_external: imageUrls,
        product_url_external: `https://www.amazon.com/dp/${asin}`,
        price_usd: price,
        currency: "USD",
        rating: p.stars || null,
        review_count: p.num_reviews || 0,
        availability: p.availability || "unknown",
        prime: Boolean(p.prime),
        amazon_delivery_text,
        amazon_delivery_type,
        raw_data: enrichedRawData,
        status: "review",
        suggested_category_id: resolution.category_id,
        suggested_subcategory_id: resolution.subcategory_id,
        mapping_confidence: resolution.confidence,
        category_mapping_source: resolution.source,
        data_origin: "LIVE"
      });
    }

    const summary = {
      pages_consulted: pagesConsulted,
      page_stats: rawPageStats,
      unique_results: candidates.length,
      duplicate_count: duplicateCount,
      filtered_out_count: filteredOutCount,
      stop_reason: stopReason,
      elapsed_ms: Date.now() - startedAt
    };

    // Update history record if one exists, silently warning on failure
    try {
      await supabase
        .from("international_import_searches")
        .update({ raw_response: summary })
        .eq("id", searchId);
    } catch (updateErr) {
      console.warn("[Amazon Search] Non-critical error updating search summary:", updateErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: "amazon",
        results: candidates,
        candidates,
        meta: {
          total: candidates.length,
          search_id: searchId,
          requested: targetResults,
          pages_consulted: pagesConsulted,
          duplicate_count: duplicateCount,
          filtered_out_count: filteredOutCount,
          stop_reason: stopReason,
          provider_limited: candidates.length < targetResults && stopReason !== "TARGET_REACHED"
        }
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("zinc-search-products error:", error);
    const errorMessage = String(error?.message || error || "Error desconocido al buscar productos");
    return new Response(
      JSON.stringify({
        success: false,
        code: "ZINC_SEARCH_ERROR",
        error: errorMessage,
        message: errorMessage
      }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
