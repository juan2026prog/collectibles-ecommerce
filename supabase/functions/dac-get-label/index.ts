import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { wsGetPegoteJson, wsLogin } from "../_shared/dac-client.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { shipment_id, tracking_code, order_id } = body;

    // Find shipment
    let query = supabase.from('shipments').select('*');
    if (shipment_id) {
      query = query.eq('id', shipment_id);
    } else if (tracking_code) {
      query = query.eq('tracking_code', tracking_code);
    } else if (order_id) {
      query = query.eq('order_id', order_id);
    } else {
      throw new Error("Missing identification parameter: pass shipment_id, tracking_code, or order_id");
    }

    const { data: shipment, error: findErr } = await query.maybeSingle();
    if (findErr || !shipment) {
      throw new Error("Shipment not found for the provided details");
    }

    const kGuia = shipment.external_guide;
    const trackingCode = shipment.tracking_code;

    if (!kGuia) {
      throw new Error("Shipment does not have an external guide (K_Guia) linked.");
    }

    // Fetch DAC provider
    const { data: provider, error: providerErr } = await supabase
      .from('delivery_providers')
      .select('*')
      .eq('provider_key', 'dac')
      .single();

    if (providerErr || !provider) {
      throw new Error("DAC provider configuration not found");
    }

    const { username, password_encrypted, api_url, settings = {} } = provider;
    const kOficinaOrigen = settings.k_oficina_origen !== undefined ? String(settings.k_oficina_origen) : "800";

    // Resolve active session
    let { data: activeSession } = await supabase
      .from('dac_sessions')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionObj = activeSession;
    if (!sessionObj) {
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
      
      if (sessionErr) throw new Error("Failed to store new session");
      sessionObj = storedSession;
    }

    const sessionParam = {
      id_session: sessionObj.session_id,
      k_cliente: sessionObj.k_cliente,
      k_usuario: sessionObj.k_usuario,
      rut: sessionObj.rut
    };

    // Call wsGetPegoteJson (JSON endpoint)
    const labelBase64 = await wsGetPegoteJson(api_url, sessionParam, kGuia, kOficinaOrigen);

    // Convert and Upload
    const binaryString = atob(labelBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const labelPath = `dac/${trackingCode}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('shipping-labels')
      .upload(labelPath, bytes.buffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage
      .from('shipping-labels')
      .getPublicUrl(labelPath);

    // Update shipment with label URL and base64
    await supabase
      .from('shipments')
      .update({
        shipping_label_url: publicUrl,
        shipping_label_base64: labelBase64,
        updated_at: new Date().toISOString()
      })
      .eq('id', shipment.id);

    return new Response(JSON.stringify({
      success: true,
      labelUrl: publicUrl,
      trackingCode: trackingCode
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[DAC Get Label Error]:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
