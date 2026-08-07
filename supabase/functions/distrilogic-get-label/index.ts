import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { decryptData } from "../_shared/crypto.ts";

const DISTRILOGIC_LABEL_TEST_URL = "http://test.DISTRILOGIC.com.uy/rest/wsgetetiqueta";
const DISTRILOGIC_LABEL_PROD_URL = "http://tracking.districad.com.uy/rest/wsgetetiqueta";

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
      throw new Error("No se encontró el envío especificado");
    }

    const trkNum = tracking_number || shipment.external_tracking_number || shipment.tracking_code;

    const { data: connection } = await supabase
      .from('vendor_shipping_connections')
      .select('*')
      .eq('vendor_id', shipment.vendor_id)
      .eq('provider', 'distrilogic')
      .single();

    if (!connection) {
      throw new Error("No se encontró la conexión del vendedor");
    }

    const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
    const credentialsRaw = await decryptData(connection.credentials_encrypted, secret);
    const credentials = JSON.parse(credentialsRaw);

    const { guid, usuario, password, environment = 'testing' } = credentials;
    const targetUrl = environment === 'production' ? DISTRILOGIC_LABEL_PROD_URL : DISTRILOGIC_LABEL_TEST_URL;

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
      throw new Error(`Error de red HTTP ${res.status} al consultar etiqueta`);
    }

    const resData = await res.json();
    const errorCode = resData.ErrorCode ?? resData.errorCode;
    const labelBase64 = resData.Etiqueta || resData.etiqueta;

    if (errorCode !== 200 || !labelBase64) {
      throw new Error(`No se pudo recuperar la etiqueta [${errorCode}]: ${resData.ErrorMsg || 'Sin etiqueta devuelta'}`);
    }

    const cleanBase64 = labelBase64.replace(/^data:application\/pdf;base64,/, '');
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const fileName = `distrilogic/${shipment.vendor_id}/${trkNum}.pdf`;
    const { data: storageUpload, error: uploadErr } = await supabase.storage
      .from('shipping-labels')
      .upload(fileName, bytes, { contentType: 'application/pdf', upsert: true });

    let labelUrl = shipment.shipping_label_url;
    if (!uploadErr && storageUpload) {
      const { data: urlData } = supabase.storage.from('shipping-labels').getPublicUrl(storageUpload.path);
      labelUrl = urlData.publicUrl;

      await supabase.from('shipments').update({
        shipping_label_url: labelUrl,
        label_storage_path: storageUpload.path,
        label_generated_at: new Date().toISOString()
      }).eq('id', shipment.id);
    }

    return new Response(JSON.stringify({
      success: true,
      trackingNumber: trkNum,
      labelUrl,
      labelBase64
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
