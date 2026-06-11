import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";

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
    let user;
    let isVendor = false;
    let isAdmin = false;

    // Check if caller is admin or vendor
    user = await verifyAuth(req);
    const { data: profile } = await supabase.from('profiles').select('is_admin, is_vendor').eq('id', user.id).single();
    if (!profile?.is_admin && !profile?.is_vendor) {
      throw new Error("Acceso denegado: Se requiere cuenta de Admin o Vendor.");
    }
    isAdmin = profile.is_admin;
    isVendor = profile.is_vendor;

    const body = await req.json().catch(() => ({}));
    const { code, redirect_uri, vendor_id } = body;

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Code is required" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
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
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
    
    // Fetch MeLi User Profile
    const meRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { "Authorization": `Bearer ${data.access_token}` }
    });
    const meData = await meRes.json();
    if (!meRes.ok) {
      return new Response(
        JSON.stringify({ error: meData.message || "Failed to fetch user profile from Mercado Libre" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    const sellerId = meData.id.toString();
    const nickname = meData.nickname;

    const targetVendorId = isVendor ? user.id : (vendor_id || null);

    // Check if this Mercado Libre account (sellerId) is already connected to another vendor or admin
    const { data: existingSeller } = await supabase
      .from("ml_seller_accounts")
      .select("vendor_id")
      .eq("seller_id", sellerId)
      .maybeSingle();

    if (existingSeller && existingSeller.vendor_id !== targetVendorId) {
      return new Response(
        JSON.stringify({ 
          error: "Esta cuenta de Mercado Libre ya está conectada a otra tienda o a la cuenta principal. Por favor cerrá sesión en Mercado Libre y conectá una cuenta diferente." 
        }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Clear old accounts for this vendor / platform
    if (targetVendorId === null) {
      await supabase.from("ml_seller_accounts").delete().is("vendor_id", null);
    } else {
      await supabase.from("ml_seller_accounts").delete().eq("vendor_id", targetVendorId);
    }

    // Insert new seller account details
    const { error: insertError } = await supabase.from("ml_seller_accounts").insert({
      vendor_id: targetVendorId,
      seller_id: sellerId,
      nickname: nickname,
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "No se pudo guardar la conexión en la base de datos.", details: insertError }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
      );
    }

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
        seller_id: sellerId
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
