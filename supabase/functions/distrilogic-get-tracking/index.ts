import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { decryptData } from "../_shared/crypto.ts";

const DISTRILOGIC_TRACK_TEST_URL = "http://test.DISTRILOGIC.com.uy/rest/WsGetTrackingServicio";
const DISTRILOGIC_TRACK_PROD_URL = "http://tracking.districad.com.uy/rest/WsGetTrackingServicio";

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
    return { code: 6, internalStatus: 'delivery_failed', label: 'No Entregado (Intento Fallido)' };
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

    const { shipment_id, tracking_number } = await req.json();

    if (!shipment_id && !tracking_number) {
      throw new Error("Se requiere shipment_id o tracking_number");
    }

    let query = supabase.from('shipments').select('*');
    if (shipment_id) query = query.eq('id', shipment_id);
    else query = query.eq('external_tracking_number', tracking_number);

    const { data: shipment, error: shipErr } = await query.single();
    if (shipErr || !shipment) {
      throw new Error("No se encontró el envío solicitado.");
    }

    const trkNum = tracking_number || shipment.external_tracking_number || shipment.tracking_code;

    const { data: connection } = await supabase
      .from('vendor_shipping_connections')
      .select('*')
      .eq('vendor_id', shipment.vendor_id)
      .eq('provider', 'distrilogic')
      .single();

    if (!connection) {
      throw new Error("No se encontró la conexión de Distrilogic para el vendedor");
    }

    const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
    const credentialsRaw = await decryptData(connection.credentials_encrypted, secret);
    const credentials = JSON.parse(credentialsRaw);

    const { guid, usuario, password, environment = 'testing' } = credentials;
    const targetUrl = environment === 'production' ? DISTRILOGIC_TRACK_PROD_URL : DISTRILOGIC_TRACK_TEST_URL;

    const payload = {
      WSAutorizacion: {
        Guid: String(guid).trim(),
        Usuario: String(usuario).trim(),
        Password: String(password).trim()
      },
      SrvTrkNbr: String(trkNum).trim()
    };

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Error de red HTTP ${res.status} al consultar tracking en Distrilogic`);
    }

    const resData = await res.json();
    const rawEvents: any[] = resData.MTracking || resData.mtracking || [];
    const errorCode = resData.ErrorCode ?? resData.errorCode;

    if (errorCode !== 200) {
      throw new Error(`Distrilogic respondió error [${errorCode}]: ${resData.ErrorMsg || 'Error al obtener tracking'}`);
    }

    let latestStatus = { code: 9, internalStatus: 'preparing', label: 'En Preparación' };
    const processedEvents = [];

    for (const ev of rawEvents) {
      const mapped = mapStatusCodeToInternal(ev.TrkEstNom || ev.trkEstNom || '9');
      latestStatus = mapped;

      processedEvents.push({
        shipment_id: shipment.id,
        event_type: mapped.internalStatus,
        description: ev.TrkInfo || mapped.label,
        provider_status: ev.TrkEstNom || mapped.label,
        raw_response: {
          timestamp: ev.TrkSrvFchHor,
          info: ev.TrkInfo
        },
        created_at: ev.TrkSrvFchHor ? new Date(ev.TrkSrvFchHor).toISOString() : new Date().toISOString()
      });
    }

    await supabase.from('shipments').update({
      shipping_status: latestStatus.internalStatus,
      external_status_code: latestStatus.code,
      external_status_description: latestStatus.label,
      updated_at: new Date().toISOString()
    }).eq('id', shipment.id);

    if (processedEvents.length > 0) {
      for (const eventItem of processedEvents) {
        await supabase.from('shipment_events').insert(eventItem);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      trackingNumber: trkNum,
      currentStatus: latestStatus,
      events: processedEvents
    }), {
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
