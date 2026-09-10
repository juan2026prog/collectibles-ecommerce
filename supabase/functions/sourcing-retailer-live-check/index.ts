import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { resolveZincApiKey } from "../_shared/zinc/index.ts";

// ================================================================
// SOURCING RETAILER LIVE CHECK — Fase 1
// Unified live check endpoint for Amazon, eBay, Best Buy via Zinc.
// Honest status reporting: LIVE | CACHE | NOT_CONFIGURED | ERROR
// Server-side only. ZINC_API_KEY never exposed to frontend.
// ================================================================

const ZINC_BASE_URL = "https://api.zinc.com";
const MIAMI_DELIVERY_DAYS = { min: 2, max: 5 }; // Baseline days for Miami delivery

type DataSource = "LIVE" | "CACHE" | "NOT_CONFIGURED" | "ERROR" | "RESEARCH_DATA";
type ConditionNormalized = "NEW" | "USED" | "OPEN_BOX" | "REFURBISHED" | "UNKNOWN";
type AvailabilityNormalized = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "PREORDER" | "BACKORDER" | "UNKNOWN";
type FreshnessStatus = "LIVE" | "FRESH" | "STALE" | "UNKNOWN";

interface LiveCheckRequest {
  product_id: string;        // ASIN | eBay ItemID | Best Buy SKU
  retailer: "amazon" | "ebay" | "bestbuy";
  force_refresh?: boolean;
  include_offers?: boolean;  // Include all seller offers from Zinc
}

interface NormalizedLiveOffer {
  source: string;
  source_product_id: string;
  title: string;
  brand?: string;
  upc?: string;
  mpn?: string;
  price_usd: number;
  currency: string;
  condition_normalized: ConditionNormalized;
  availability_normalized: AvailabilityNormalized;
  seller: string;
  seller_rating?: number;
  seller_reviews?: number;
  fulfilled_by_retailer: boolean;
  sold_by_retailer: boolean;
  usa_shipping_usd: number;
  delivery_min?: string;      // ISO date
  delivery_max?: string;      // ISO date
  delivery_source?: string;
  estimated_weight_lbs?: number;
  weight_status: "KNOWN" | "UNKNOWN";
  image_url?: string;
  product_url: string;
  freshness_status: FreshnessStatus;
  last_checked_at: string;
  data_source: DataSource;
  error_message?: string;
  raw_zinc_data?: any;
}

interface RetailerCapabilities {
  retailer: string;
  search_status: string;
  product_status: string;
  price_status: string;
  stock_status: string;
  seller_status: string;
  delivery_status: string;
  live_check_available: boolean;
}

// ── Normalize Zinc condition to our enum ──────────────────────────────────────
function normalizeCondition(zincCondition?: string): ConditionNormalized {
  if (!zincCondition) return "UNKNOWN";
  const c = zincCondition.toLowerCase().trim();
  if (c === "new" || c === "brand new" || c === "factory new") return "NEW";
  if (c === "open box" || c === "open-box" || c === "open_box") return "OPEN_BOX";
  if (c === "used" || c === "good" || c === "very good" || c === "acceptable" || c === "fair") return "USED";
  if (c === "refurbished" || c === "certified refurbished" || c === "seller refurbished") return "REFURBISHED";
  return "UNKNOWN";
}

// ── Normalize availability to our enum ───────────────────────────────────────
function normalizeAvailability(zinc?: any): AvailabilityNormalized {
  if (!zinc) return "UNKNOWN";
  const available = zinc.add_on_item === false
    ? (zinc.price !== undefined && zinc.price !== null)
    : zinc.available;
  if (available === false) return "OUT_OF_STOCK";
  if (zinc.stock_quantity !== undefined) {
    if (zinc.stock_quantity === 0) return "OUT_OF_STOCK";
    if (zinc.stock_quantity <= 3) return "LOW_STOCK";
    return "IN_STOCK";
  }
  if (available === true) return "IN_STOCK";
  return "UNKNOWN";
}

