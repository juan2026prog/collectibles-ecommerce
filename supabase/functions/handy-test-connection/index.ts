import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getHandyProviderConfig } from "../_shared/handy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({
        success: false,
        error: "Metodo no permitido. Usa POST u OPTIONS.",
      }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const handy = await getHandyProviderConfig(supabaseAdmin);

    const hasMerchantSecret = Boolean(handy.merchantSecretKey);
    const environment = handy.environment;
    const baseUrl = handy.baseUrl;

    if (!hasMerchantSecret) {
      return new Response(JSON.stringify({
        success: false,
        is_configured: false,
        environment,
        baseUrl,
        error: "La Merchant Secret Key de Handy no está configurada (en secret de Edge Functions o tabla payment_providers).",
      }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Call Handy API with a lightweight probe request to test real connectivity and credentials
    // Handy v2 POST /payments without body or with empty cart validates the merchant-secret-key header
    // Returning 400 with a validation error means API is reachable and merchant key is evaluated.
    // Returning 401/403 means invalid merchant key.
    // Returning 200 means success.
    let responseStatus: number;
    let responseText: string;
    let isConnected = false;
    let connectionDetails = "";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const probeResponse = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "merchant-secret-key": handy.merchantSecretKey,
        },
        body: JSON.stringify({
          Probe: true,
          Cart: { TotalAmount: 0 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      responseStatus = probeResponse.status;
      responseText = await probeResponse.text();

      // Analyze response from Handy server
      if (responseStatus === 401 || responseStatus === 403) {
        isConnected = false;
        connectionDetails = `Autenticación rechazada por la API de Handy (${responseStatus}): Merchant Secret Key no reconocida o inválida para el ambiente ${environment}.`;
      } else if (responseStatus === 200) {
        isConnected = true;
        connectionDetails = `Conexión y autenticación verificadas exitosamente con la API Handy (${responseStatus}).`;
      } else if (responseStatus === 400 || responseStatus === 422) {
        // Handy receives request, validates headers successfully, and returns 400 validation error because probe payload is not a commercial order. This confirms authentic network & credential reachability!
        isConnected = true;
        connectionDetails = `Comunicación real confirmada con la API de Handy (${environment}). Credencial y endpoint verificados sin crear órdenes ni cargos comerciales.`;
      } else {
        isConnected = false;
        connectionDetails = `La API de Handy respondió con código HTTP ${responseStatus}.`;
      }
    } catch (networkError: any) {
      return new Response(JSON.stringify({
        success: false,
        is_configured: true,
        environment,
        baseUrl,
        error: `No se pudo establecer comunicación de red con la API de Handy (${baseUrl}): ${networkError.message || networkError}`,
        checked_at: new Date().toISOString(),
      }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Update payment_providers metadata with last connection check
    try {
      await supabaseAdmin
        .from("payment_providers")
        .update({
          config: {
            ...handy.config,
            last_connectivity_check: {
              success: isConnected,
              status_code: responseStatus,
              environment,
              checked_at: new Date().toISOString(),
              message: connectionDetails,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("provider_key", "handy");
    } catch (dbErr) {
      console.warn("Could not save last_connectivity_check to payment_providers:", dbErr);
    }

    return new Response(JSON.stringify({
      success: isConnected,
      is_configured: true,
      environment,
      baseUrl,
      status_code: responseStatus,
      message: connectionDetails,
      checked_at: new Date().toISOString(),
    }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error: any) {
    console.error("handy-test-connection error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Error interno al ejecutar test de conexión de Handy.",
      checked_at: new Date().toISOString(),
    }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});