import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ML_CLIENT_ID = Deno.env.get("MERCADOLIBRE_CLIENT_ID") || "";
const ML_CLIENT_SECRET = Deno.env.get("MERCADOLIBRE_CLIENT_SECRET") || "";
const ML_REDIRECT_URI = Deno.env.get("MERCADOLIBRE_REDIRECT_URI") || "http://localhost:5173/callback";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    await verifyAdmin(req);

    const { code, redirect_uri } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Code is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const tokenUrl = "https://api.mercadolibre.com/oauth/token";
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code,
      redirect_uri: redirect_uri || ML_REDIRECT_URI,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.error || "Failed to get access token", details: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
    
    // Clear old credentials
    await supabase.from("ml_credentials").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    await supabase.from("ml_credentials").insert({
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });

    await supabase.from("site_settings").upsert(
      {
        key: "ml_connection_status",
        value: "true",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Mercado Libre connected successfully",
        expires_in: data.expires_in,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