// ── Compute Miami delivery range from today ───────────────────────────────────
function computeDeliveryRange(zincData?: any): { delivery_min?: string; delivery_max?: string; delivery_source: string } {
  const today = new Date();

  // Try to parse from Zinc shipping message or delivery dates
  if (zincData?.buy_box?.shipping_message) {
    const msg: string = zincData.buy_box.shipping_message;
    // e.g. "Get it by Thursday, Sep 15" or "Arrives Sep 13–15"
    const dateRangeMatch = msg.match(/(\w{3})\s+(\d{1,2})[\s–-]+(\d{1,2})/);
    if (dateRangeMatch) {
      const month = dateRangeMatch[1];
      const minDay = parseInt(dateRangeMatch[2]);
      const maxDay = parseInt(dateRangeMatch[3]);
      const year = today.getFullYear();
      try {
        const minDate = new Date(`${month} ${minDay} ${year}`);
        const maxDate = new Date(`${month} ${maxDay} ${year}`);
        return {
          delivery_min: minDate.toISOString().split("T")[0],
          delivery_max: maxDate.toISOString().split("T")[0],
          delivery_source: "zinc_shipping_message"
        };
      } catch { /* fallthrough */ }
    }
  }

  // Fallback: compute from baseline Miami delivery days
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + MIAMI_DELIVERY_DAYS.min);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + MIAMI_DELIVERY_DAYS.max);

  return {
    delivery_min: minDate.toISOString().split("T")[0],
    delivery_max: maxDate.toISOString().split("T")[0],
    delivery_source: "baseline_estimate"
  };
}

// ── Get seller trust signals from Zinc data ───────────────────────────────────
function extractSellerSignals(zincData: any, retailer: string): {
  seller: string;
  seller_rating?: number;
  seller_reviews?: number;
  fulfilled_by_retailer: boolean;
  sold_by_retailer: boolean;
} {
  const buyBox = zincData?.buy_box || {};
  const seller = buyBox.seller_name || buyBox.merchant_name || (retailer === "amazon" ? "Amazon.com" : retailer);

  // Detect sold/fulfilled by official retailer
  const sellerLower = seller.toLowerCase();
  const soldByRetailer =
    sellerLower.includes("amazon.com") ||
    sellerLower.includes("best buy") ||
    retailer === "bestbuy";
  const fulfilledByRetailer =
    buyBox.prime === true ||
    soldByRetailer ||
    sellerLower.includes("fulfilled by amazon") ||
    sellerLower.includes("fba");

  // eBay seller feedback
  let seller_rating: number | undefined;
  let seller_reviews: number | undefined;
  if (zincData?.seller?.feedback_score !== undefined) {
    seller_rating = Math.min(100, Number(zincData.seller.feedback_score));
    seller_reviews = zincData.seller.feedback_count;
  } else if (buyBox.seller_num_ratings) {
    seller_reviews = buyBox.seller_num_ratings;
  }

  return { seller, seller_rating, seller_reviews, fulfilled_by_retailer: fulfilledByRetailer, sold_by_retailer: soldByRetailer };
}

// ── Build NOT_CONFIGURED response ─────────────────────────────────────────────
function buildNotConfiguredResponse(retailer: string, product_id: string): NormalizedLiveOffer {
  return {
    source: retailer,
    source_product_id: product_id,
    title: "",
    price_usd: 0,
    currency: "USD",
    condition_normalized: "UNKNOWN",
    availability_normalized: "UNKNOWN",
    seller: "",
    fulfilled_by_retailer: false,
    sold_by_retailer: false,
    usa_shipping_usd: 0,
    weight_status: "UNKNOWN",
    product_url: "",
    freshness_status: "UNKNOWN",
    last_checked_at: new Date().toISOString(),
    data_source: "NOT_CONFIGURED",
    error_message: `Live check for ${retailer} is not configured. Zinc multi-retailer account required.`
  };
}

