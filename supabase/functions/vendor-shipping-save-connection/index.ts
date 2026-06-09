import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

// Utility to encrypt data. Uses AES-GCM.
async function encryptData(text: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    encoder.encode(text)
  );

  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const encHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${ivHex}:${encHex}`;
}

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificación de autenticación del usuario
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Falta token de autenticación");

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) throw new Error("Usuario no autenticado");

    const { provider, credentials, settings, pickup_address, account_name, connection_status } = await req.json();

    if (!provider || !credentials) {
      throw new Error("Faltan parámetros requeridos: provider o credentials");
    }

    // Encrypt the credentials JSON string
    const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
    const encryptedString = await encryptData(JSON.stringify(credentials), secret);

    // Save to vendor_shipping_connections (UPSERT)
    const payload = {
      vendor_id: user.id,
      provider,
      account_name,
      connection_status: connection_status || 'connected',
      credentials_encrypted: encryptedString,
      settings: settings || {},
      pickup_address: pickup_address || {},
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('vendor_shipping_connections')
      .upsert(payload, { onConflict: 'vendor_id,provider' })
      .select('id, provider, account_name, connection_status, last_tested_at')
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, connection: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
