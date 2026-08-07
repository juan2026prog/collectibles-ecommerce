import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { decryptData } from "../_shared/crypto.ts";

const DISTRILOGIC_CANCEL_TEST_URL = "http://test.DISTRILOGIC.com.uy/rest/wscancelservicio";
const DISTRILOGIC_CANCEL_PROD_URL = "http://tracking.districad.com.uy/rest/wscancelservicio";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Falta token de autenticación");

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) throw new Error("Usuario no autenticado");

    const { shipment_id, tracking_number } = await req.json();

    if (!shipment_id && !tracking_number) {
      throw new Error("Se requiere shipment_id o tracking_number");
    }

    let query = supabase.from('shipments').select('*');
    if (shipment_id) query = query.eq('id', shipment_id);
    else query = query.eq('external_tracking_number', tracking_number);

    const { data: shipment, error: shipErr } = await query.single();
    if (shipErr || !shipment) {
      throw new Error("No se encontró el envío a cancelar.");
    }

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    const isAdmin = profile?.is_admin === true;

    if (shipment.vendor_id !== user.id && !isAdmin) {
      throw new Error("No tenés permisos para cancelar envíos de otro vendedor.");
    }

    const trkNum = tracking_number || shipment.external_tracking_number || shipment.tracking_code;

    if (shipment.external_status_code !== undefined && shipment.external_status_code !== null && shipment.external_status_code !== 9) {
      throw new Error(`El envío no se puede cancelar porque se encuentra en estado '${shipment.external_status_description || shipment.shipping_status}' (código ${shipment.external_status_code}). Distrilogic solo permite cancelar envíos en estado 9 (EN PREPARACIÓN).`);
    }

    const { data: connection } = await supabase
      .from('vendor_shipping_connections')
      .select('*')
      .eq('vendor_id', shipment.vendor_id)
      .eq('provider', 'distrilogic')
      .single();

    if (!connection) {
      throw new Error("No se encontró la conexión de Distrilogic para el vendedor.");
    }

    const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
    const credentialsRaw = await decryptData(connection.credentials_encrypted, secret);
    const credentials = JSON.parse(credentialsRaw);

    const { guid, usuario, password, environment = 'testing' } = credentials;
    const targetUrl = environment === 'production' ? DISTRILOGIC_CANCEL_PROD_URL : DISTRILOGIC_CANCEL_TEST_URL;

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
      throw new Error(`Error HTTP ${res.status} al contactar Distrilogic para cancelación`);
    }

    const resData = await res.json();
    const errorCode = resData.ErrorCode ?? resData.errorCode;
    const errorMsg = resData.ErrorMsg ?? resData.errorMsg ?? "";

    if (errorCode !== 200) {
      if (errorCode === 411) {
        throw new Error("Distrilogic rechazó la cancelación: El servicio ya ingresó a depósito o transporte.");
      }
      throw new Error(`Error en cancelación de Distrilogic [${errorCode}]: ${errorMsg}`);
    }

    await supabase.from('shipments').update({
      shipping_status: 'cancelled',
      external_status_code: 7,
      external_status_description: 'CANCELADO',
      updated_at: new Date().toISOString()
    }).eq('id', shipment.id);

    await supabase.from('shipment_events').insert({
      shipment_id: shipment.id,
      event_type: 'cancelled',
      description: 'Envío cancelado exitosamente por el vendedor en Distrilogic',
      provider_status: 'CANCELADO',
      raw_response: { tracking_number: trkNum, cancelled_by: user.id }
    });

    return new Response(JSON.stringify({
      success: true,
      message: "El envío ha sido cancelado exitosamente en Distrilogic",
      trackingNumber: trkNum
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