// ── Main: Live check via Zinc API ─────────────────────────────────────────────
async function zincLiveCheck(
  product_id: string,
  retailer: string,
  zincApiKey: string
): Promise<NormalizedLiveOffer> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const url = `${ZINC_BASE_URL}/products/${encodeURIComponent(product_id)}?retailer=${retailer}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${zincApiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(15000) // 15s timeout
    });

    const elapsed = Date.now() - startedAt;

    // Handle Zinc-specific error codes
    if (res.status === 404) {
      return {
        source: retailer,
        source_product_id: product_id,
        title: "",
        price_usd: 0,
        currency: "USD",
        condition_normalized: "UNKNOWN",
        availability_normalized: "OUT_OF_STOCK",
        seller: "",
        fulfilled_by_retailer: false,
        sold_by_retailer: false,
        usa_shipping_usd: 0,
        weight_status: "UNKNOWN",
        product_url: buildProductUrl(product_id, retailer),
        freshness_status: "LIVE",
        last_checked_at: checkedAt,
        data_source: "LIVE",
        error_message: "Product not found on retailer"
      };
    }

    // Retailer not supported by this Zinc account
    if (res.status === 400 || res.status === 422) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody?.message || errBody?.error || `HTTP ${res.status}`;
      if (errMsg.toLowerCase().includes("retailer") || errMsg.toLowerCase().includes("not supported")) {
        return buildNotConfiguredResponse(retailer, product_id);
      }
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(`Zinc HTTP ${res.status}: ${errBody?.message || errBody?.error || res.statusText}`);
    }

    const data = await res.json();

    // Extract price (Zinc returns cents)
    const rawPrice = data.price ?? data.buy_box?.price ?? data.offers?.[0]?.price ?? null;
    const priceUsd = rawPrice !== null ? Number((rawPrice / 100).toFixed(2)) : 0;

    // Extract shipping (Zinc returns cents)
    const rawShipping = data.buy_box?.shipping_cost ?? data.offers?.[0]?.shipping_cost ?? null;
    const shippingUsd = rawShipping !== null ? Number((rawShipping / 100).toFixed(2)) : 0;

    const condition = normalizeCondition(data.condition || data.buy_box?.condition || "new");
    const availability = normalizeAvailability(data);
    const delivery = computeDeliveryRange(data);
    const sellerSignals = extractSellerSignals(data, retailer);

    // Weight
    const weightLbs = data.package_dimensions?.weight?.value
      ? Number(data.package_dimensions.weight.value)
      : undefined;

    return {
      source: retailer,
      source_product_id: product_id,
      title: data.title || data.product_description || "",
      brand: data.brand || data.buy_box?.brand,
      upc: data.upc || data.identifiers?.upc,
      mpn: data.mpn || data.identifiers?.mpn,
      price_usd: priceUsd,
      currency: "USD",
      condition_normalized: condition,
      availability_normalized: availability,
      seller: sellerSignals.seller,
      seller_rating: sellerSignals.seller_rating,
      seller_reviews: sellerSignals.seller_reviews,
      fulfilled_by_retailer: sellerSignals.fulfilled_by_retailer,
      sold_by_retailer: sellerSignals.sold_by_retailer,
      usa_shipping_usd: shippingUsd,
      delivery_min: delivery.delivery_min,
      delivery_max: delivery.delivery_max,
      delivery_source: delivery.delivery_source,
      estimated_weight_lbs: weightLbs,
      weight_status: weightLbs !== undefined ? "KNOWN" : "UNKNOWN",
      image_url: data.main_image || data.images?.[0],
      product_url: buildProductUrl(product_id, retailer),
      freshness_status: "LIVE",
      last_checked_at: checkedAt,
      data_source: "LIVE",
      raw_zinc_data: {
        elapsed_ms: elapsed,
        zinc_price_raw: rawPrice,
        prime: data.buy_box?.prime
      }
    };

  } catch (err: any) {
    // Network / timeout errors → honest ERROR status
    return {
      source: retailer,
      source_product_id: product_id,
      title: "",
      price_usd: 0,
      currency: "USD",
      condition_normalized: "UNKNOWN",
      availability_normalized: "UNKNOWN",
      seller: "",
      fulfilled_by_retailer: false,
      sold_by_retailer: false,
      usa_shipping_usd: 0,
      weight_status: "UNKNOWN",
      product_url: buildProductUrl(product_id, retailer),
      freshness_status: "UNKNOWN",
      last_checked_at: new Date().toISOString(),
      data_source: "ERROR",
      error_message: err.message || "Unknown error"
    };
  }
}

function buildProductUrl(product_id: string, retailer: string): string {
  if (retailer === "amazon") return `https://www.amazon.com/dp/${product_id}`;
  if (retailer === "ebay") return `https://www.ebay.com/itm/${product_id}`;
  if (retailer === "bestbuy") return `https://www.bestbuy.com/site/${product_id}.p?skuId=${product_id}`;
  return "";
}

