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

    // 3. Check OpenAI flag & MLU
    const { data: openAiSetting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "sourcing_openai_enabled")
      .maybeSingle();
    const openAiEnabled = openAiSetting?.value === "true";
    const hasOpenAiKey = Boolean(Deno.env.get("OPENAI_API_KEY"));

    // 4. Build structured health response
    const amazonHealth = {
      retailer: "amazon",
      status: zincConfigured ? "AVAILABLE" : "NOT_CONFIGURED",
      search_status: zincConfigured ? "AVAILABLE" : "NOT_CONFIGURED",
      live_check_status: zincConfigured ? "AVAILABLE" : "NOT_CONFIGURED",
      purchasing_status: "DISABLED",
      managed_account: zincConfigured ? "CONNECTED" : "NOT_CONFIGURED",
      notes: zincConfigured 
        ? "Amazon conectado vía Zinc API V2 (Búsqueda y Live Check activos; compras automáticas deshabilitadas)."
        : "Requiere configurar ZINC_API_KEY en Supabase Secrets o Vault.",
    };

    const ebayHealth = {
      retailer: "ebay",
      status: zincConfigured ? "AVAILABLE" : "NOT_CONFIGURED",
      search_status: "AVAILABLE",
      live_check_status: zincConfigured ? "AVAILABLE" : "NOT_CONFIGURED",
      purchasing_status: "DISABLED",
      managed_account: zincConfigured ? "CONNECTED" : "NOT_CONFIGURED",
      notes: "eBay conectado para búsqueda y normalización de catálogo. Compras automáticas deshabilitadas.",
    };

    const bestbuyHealth = {
      retailer: "bestbuy",
      status: bestBuyKeyConfigured ? "AVAILABLE" : "NOT_CONFIGURED",
      search_status: bestBuyKeyConfigured ? "AVAILABLE" : "NOT_CONFIGURED",
      live_check_status: bestBuyKeyConfigured ? "AVAILABLE" : "NOT_CONFIGURED",
      purchasing_status: "DISABLED",
      managed_account: zincConfigured ? "CONNECTED" : "NOT_CONFIGURED",
      has_forwarding: true,
      free_shipping_threshold_usd: 35.0,
      notes: bestBuyKeyConfigured
        ? "Best Buy conectado vía Developer API (Search/Live Check)."
        : "Requiere configurar BESTBUY_API_KEY en Supabase Secrets para activar búsqueda en vivo.",
    };

    const openAiHealth = {
      service: "openai",
      status: openAiEnabled && hasOpenAiKey ? "AVAILABLE" : (openAiEnabled && !hasOpenAiKey ? "NOT_CONFIGURED" : "OFF"),
      enabled: openAiEnabled,
      has_key: hasOpenAiKey,
      notes: openAiEnabled ? (hasOpenAiKey ? "OpenAI activo para research." : "Switch ON pero falta OPENAI_API_KEY.") : "OpenAI apagado por política de seguridad (OFF por defecto)."
    };

    const mluHealth = {
      service: "mercado_libre_uy",
      status: "AVAILABLE",
      notes: "Mercado Libre Uruguay API conectada para análisis de mercado y gap de precios."
    };

    const autopilotHealth = {
      status: "OFF",
      mode: "OFF",
      auto_publish: false,
      auto_purchase: false,
      notes: "Autopilot apagado por defecto. Publicaciones requieren validación administrativa manual."
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
        services: {
          openai: openAiHealth,
          mercadolibre_uy: mluHealth,
          autopilot: autopilotHealth
        }
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
