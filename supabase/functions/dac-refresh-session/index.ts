import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { wsLogin } from "../_shared/dac-client.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Check for a valid existing session
    const { data: activeSession } = await supabase
      .from('dac_sessions')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSession) {
      console.log("[DAC Session] Reusing active session:", activeSession.session_id);
      return new Response(JSON.stringify({ success: true, session: activeSession }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log("[DAC Session] No active session or expired. Logging in again...");

    // 2. Fetch configurations
    const { data: provider, error: providerErr } = await supabase
      .from('delivery_providers')
      .select('*')
      .eq('provider_key', 'dac')
      .single();

    if (providerErr || !provider) {
      throw new Error(`DAC provider configurations not found: ${providerErr?.message}`);
    }

    const { username, password_encrypted, api_url } = provider;
    if (!username || !password_encrypted || !api_url) {
      throw new Error("Missing DAC credentials in delivery_providers.");
    }

    // 3. Login
    const sessionData = await wsLogin(api_url, username, password_encrypted);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 12);

    const { data: storedSession, error: sessionErr } = await supabase
      .from('dac_sessions')
      .insert({
        session_id: sessionData.id_session,
        k_cliente: sessionData.k_cliente,
        k_usuario: sessionData.k_usuario,
        rut: sessionData.rut,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (sessionErr) {
      throw new Error(`Failed to store new session: ${sessionErr.message}`);
    }

    return new Response(JSON.stringify({ success: true, session: storedSession }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[DAC Refresh Session Error]:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