// ── Get retailer capabilities from DB ────────────────────────────────────────
async function getRetailerCapabilities(supabase: any, retailer: string): Promise<RetailerCapabilities> {
  const { data } = await supabase
    .from("sourcing_retailer_capabilities")
    .select("*")
    .eq("retailer", retailer)
    .single();

  if (data) return data as RetailerCapabilities;

  // Default: NOT_CONFIGURED if not in DB
  return {
    retailer,
    search_status: "NOT_CONFIGURED",
    product_status: "NOT_CONFIGURED",
    price_status: "NOT_CONFIGURED",
    stock_status: "NOT_CONFIGURED",
    seller_status: "NOT_CONFIGURED",
    delivery_status: "NOT_CONFIGURED",
    live_check_available: false
  };
}

// ── Log sync observability ────────────────────────────────────────────────────
async function logSync(supabase: any, source: string, success: boolean, durationMs: number, error?: string) {
  try {
    await supabase.from("sourcing_sync_log").insert({
      source,
      operation: "LIVE_CHECK",
      success,
      duration_ms: durationMs,
      offers_found: success ? 1 : 0,
      error_message: error ?? null
    });
  } catch { /* do not propagate observability failures */ }
}

// ── Update retailer capabilities on health check ──────────────────────────────
async function updateRetailerHealth(supabase: any, retailer: string, success: boolean, error?: string) {
  try {
    const updateObj: any = {
      last_health_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (error) updateObj.last_error = error;

    await supabase
      .from("sourcing_retailer_capabilities")
      .update(updateObj)
      .eq("retailer", retailer);
  } catch { /* do not propagate */ }
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);
  const startedAt = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: LiveCheckRequest = await req.json();
    const { product_id, retailer, force_refresh = false } = body;

    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id es requerido", data_source: "ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!retailer || !["amazon", "ebay", "bestbuy"].includes(retailer)) {
      return new Response(JSON.stringify({ error: "retailer debe ser: amazon | ebay | bestbuy", data_source: "ERROR" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Check capabilities
    const capabilities = await getRetailerCapabilities(supabase, retailer);
    if (!capabilities.live_check_available && !force_refresh) {
      // Return honest NOT_CONFIGURED without attempting Zinc
      const notConfigured = buildNotConfiguredResponse(retailer, product_id);
      return new Response(JSON.stringify({
        ...notConfigured,
        capabilities
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Resolve Zinc API Key
    let zincApiKey: string;
    try {
      zincApiKey = await resolveZincApiKey(supabase, "production");
    } catch {
      try {
        zincApiKey = await resolveZincApiKey(supabase, "sandbox");
      } catch {
        const elapsed = Date.now() - startedAt;
        await logSync(supabase, retailer, false, elapsed, "Zinc API Key not configured");
        return new Response(JSON.stringify({
          ...buildNotConfiguredResponse(retailer, product_id),
          error_message: "Zinc API Key not configured",
          data_source: "NOT_CONFIGURED" as DataSource,
          capabilities
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 3. Execute live check
    const liveOffer = await zincLiveCheck(product_id, retailer, zincApiKey);
    const elapsed = Date.now() - startedAt;

    // 4. Log observability
    const success = liveOffer.data_source === "LIVE";
    await logSync(supabase, retailer, success, elapsed, liveOffer.error_message);
    await updateRetailerHealth(supabase, retailer, success, liveOffer.error_message);

    return new Response(JSON.stringify({
      ...liveOffer,
      capabilities,
      elapsed_ms: elapsed
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    const elapsed = Date.now() - startedAt;
    console.error("sourcing-retailer-live-check error:", err);
    return new Response(JSON.stringify({
      error: err.message,
      data_source: "ERROR" as DataSource,
      freshness_status: "UNKNOWN" as FreshnessStatus,
      elapsed_ms: elapsed
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
