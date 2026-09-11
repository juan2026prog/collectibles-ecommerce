import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// ================================================================
// SOURCING BEST BUY SEARCH — EDGE FUNCTION
// Server-side only. BESTBUY_API_KEY never exposed to frontend.
// Hybrid Architecture: Best Buy API for Discovery & Lookup,
// Zinc Managed Accounts for Purchasing (Sandbox).
// ================================================================

const BESTBUY_BASE_URL = "https://api.bestbuy.com/v1";

interface BestBuySearchRequest {
  query: string;
  sku?: string;
  upc?: string;
  max_results?: number;
  page?: number;
}

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);
  const startedAt = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let body: BestBuySearchRequest = { query: "" };
    try {
      body = await req.json();
    } catch {
      // Empty body fallback
    }

    const { query = "", sku, upc, max_results = 25, page = 1 } = body;
    const cleanQuery = query.trim();

    // 1. Resolve Best Buy API Key
    let bestBuyApiKey = Deno.env.get("BESTBUY_API_KEY") || "";

    if (!bestBuyApiKey) {
      try {
        const { data: vaultKey } = await supabase.rpc("get_zinc_vault_secret", {
          p_environment: "production",
          p_secret_type: "bestbuy_api_key",
        });
        if (vaultKey && typeof vaultKey === "string") {
          bestBuyApiKey = vaultKey.trim();
        }
      } catch {
        // Vault key not configured
      }
    }

    // If no API key is available, return honest status PENDING_KEY with 0 fake results
    if (!bestBuyApiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          status: "PENDING_KEY",
          retailer: "bestbuy",
          message: "Best Buy API Key pendiente de configuración en Supabase Secrets (BESTBUY_API_KEY).",
          results: [],
          total: 0,
          elapsed_ms: Date.now() - startedAt,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!cleanQuery && !sku && !upc) {
      return new Response(
        JSON.stringify({
          success: true,
          status: "READY",
          retailer: "bestbuy",
          results: [],
          total: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Build Best Buy Developer API URL
    let apiUrl = "";
    const showFields = "sku,name,salePrice,regularPrice,upc,url,image,largeFrontImage,inStoreAvailability,onlineAvailability,manufacturer,modelNumber,categoryPath,shortDescription";

    if (sku || /^\d{6,8}$/.test(cleanQuery)) {
      const targetSku = sku || cleanQuery;
      apiUrl = `${BESTBUY_BASE_URL}/products/${encodeURIComponent(targetSku)}.json?apiKey=${encodeURIComponent(bestBuyApiKey)}&show=${showFields}`;
    } else if (upc) {
      apiUrl = `${BESTBUY_BASE_URL}/products(upc=${encodeURIComponent(upc)})?apiKey=${encodeURIComponent(bestBuyApiKey)}&format=json&show=${showFields}&pageSize=${max_results}&page=${page}`;
    } else {
      // Keyword search
      const sanitizedWords = cleanQuery.replace(/[^a-zA-Z0-9\s]/g, " ").trim().split(/\s+/).join("&search=");
      apiUrl = `${BESTBUY_BASE_URL}/products(search=${sanitizedWords})?apiKey=${encodeURIComponent(bestBuyApiKey)}&format=json&show=${showFields}&pageSize=${max_results}&page=${page}`;
    }

    const bbyRes = await fetch(apiUrl, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!bbyRes.ok) {
      const errData = await bbyRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          success: false,
          status: "ERROR",
          retailer: "bestbuy",
          error_code: bbyRes.status,
          message: errData?.error?.message || errData?.errorMessage || `Best Buy API responded HTTP ${bbyRes.status}`,
          results: [],
          elapsed_ms: Date.now() - startedAt,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await bbyRes.json();
    let rawProducts: any[] = [];

    if (Array.isArray(data?.products)) {
      rawProducts = data.products;
    } else if (data?.sku) {
      // Single product lookup response
      rawProducts = [data];
    }

    // 3. Normalize products to standard Sourcing schema
    const results = rawProducts.map((p: any) => {
      const skuStr = String(p.sku || "");
      const effectivePrice = Number(p.salePrice ?? p.regularPrice ?? 0);
      const domesticShipping = effectivePrice >= 35 ? 0 : 4.99; // Best Buy standard policy ($35+ free shipping)

      return {
        url: p.url || `https://www.bestbuy.com/site/${skuStr}.p?skuId=${skuStr}`,
        retailer: "bestbuy",
        source_product_id: skuStr,
        title: p.name || `Best Buy Item ${skuStr}`,
        price: effectivePrice,
        regular_price: Number(p.regularPrice ?? effectivePrice),
        brand: p.manufacturer || "Best Buy",
        upc: p.upc || null,
        model: p.modelNumber || null,
        image_url: p.largeFrontImage || p.image || null,
        availability: p.onlineAvailability === true || p.inStoreAvailability === true ? "in_stock" : "out_of_stock",
        stock: p.onlineAvailability === true ? 10 : 0,
        condition: "new",
        domestic_shipping: domesticShipping,
        estimated_delivery: "3-5 días (USA)",
        is_zinc_compatible: true,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        status: "AVAILABLE",
        retailer: "bestbuy",
        query: cleanQuery,
        total: data.total || results.length,
        results,
        elapsed_ms: Date.now() - startedAt,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (err: any) {
    console.error("sourcing-bestbuy-search error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        status: "ERROR",
        retailer: "bestbuy",
        message: err.message || "Error al consultar Best Buy",
        results: [],
        elapsed_ms: Date.now() - startedAt,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
