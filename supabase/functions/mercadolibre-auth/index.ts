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
    // 1. Authenticate caller and fetch profile roles
    const user = await verifyAuth(req);
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('is_admin, is_vendor')
      .eq('id', user.id)
      .single();

    if (profileErr || (!profile?.is_admin && !profile?.is_vendor)) {
      return new Response(
        JSON.stringify({ error: "Acceso denegado: Se requiere cuenta de Admin o Vendor." }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 403 }
      );
    }

    const isAdmin = Boolean(profile.is_admin);
    const isVendor = Boolean(profile.is_vendor);

    const body = await req.json().catch(() => ({}));
    const { code, redirect_uri, vendor_id, is_admin_connection } = body;

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Code is required" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 2. Exchange authorization code with Mercado Libre OAuth
    const tokenUrl = "https://api.mercadolibre.com/oauth/token";
    const effectiveRedirectUri = redirect_uri || ML_REDIRECT_URI;
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code,
      redirect_uri: effectiveRedirectUri,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[mercadolibre-auth] OAuth token exchange error:", data.error || data.message || "Failed");
      return new Response(
        JSON.stringify({ error: data.error || "Failed to get access token", details: data }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
    
    // 3. Fetch Mercado Libre User Profile
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

    // 4. Server-Side Identity & Ownership Resolution:
    // If the authenticated user is an Admin:
    // - Default is platform connection (targetVendorId = null), even if the admin profile also has is_vendor = true.
    // - If admin explicitly passes a vendor_id to connect on behalf of a specific vendor, allow targetVendorId = vendor_id.
    // If NOT an Admin but is Vendor:
    // - targetVendorId is strictly user.id (no vendor_id override allowed).
    let targetVendorId: string | null = null;
    if (isAdmin) {
      if (!is_admin_connection && vendor_id) {
        targetVendorId = vendor_id;
      } else {
        targetVendorId = null; // Principal / Platform connection
      }
    } else {
      // Pure vendor flow
      targetVendorId = user.id;
    }

    // 5. Anti-hijack & Existing Connection Check
    const { data: existingSeller } = await supabase
      .from("ml_seller_accounts")
      .select("id, vendor_id, seller_id, nickname")
      .eq("seller_id", sellerId)
      .maybeSingle();

    if (existingSeller) {
      const isExistingPlatform = existingSeller.vendor_id === null;
      const isTargetPlatform = targetVendorId === null;

      if (isExistingPlatform && !isAdmin) {
        return new Response(
          JSON.stringify({ 
            error: "Esta cuenta de Mercado Libre pertenece a la tienda principal de Collectibles y no puede ser vinculada a un vendedor externo." 
          }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 403 }
        );
      }

      if (!isExistingPlatform && existingSeller.vendor_id !== targetVendorId && !isAdmin) {
        return new Response(
          JSON.stringify({ 
            error: "Esta cuenta de Mercado Libre ya está conectada a otra tienda. Por favor cerrá sesión en Mercado Libre y conectá una cuenta diferente." 
          }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Check for Admin trying to attach an existing vendor account to platform without deliberate intent
      if (!isExistingPlatform && isTargetPlatform && existingSeller.vendor_id !== null) {
        // The ML account is registered to an existing vendor.
        return new Response(
          JSON.stringify({ 
            error: `Esta cuenta de Mercado Libre (${nickname || sellerId}) ya está asignada al vendedor ${existingSeller.vendor_id}. No puede sobrescribirse como cuenta principal sin reasignación previa.` 
          }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    // 6. Safe Atomic Persistence: UPDATE existing record or INSERT new record (NEVER DELETE)
    let accountRecordId: string;

    // Check if target slot already has a record (either matching sellerId, or matching targetVendorId)
    let existingSlotQuery = supabase.from("ml_seller_accounts").select("id, seller_id");
    if (targetVendorId === null) {
      existingSlotQuery = existingSlotQuery.is("vendor_id", null);
    } else {
      existingSlotQuery = existingSlotQuery.eq("vendor_id", targetVendorId);
    }
    const { data: existingSlot } = await existingSlotQuery.maybeSingle();

    if (existingSeller) {
      // Existing seller account: update tokens and profile in place
      const { data: updated, error: updateError } = await supabase
        .from("ml_seller_accounts")
        .update({
          nickname: nickname,
          access_token: data.access_token,
          refresh_token: data.refresh_token || null,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSeller.id)
        .select("id")
        .single();

      if (updateError) {
        console.error("[mercadolibre-auth] Error updating existingSeller:", updateError);
        return new Response(
          JSON.stringify({ error: "No se pudo actualizar la conexión en la base de datos.", details: updateError }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
        );
      }
      accountRecordId = updated.id;
    } else if (existingSlot) {
      // The vendor or platform already has a record, update it with the newly authenticated seller details
      const { data: updated, error: updateError } = await supabase
        .from("ml_seller_accounts")
        .update({
          seller_id: sellerId,
          nickname: nickname,
          access_token: data.access_token,
          refresh_token: data.refresh_token || null,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSlot.id)
        .select("id")
        .single();

      if (updateError) {
        console.error("[mercadolibre-auth] Error updating existingSlot:", updateError);
        return new Response(
          JSON.stringify({ error: "No se pudo actualizar la cuenta del vendedor en la base de datos.", details: updateError }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
        );
      }
      accountRecordId = updated.id;
    } else {
      // Brand new connection: insert new record
      const { data: inserted, error: insertError } = await supabase
        .from("ml_seller_accounts")
        .insert({
          vendor_id: targetVendorId,
          seller_id: sellerId,
          nickname: nickname,
          access_token: data.access_token,
          refresh_token: data.refresh_token || null,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[mercadolibre-auth] Error inserting seller account:", insertError);
        return new Response(
          JSON.stringify({ error: "No se pudo guardar la conexión en la base de datos.", details: insertError }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
        );
      }
      accountRecordId = inserted.id;
    }

    // 7. Update status setting flag (without storing tokens)
    if (targetVendorId === null) {
      await supabase.from("site_settings").upsert(
        {
          key: "ml_connection_status",
          value: "true",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Mercado Libre connected successfully",
        expires_in: data.expires_in,
        seller_id: sellerId,
        account_id: accountRecordId,
        is_platform: targetVendorId === null
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[mercadolibre-auth] Unhandled error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
