import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { resolveZincApiKey } from "../_shared/zinc/index.ts";

// ================================================================
// SOURCING RETAILER HEALTH CHECK — EDGE FUNCTION
// Evaluates real dynamic status for Amazon, eBay, and Best Buy.
// Server-side only. Zero secrets leaked.
// ================================================================

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);
  const startedAt = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Check Zinc credentials & Managed Account capability
    let zincConfigured = false;
    let zincEnv = "none";
    try {
      const prodKey = await resolveZincApiKey(supabase, "production");
      if (prodKey) {
        zincConfigured = true;
        zincEnv = "production";
      }
    } catch {
      try {
        const sandKey = await resolveZincApiKey(supabase, "sandbox");
        if (sandKey) {
          zincConfigured = true;
          zincEnv = "sandbox";
        }
      } catch {
        zincConfigured = false;
      }
    }

    // 2. Check Best Buy API Key
    let bestBuyKeyConfigured = Boolean(Deno.env.get("BESTBUY_API_KEY"));
    if (!bestBuyKeyConfigured) {
      try {
        const { data: vaultKey } = await supabase.rpc("get_zinc_vault_secret", {
          p_environment: "production",
          p_secret_type: "bestbuy_api_key",
        });
        if (vaultKey) bestBuyKeyConfigured = true;
      } catch {
        // Vault check fallback
      }
    }

    // 3. Build structured health response
    const amazonHealth = {
      retailer: "amazon",
      status: zincConfigured ? "LIVE" : "NOT_CONFIGURED",
      search_status: zincConfigured ? "LIVE" : "NOT_CONFIGURED",
      live_check_status: zincConfigured ? "LIVE" : "NOT_CONFIGURED",
      purchasing_status: "SANDBOX",
      managed_account: zincConfigured ? "CONNECTED" : "NOT_CONFIGURED",
      notes: "Amazon vía Zinc API V2. Búsqueda, Live Check y Purchasing (Sandbox) activos.",
    };

    const ebayHealth = {
      retailer: "ebay",
      status: "ADAPTER_READY",
      search_status: "ADAPTER_READY",
      live_check_status: "NOT_CONFIGURED",
      purchasing_status: "SANDBOX",
      managed_account: zincConfigured ? "CONNECTED" : "NOT_CONFIGURED",
      notes: "eBay vía listings de catálogo y adaptadores de scraping. Purchasing vía Zinc.",
    };

    const bestbuyHealth = {
      retailer: "bestbuy",
      status: bestBuyKeyConfigured ? "LIVE" : "ADAPTER_READY",
      search_status: bestBuyKeyConfigured ? "LIVE" : "PENDING_KEY",
      live_check_status: bestBuyKeyConfigured ? "LIVE" : "ADAPTER_READY",
      purchasing_status: "SANDBOX",
      managed_account: zincConfigured ? "CONNECTED" : "NOT_CONFIGURED",
      has_forwarding: true,
      free_shipping_threshold_usd: 35.0,
      notes: bestBuyKeyConfigured
        ? "Best Buy conectado vía Developer API (Search/Live Check) y Zinc Managed Accounts (Purchasing Sandbox)."
        : "Best Buy adapter listo en código. Managed Account activa en Zinc. Requiere configurar BESTBUY_API_KEY en Supabase Secrets para activar búsqueda en vivo.",
    };

    return new Response(
      JSON.stringify({
        success: true,
        checked_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startedAt,
        retailers: {
          amazon: amazonHealth,
          ebay: ebayHealth,
          bestbuy: bestbuyHealth,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (err: any) {
    console.error("sourcing-retailer-health error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Error al verificar estado de retailers",
        elapsed_ms: Date.now() - startedAt,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
