import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { wsLogin, wsObtieneCostoNuevo, DacSession } from "../_shared/dac-client.ts";

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
      department,
      city,
      direccion = "",
      packages = 1,
      k_oficina_destino
    } = body;

    // 1. Fetch DAC provider details
    const { data: provider, error: providerErr } = await supabase
      .from('delivery_providers')
      .select('*')
      .eq('provider_key', 'dac')
      .single();

    if (providerErr || !provider) {
      throw new Error("No se encontró la configuración del proveedor DAC en la base de datos.");
    }

    if (!provider.is_active) {
      return new Response(JSON.stringify({ success: false, error: "El servicio DAC no está activo." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { username, password_encrypted, api_url, settings = {} } = provider;
    if (!username || !password_encrypted || !api_url) {
      throw new Error("Credenciales de DAC incompletas en delivery_providers.");
    }

    // 2. Resolve destination office (K_Oficina_Destino) from dac_offices or override
    let selectedOffice = null;

    if (k_oficina_destino !== undefined) {
      selectedOffice = {
        k_oficina: Number(k_oficina_destino),
        office_name: "Oficina de Prueba (Override)"
      };
    } else {
      if (!department) throw new Error("Falta el departamento para cotizar");
      if (!city) throw new Error("Falta la localidad/ciudad para cotizar");

      // Try exact department and city match
      let officeQuery = supabase
        .from('dac_offices')
        .select('k_oficina, office_name')
        .eq('is_active', true)
        .ilike('department', department.trim());
        
      const { data: offices, error: officeErr } = await officeQuery;
      if (officeErr) {
        throw new Error(`Error buscando oficinas de DAC: ${officeErr.message}`);
      }

      if (offices && offices.length > 0) {
        const normalizedCity = city.trim().toLowerCase();
        selectedOffice = offices.find(o => o.office_name.toLowerCase().includes(normalizedCity) || normalizedCity.includes(o.office_name.toLowerCase()));
        
        if (!selectedOffice) {
          selectedOffice = offices[0]; // fallback
        }
      }

      if (!selectedOffice) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: `No pudimos calcular el costo DAC para esta localidad. Contactanos por WhatsApp.` 
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

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
      console.log("[DAC Get Cost] Logging in due to missing/expired session...");
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
      
      if (sessionErr) throw new Error(`Error al almacenar nueva sesión: ${sessionErr.message}`);
      sessionObj = storedSession;
    }

    const sessionParam: DacSession = {
      id_session: sessionObj.session_id,
      k_cliente: sessionObj.k_cliente,
      k_usuario: sessionObj.k_usuario,
      rut: sessionObj.rut
    };

    // 4. Calculate cost calling JSON wsObtieneCosto_Nuevo
    const kClienteRemitente = sessionParam.k_cliente ? parseInt(sessionParam.k_cliente) : 99090;
    
    // Read parameters from settings with default fallbacks
    const kTipoGuia = settings.k_tipo_guia !== undefined ? Number(settings.k_tipo_guia) : 4;
    const kTipoEnvio = settings.k_tipo_envio !== undefined ? Number(settings.k_tipo_envio) : 1;
    const kClienteDestinatario = settings.k_cliente_destinatario !== undefined ? Number(settings.k_cliente_destinatario) : 5;
    const entrega = settings.entrega !== undefined ? Number(settings.entrega) : 1;
    const esRecoleccion = settings.es_recoleccion !== undefined ? Number(settings.es_recoleccion) : 1;
    const usaBolsa = settings.usa_bolsa !== undefined ? Number(settings.usa_bolsa) : 0;

    const costInput = {
      ID_Sesion: sessionParam.id_session,
      K_Tipo_Guia: kTipoGuia,
      K_Tipo_Envio: kTipoEnvio,
      K_Cliente_Remitente: kClienteRemitente,
      K_Cliente_Destinatario: kClienteDestinatario,
      Direccion_Destinatario: direccion,
      K_Oficina_Destino: selectedOffice.k_oficina,
      Entrega: entrega,
      Paquetes_Ampara: packages,
      Detalle_Paquetes: JSON.stringify([{ Cantidad: packages, Tipo: 1 }]),
      esRecoleccion: esRecoleccion,
      usaBolsa: usaBolsa
    };

    const cost = await wsObtieneCostoNuevo(api_url, costInput);

    return new Response(JSON.stringify({
      success: true,
      costo: cost,
      oficina: selectedOffice.office_name,
      k_oficina: selectedOffice.k_oficina,
      tiempo_estimado: "24-48 hs hábiles" // Standard DAC delivery estimation
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[DAC Get Cost Error]:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
