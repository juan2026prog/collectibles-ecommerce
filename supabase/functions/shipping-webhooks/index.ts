// supabase/functions/shipping-webhooks/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    
    // Webhook structure can vary per courier, but we parse generic fields for pre-production validation
    const {
      event_type,      // e.g. 'tracking_update', 'delivered', 'cancelled'
      tracking_code,   // Real tracking code of courier
      shipment_id,     // or direct shipment ID
      status_name,     // e.g. 'in_transit', 'delivered', 'picked_up'
      description,     // Friendly text
      raw_payload      // The full raw payload from the courier
    } = body;

    if (!tracking_code && !shipment_id) {
      throw new Error("Missing tracking_code or shipment_id in webhook payload");
    }

    console.log(`[Shipping Webhook] Received event ${event_type} for tracking: ${tracking_code} / shipment_id: ${shipment_id}`);

    // 1. Resolve shipment record
    let query = supabase.from("shipments").select("*");
    if (shipment_id) {
      query = query.eq("id", shipment_id);
    } else {
      query = query.eq("tracking_code", tracking_code);
    }
    const { data: shipment, error: shipErr } = await query.maybeSingle();

    if (shipErr || !shipment) {
      throw new Error(`Shipment not found for tracking: ${tracking_code} / shipment_id: ${shipment_id}`);
    }

    // 2. Map status to platform shipping_status
    let mappedStatus = status_name || "in_transit";
    const statusLower = String(mappedStatus).toLowerCase();
    
    if (statusLower.includes("transit") || statusLower.includes("ruta")) {
      mappedStatus = "in_transit";
    } else if (statusLower.includes("entreg") || statusLower.includes("deliver")) {
      mappedStatus = "delivered";
    } else if (statusLower.includes("cancel") || statusLower.includes("anul")) {
      mappedStatus = "cancelled";
    } else if (statusLower.includes("devol") || statusLower.includes("return")) {
      mappedStatus = "returned";
    } else if (statusLower.includes("retiro") || statusLower.includes("pickup") || statusLower.includes("recolect")) {
      mappedStatus = "picked_up";
    }

    // 3. Update shipment status and SLA timestamps
    const updatePayload: any = {
      shipping_status: mappedStatus,
      webhook_payload: raw_payload || body,
      updated_at: new Date().toISOString()
    };

    if (mappedStatus === "picked_up") {
      updatePayload.picked_up_at = new Date().toISOString();
    } else if (mappedStatus === "in_transit") {
      updatePayload.dispatched_at = new Date().toISOString();
    } else if (mappedStatus === "delivered") {
      updatePayload.delivered_at = new Date().toISOString();
    }

    const { error: updateErr } = await supabase
      .from("shipments")
      .update(updatePayload)
      .eq("id", shipment.id);

    if (updateErr) throw updateErr;

    // 4. Update order_suborder status if delivered
    if (mappedStatus === "delivered") {
      await supabase
        .from("order_suborders")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", shipment.suborder_id);
    } else if (mappedStatus === "in_transit") {
      await supabase
        .from("order_suborders")
        .update({
          shipping_status: "in_transit",
          updated_at: new Date().toISOString()
        })
        .eq("id", shipment.suborder_id);
    }

    // 5. Add event history log
    await supabase.from("shipment_events").insert({
      shipment_id: shipment.id,
      event_type: mappedStatus,
      description: description || `Actualización automática de estado por Webhook: ${mappedStatus.toUpperCase()}`,
      provider_status: status_name || mappedStatus,
      raw_response: raw_payload || body
    });

    console.log(`[Shipping Webhook] Successfully processed event ${event_type} and set shipment ${shipment.id} status to ${mappedStatus}`);

    return new Response(JSON.stringify({ success: true, message: "Webhook processed successfully" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[Shipping Webhook Error]:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
