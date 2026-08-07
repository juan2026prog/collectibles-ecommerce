import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { decryptData } from "../_shared/crypto.ts";

const DISTRILOGIC_CREATE_TEST_URL = "http://test.DISTRILOGIC.com.uy/rest/wsaltaservicioetiquetaV2";
const DISTRILOGIC_CREATE_PROD_URL = "http://tracking.districad.com.uy/rest/wsaltaservicioetiquetaV2";

function parseAddress(fullAddress: string) {
  if (!fullAddress) return { street: 'Sin Especificar', number: 'S/N', apto: 0 };
  const matches = fullAddress.match(/^(.+?)\s+(\d+[\w-]*)(?:\s*(?:apto|apt|depto)\s*(.*))?$/i);
  if (matches) {
    return {
      street: matches[1].trim(),
      number: matches[2].trim(),
      apto: matches[3] ? parseInt(matches[3].replace(/[^\d]/g, ''), 10) || 0 : 0
    };
  }
  return { street: fullAddress.trim(), number: '1', apto: 0 };
}

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { 
      order_id, 
      vendor_id, 
      package_id = 'pkg-1', 
      customer, 
      external_service_id, 
      external_service_name,
      customer_cost = 0,
      provider_cost = 0,
      free_shipping = false 
    } = body;

    if (!order_id || !vendor_id || !customer) {
      throw new Error("Faltan parámetros obligatorios: order_id, vendor_id o customer");
    }

    const idempotentKey = `${order_id}-${vendor_id}-${package_id}`.substring(0, 20);

    // Check existing shipment
    const { data: existingShipment } = await supabase
      .from('shipments')
      .select('*')
      .eq('order_id', order_id)
      .eq('vendor_id', vendor_id)
      .eq('provider_key', 'distrilogic')
      .maybeSingle();

    if (existingShipment && existingShipment.external_tracking_number) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Envío ya generado previamente", 
        shipment: existingShipment 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Fetch vendor connection
    const { data: connection, error: connError } = await supabase
      .from('vendor_shipping_connections')
      .select('*')
      .eq('vendor_id', vendor_id)
      .eq('provider', 'distrilogic')
      .eq('connection_status', 'connected')
      .single();

    if (connError || !connection) {
      throw new Error("El vendedor no tiene configurada una integración activa con Distrilogic");
    }

    // Decrypt credentials
    const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
    const credentialsRaw = await decryptData(connection.credentials_encrypted, secret);
    const credentials = JSON.parse(credentialsRaw);

    const { guid, usuario, password, cueId, cue_id, environment = 'testing' } = credentials;
    const clientCueId = cueId || cue_id || connection.settings?.cue_id;

    const targetUrl = environment === 'production' ? DISTRILOGIC_CREATE_PROD_URL : DISTRILOGIC_CREATE_TEST_URL;

    // Parse address components
    const addressParsed = parseAddress(customer.address || customer.street || '');
    const streetName = customer.street_name || addressParsed.street;
    const houseNumber = customer.street_number || addressParsed.number;
    const apartment = customer.apartment ? parseInt(String(customer.apartment).replace(/[^\d]/g, ''), 10) || 0 : addressParsed.apto;

    // Build Distrilogic Alta Servicio Payload
    const distrilogicPayload = {
      WSAutorizacion: {
        Guid: String(guid).trim(),
        Usuario: String(usuario).trim(),
        Password: String(password).trim()
      },
      Servicio: {
        SrvTrkNbr: "",
        CueId: String(clientCueId).trim(),
        TSrvId: external_service_id ? String(external_service_id) : "1",
        SrvFchEnt: new Date().toISOString().split('T')[0],
        SrvHorario: "AM",
        SrvEntHD: "09:00",
        SrvEntHH: "19:00",
        SrvCnt: 1,
        SrvCon: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.name || 'Cliente Collectibles',
        SrvMail: customer.email || '',
        SrvCel: customer.phone || '099000000',
        PaiCod: "UY",
        DeptoCod: (customer.department || customer.state || 'Montevideo').toUpperCase(),
        LocCod: customer.city || customer.locality || 'Montevideo',
        SrvDstCalle: streetName,
        SrvDstNro: String(houseNumber),
        SrvDstApto: apartment,
        SrvDirLat: "-34.9011",
        SrvDirLon: "-56.1645",
        SrvNotas: `Orden #${order_id.slice(0, 8)} - ${customer.reference || ''}`,
        SrvReqDoc: "N",
        SrvReqTipoDoc: "",
        SrvReqPago: "N",
        SrvReqPagoImp: "0.00",
        SrvReqPagoImpT: "",
        SrvUsuIni: String(usuario).trim(),
        SrvPostUrl: "",
        IdEXT: idempotentKey
      }
    };

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(distrilogicPayload)
    });

    if (!res.ok) {
      throw new Error(`Error de red HTTP ${res.status} al crear servicio en Distrilogic`);
    }

    const resData = await res.json();
    const errorCode = resData.ErrorCode ?? resData.errorCode;
    const errorMsg = resData.ErrorMsg ?? resData.errorMsg ?? "";

    if (errorCode !== 200) {
      throw new Error(`Error al crear servicio en Distrilogic [${errorCode}]: ${errorMsg}`);
    }

    const trackingNumber = resData.SrvTrkNbr || resData.srvTrkNbr;
    const labelBase64 = resData.Etiqueta || resData.etiqueta;

    let storagePath = null;
    let labelPublicUrl = null;

    if (labelBase64) {
      try {
        const cleanBase64 = labelBase64.replace(/^data:application\/pdf;base64,/, '');
        const binaryString = atob(cleanBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const fileName = `distrilogic/${vendor_id}/${trackingNumber || order_id}.pdf`;
        const { data: storageUpload, error: uploadErr } = await supabase.storage
          .from('shipping-labels')
          .upload(fileName, bytes, {
            contentType: 'application/pdf',
            upsert: true
          });

        if (!uploadErr && storageUpload) {
          storagePath = storageUpload.path;
          const { data: urlData } = supabase.storage.from('shipping-labels').getPublicUrl(storagePath);
          labelPublicUrl = urlData.publicUrl;
        }
      } catch (err) {
        console.error("[distrilogic-create-shipment] Error guardando PDF de etiqueta:", err);
      }
    }

    const shipmentRecord = {
      order_id,
      vendor_id,
      integration_id: connection.id,
      provider_key: 'distrilogic',
      tracking_code: trackingNumber,
      external_tracking_number: trackingNumber,
      external_guide: trackingNumber,
      external_service_id,
      external_service_name: external_service_name || 'Distrilogic Standard',
      shipping_status: 'preparing',
      external_status_code: 9,
      external_status_description: 'EN PREPARACIÓN',
      customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      customer_phone: customer.phone,
      customer_address: `${streetName} ${houseNumber}`,
      customer_city: customer.city,
      customer_department: customer.department,
      customer_shipping_cost,
      provider_shipping_cost,
      free_shipping_applied: free_shipping,
      shipping_label_url: labelPublicUrl,
      label_storage_path: storagePath,
      label_generated_at: labelBase64 ? new Date().toISOString() : null,
      provider_response: {
        errorCode,
        errorMsg,
        environment
      },
      updated_at: new Date().toISOString()
    };

    const { data: savedShipment, error: saveErr } = await supabase
      .from('shipments')
      .upsert(shipmentRecord, { onConflict: 'order_id' })
      .select('*')
      .single();

    if (saveErr) {
      console.error("[distrilogic-create-shipment] Error guardando shipment:", saveErr);
    }

    if (savedShipment) {
      await supabase.from('shipment_events').insert({
        shipment_id: savedShipment.id,
        event_type: 'created',
        description: 'Envío creado exitosamente en Distrilogic',
        provider_status: 'EN PREPARACIÓN',
        raw_response: { tracking_number: trackingNumber, environment }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Envío creado exitosamente en Distrilogic",
      trackingNumber,
      shipment: savedShipment || shipmentRecord
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
