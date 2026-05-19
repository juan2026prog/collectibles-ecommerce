import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

    const merchantSecretKey = (Deno.env.get("HANDY_MERCHANT_SECRET_KEY") ?? "").trim();
    const baseUrl = (Deno.env.get("HANDY_BASE_URL") ?? "").trim();
    const missingSecrets: string[] = [];

    if (!merchantSecretKey) {
      missingSecrets.push("HANDY_MERCHANT_SECRET_KEY");
    }
    if (!baseUrl) {
      missingSecrets.push("HANDY_BASE_URL");
    }

    if (missingSecrets.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: `Faltan secrets de Handy: ${missingSecrets.join(", ")}`,
      }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Configuración Handy disponible",
    }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error: any) {
    console.error("handy-test-connection error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
