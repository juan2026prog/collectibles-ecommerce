import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { decryptData } from "../_shared/crypto.ts";

const DISTRILOGIC_TEST_URL = "http://test.DISTRILOGIC.com.uy/rest/WsGetTarifaPorCliente";
const DISTRILOGIC_PROD_URL = "http://tracking.districad.com.uy/rest/WsGetTarifaPorCliente";

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

    // Fetch vendor connection
    const { data: connection, error: connError } = await supabase
      .from('vendor_shipping_connections')
      .select('*')
      .eq('vendor_id', user.id)
      .eq('provider', 'distrilogic')
      .single();

    if (connError || !connection) {
      throw new Error("No existe una integración de Distrilogic configurada para este vendedor.");
    }

    const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
    const credentialsRaw = await decryptData(connection.credentials_encrypted, secret);
    const credentials = JSON.parse(credentialsRaw);

    const { guid, usuario, password, cueId, cue_id, environment = 'testing' } = credentials;
    const clientCueId = cueId || cue_id || connection.settings?.cue_id;

    if (!guid || !usuario || !password || !clientCueId) {
      throw new Error("Credenciales de Distrilogic incompletas.");
    }

    const targetUrl = environment === 'production' ? DISTRILOGIC_PROD_URL : DISTRILOGIC_TEST_URL;

    // Fetch rates for Montevideo as baseline or general inquiry
    const payload = {
      WSAutorizacion: {
        Guid: String(guid).trim(),
        Usuario: String(usuario).trim(),
        Password: String(password).trim()
      },
      CueId: String(clientCueId).trim(),
      DeptoCod: "Montevideo"
    };

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Error de red HTTP ${res.status} al sincronizar servicios con Distrilogic`);
    }

    const resData = await res.json();
    const errorCode = resData.ErrorCode ?? resData.errorCode;

    if (errorCode !== 200 && errorCode !== 405) {
      throw new Error(`Distrilogic respondió error [${errorCode}]: ${resData.ErrorMsg || 'No se pudieron obtener servicios'}`);
    }

    const rawTarifas = resData.MTarifas || resData.mtarifas || [];
    const syncedServices: any[] = [];

    for (let i = 0; i < rawTarifas.length; i++) {
      const t = rawTarifas[i];
      const extId = String(t.TSrvId || t.tsrvId || `srv-${i}`);
      const extName = String(t.TSrvDsc || t.tsrvDsc || 'Servicio Distrilogic');

      const servicePayload = {
        integration_id: connection.id,
        vendor_id: user.id,
        provider: 'distrilogic',
        external_service_id: extId,
        external_service_name: extName,
        display_name: extName,
        enabled: true,
        estimated_delivery_text: t.TSrvTEnt ? `${t.TSrvTEnt} ${t.TSrvTEntUnd || 'HS'}` : '24 a 48 hs hábiles',
        sort_order: i + 1,
        metadata: {
          peso_desde: t.TSrvPesoD,
          peso_hasta: t.TSrvPesoH,
          unidad_peso: t.TSrvPesoUnd,
          tarifa_base: t.TrfImp,
          bulto_tipo: t.TsrvTBul,
          departamentos: t.Departamentos || []
        },
        updated_at: new Date().toISOString()
      };

      const { data: savedSvc, error: svcError } = await supabase
        .from('vendor_shipping_services')
        .upsert(servicePayload, { onConflict: 'vendor_id,provider,external_service_id' })
        .select('*')
        .single();

      if (!svcError && savedSvc) {
        syncedServices.push(savedSvc);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Sincronización completada. ${syncedServices.length} servicios registrados.`,
      services: syncedServices
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
