import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

function mapStatusCodeToInternal(statusNomOrCode: string | number): { code: number; internalStatus: string; label: string } {
  const norm = String(statusNomOrCode).toUpperCase().trim();

  if (norm === '1' || norm.includes('DEPÓSITO') || norm.includes('DEPOSITO')) {
    return { code: 1, internalStatus: 'at_warehouse', label: 'En Depósito' };
  }
  if (norm === '2' || norm.includes('TRÁNSITO') || norm.includes('TRANSITO')) {
    return { code: 2, internalStatus: 'in_transit', label: 'En Tránsito' };
  }
  if (norm === '3' || norm.includes('ENTREGADO')) {
    return { code: 3, internalStatus: 'delivered', label: 'Entregado' };
  }
  if (norm === '4' || norm.includes('PENDIENTE')) {
    return { code: 4, internalStatus: 'delivered_pending_action', label: 'Entregado Pendiente' };
  }
  if (norm === '5' || norm.includes('PICK UP') || norm.includes('PICKUP')) {
    return { code: 5, internalStatus: 'pickup', label: 'Listo para Pick Up' };
  }
  if (norm === '6' || norm.includes('NO ENTREGADO')) {
    return { code: 6, internalStatus: 'delivery_failed', label: 'No Entregado' };
  }
  if (norm === '7' || norm.includes('CANCELADO')) {
    return { code: 7, internalStatus: 'cancelled', label: 'Cancelado' };
  }
  if (norm === '8' || norm.includes('DEVUELTO')) {
    return { code: 8, internalStatus: 'returned', label: 'Devuelto' };
  }

  return { code: 9, internalStatus: 'preparing', label: 'En Preparación' };
}

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check feature flag
    const { data: setting } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'distrilogic_webhook_enabled')
      .maybeSingle();

    const isEnabled = setting?.value === 'true';

    const payload = await req.json().catch(() => ({}));
    const trackingNumber = payload.SrvTrkNbr || payload.tracking_number || payload.srvTrkNbr;
    const statusCode = payload.ESTCOD || payload.status_code || payload.estcod;
    const statusName = payload.ESTNOM || payload.status_name || payload.estnom || '';
    const info = payload.TrkInfo || payload.info || '';

    if (!trackingNumber) {
      return new Response(JSON.stringify({ success: false, message: "Falta SrvTrkNbr en webhook" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!isEnabled) {
      console.log(`[distrilogic-webhook] Webhook recibido para tracking ${trackingNumber}, pero la flag distrilogic_webhook_enabled está inactiva.`);
      return new Response(JSON.stringify({ success: true, message: "Webhook recibido y descartado (feature flag inactiva)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Find shipment
    const { data: shipment } = await supabase
      .from('shipments')
      .select('*')
      .eq('external_tracking_number', trackingNumber)
      .maybeSingle();

    if (!shipment) {
      return new Response(JSON.stringify({ success: false, message: "No se encontró el envío" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const mapped = mapStatusCodeToInternal(statusCode || statusName);

    // Update shipment status
    await supabase.from('shipments').update({
      shipping_status: mapped.internalStatus,
      external_status_code: mapped.code,
      external_status_description: statusName || mapped.label,
      updated_at: new Date().toISOString()
    }).eq('id', shipment.id);

    // Record webhook event
    await supabase.from('shipment_events').insert({
      shipment_id: shipment.id,
      event_type: mapped.internalStatus,
      description: info || `Actualización recibida por Webhook: ${mapped.label}`,
      provider_status: statusName || mapped.label,
      raw_response: { webhook_payload: payload },
      created_by: 'webhook'
    });

    return new Response(JSON.stringify({ success: true, message: "Estado actualizado exitosamente por Webhook" }), {
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
