import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { wsRastreoGuia, wsLogin } from "../_shared/dac-client.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { tracking_code, order_id, reference } = body;

    // 1. Locate shipment record in DB
    let query = supabase.from('shipments').select('*');
    if (tracking_code) {
      query = query.eq('tracking_code', tracking_code);
    } else if (order_id) {
      query = query.eq('order_id', order_id);
    } else if (reference) {
      // Try tracking_code first or external_guide
      query = query.or(`tracking_code.eq.${reference},external_guide.eq.${reference}`);
    } else {
      throw new Error("Missing parameter: pass tracking_code, order_id, or reference");
    }

    const { data: shipment, error: findErr } = await query.maybeSingle();

    // Determine values to call DAC with
    const activeTrackingCode = shipment ? shipment.tracking_code : (tracking_code || reference || "");
    const activeKGuia = shipment ? shipment.external_guide : "";

    if (!activeTrackingCode && !activeKGuia) {
      throw new Error("Could not resolve tracking code or guide ID to track.");
    }

    // 2. Fetch DAC provider
    const { data: provider, error: providerErr } = await supabase
      .from('delivery_providers')
      .select('*')
      .eq('provider_key', 'dac')
      .single();

    if (providerErr || !provider) {
      throw new Error("DAC provider configuration not found");
    }

    const { username, password_encrypted, api_url } = provider;

    // 3. Resolve active session
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

    // 4. Call SOAP tracking
    const trackResult = await wsRastreoGuia(api_url, sessionParam, activeKGuia, activeTrackingCode);
    console.log("[DAC Track Shipment] Result:", trackResult);

    // 5. If we have a shipment record, update database and log tracking updates
    if (shipment) {
      // Update shipment record
      const oldStatus = shipment.shipping_status;
      await supabase
        .from('shipments')
        .update({
          shipping_status: trackResult.status,
          provider_response: {
            ...((shipment.provider_response as Record<string, any>) || {}),
            last_tracking_response: trackResult
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', shipment.id);

      // Log in order_tracking_updates if status changed or it's new
      if (oldStatus !== trackResult.status) {
        await supabase
          .from('order_tracking_updates')
          .insert({
            order_id: shipment.order_id,
            status_text: `DAC: ${trackResult.rawStatus} - ${trackResult.statusDescription}`,
            location: "DAC Network"
          });

        // Also update order status
        let targetOrderStatus = "";
        if (trackResult.status === "delivered") {
          targetOrderStatus = "entregado";
        } else if (trackResult.status === "out_for_delivery") {
          targetOrderStatus = "en_transito";
        } else if (trackResult.status === "in_transit") {
          targetOrderStatus = "en_transito";
        }

        if (targetOrderStatus) {
          await supabase
            .from('orders')
            .update({ status: targetOrderStatus })
            .eq('id', shipment.order_id);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      status: trackResult.status,
      rawStatus: trackResult.rawStatus,
      description: trackResult.statusDescription
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[DAC Track Shipment Error]:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
