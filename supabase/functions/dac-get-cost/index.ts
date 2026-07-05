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
    console.log("[DAC Get Cost] Raw payload received:", JSON.stringify(body));

    // Support unified mapping for both Checkout payload and Admin Logistics payload
    const mode = body.mode || "home"; // 'home' or 'agency'
    const department = body.department || "";
    const city = body.city || body.locality || "";
    const address = body.address || body.direccion || body.Direccion_Destinatario || "";
    const packages = body.package_quantity || body.packages || body.Paquetes_Ampara || 1;
    const dac_office_id = body.dac_office_id || null;
    const k_oficina_destino = body.k_oficina_destino !== undefined ? body.k_oficina_destino : body.K_Oficina_Destino;

    console.log("[DAC Get Cost] Resolved inputs:", { mode, department, city, address, packages, dac_office_id, k_oficina_destino });

    // 1. Fetch DAC provider details
    const { data: provider, error: providerErr } = await supabase
      .from('shipping_providers')
      .select('*')
      .eq('code', 'dac')
      .single();

    if (providerErr || !provider) {
      throw new Error("No se encontró la configuración del proveedor DAC en la base de datos.");
    }

    if (!provider.is_active || provider.status !== 'active') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "El servicio DAC no está activo.",
        technical_error: "Provider inactive in database" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { username, password_encrypted, api_url, settings = {} } = provider;
    if (!username || !password_encrypted || !api_url) {
      throw new Error("Credenciales de DAC incompletas en shipping_providers.");
    }

    // 2. Resolve destination office (K_Oficina_Destino) — NO FALLBACKS
    let selectedOffice = null;

    if (mode === "agency") {
      // AGENCY MODE: Must have a specific office selected
      if (dac_office_id) {
        const { data: office, error: officeErr } = await supabase
          .from('dac_offices')
          .select('*')
          .eq('id', dac_office_id)
          .single();
        if (officeErr || !office) {
          throw new Error(`No se encontró la oficina DAC con ID ${dac_office_id}`);
        }
        selectedOffice = {
          k_oficina: Number(office.k_oficina),
          office_name: office.office_name,
          address: office.address || office.office_name
        };
      } else if (k_oficina_destino !== undefined && k_oficina_destino !== null && k_oficina_destino !== "") {
        const { data: office } = await supabase
          .from('dac_offices')
          .select('*')
          .eq('k_oficina', Number(k_oficina_destino))
          .maybeSingle();
        if (!office) {
          throw new Error(`No se encontró la oficina DAC con código ${k_oficina_destino}`);
        }
        selectedOffice = {
          k_oficina: Number(k_oficina_destino),
          office_name: office.office_name || `Agencia DAC (${k_oficina_destino})`,
          address: office.address || office.office_name || `Agencia DAC (${k_oficina_destino})`
        };
      } else {
        throw new Error("Para retiro en agencia DAC, debe seleccionar una agencia.");
      }
    } else {
      // HOME MODE: Resolve office from department/city
      if (!address) {
        throw new Error("Para entrega a domicilio, la dirección es obligatoria.");
      }

      if (k_oficina_destino !== undefined && k_oficina_destino !== null && k_oficina_destino !== "") {
        // Admin test override: use the provided k_oficina directly
        selectedOffice = {
          k_oficina: Number(k_oficina_destino),
          office_name: `Oficina Manual (${k_oficina_destino})`,
          address: address
        };
      } else {
        if (!department) throw new Error("Falta el departamento para cotizar envío DAC.");
        if (!city) throw new Error("Falta la localidad/ciudad para cotizar envío DAC.");

        // Look up offices for this department
        const { data: offices, error: officeErr } = await supabase
          .from('dac_offices')
          .select('k_oficina, office_name, address, city')
          .eq('is_active', true)
          .ilike('department', department.trim());

        if (officeErr) {
          throw new Error(`Error buscando oficinas DAC: ${officeErr.message}`);
        }

        if (!offices || offices.length === 0) {
          throw new Error(`No pudimos identificar la oficina DAC para el departamento "${department}". Consultanos por WhatsApp.`);
        }

        // Try to match by city name
        const normalizedCity = city.trim().toLowerCase();
        const exactMatch = offices.find(o =>
          o.city && o.city.toLowerCase() === normalizedCity
        );
        const partialMatch = offices.find(o =>
          o.office_name.toLowerCase().includes(normalizedCity) ||
          normalizedCity.includes(o.office_name.toLowerCase().replace('dac ', ''))
        );

        if (exactMatch) {
          selectedOffice = {
            k_oficina: Number(exactMatch.k_oficina),
            office_name: exactMatch.office_name,
            address: address
          };
        } else if (partialMatch) {
          selectedOffice = {
            k_oficina: Number(partialMatch.k_oficina),
            office_name: partialMatch.office_name,
            address: address
          };
        } else {
          // Use the first (main) office for the department — this is the department capital
          selectedOffice = {
            k_oficina: Number(offices[0].k_oficina),
            office_name: offices[0].office_name,
            address: address
          };
        }
      }
    }

    console.log("[DAC Get Cost] Resolved destination office:", selectedOffice);

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

    // 4. Calculate cost calling JSON wsObtieneCosto_Nuevo — ALL NUMERIC PARAMS
    const kClienteRemitente = sessionParam.k_cliente ? parseInt(sessionParam.k_cliente) : 99090;
    
    // Read parameters from settings with default fallbacks
    const kTipoGuia = settings.k_tipo_guia !== undefined ? Number(settings.k_tipo_guia) : 4;
    const kTipoEnvio = settings.k_tipo_envio !== undefined ? Number(settings.k_tipo_envio) : 1;
    const kClienteDestinatario = settings.k_cliente_destinatario !== undefined ? Number(settings.k_cliente_destinatario) : 5;
    
    const entregaDomicilio = settings.entrega_domicilio !== undefined ? Number(settings.entrega_domicilio) : 1;
    const entregaAgencia = settings.entrega_agencia !== undefined ? Number(settings.entrega_agencia) : 2;
    const entrega = mode === "agency" ? entregaAgencia : entregaDomicilio;

    const esRecoleccion = settings.es_recoleccion !== undefined ? Number(settings.es_recoleccion) : 0;

    const dacAddress = mode === "agency" ? (selectedOffice.address || selectedOffice.office_name) : address;

    // ALL values as numbers (not strings) — this is what DAC's JSON endpoint expects
    const costInput = {
      ID_Sesion: sessionParam.id_session,
      K_Tipo_Guia: kTipoGuia,
      K_Tipo_Envio: kTipoEnvio,
      K_Cliente_Remitente: kClienteRemitente,
      K_Cliente_Destinatario: kClienteDestinatario,
      Direccion_Destinatario: dacAddress,
      K_Oficina_Destino: selectedOffice.k_oficina,
      Entrega: entrega,
      Paquetes_Ampara: Number(packages),
      Detalle_Paquetes: JSON.stringify([{ Cantidad: Number(packages), Tipo: 1 }]),
      esRecoleccion: esRecoleccion,
      usaBolsa: 0
    };

    console.log("[DAC Get Cost] Cost request params (safe):", {
      ...costInput,
      ID_Sesion: costInput.ID_Sesion.substring(0, 10) + '...',
      K_Oficina_Destino: costInput.K_Oficina_Destino,
      Entrega: costInput.Entrega,
      mode
    });

    // NO FALLBACK: If DAC can't calculate, we throw. Payment must be blocked.
    let cost: number;
    try {
      cost = await wsObtieneCostoNuevo(api_url, costInput);
    } catch (costErr: any) {
      console.error("[DAC Get Cost] Cost calculation FAILED (no fallback):", costErr.message);
      
      const userMsg = mode === "agency"
        ? "No pudimos cotizar esta agencia DAC. Elegí otra agencia o consultanos por WhatsApp."
        : `No pudimos calcular el envío DAC para ${city || department}. Consultanos por WhatsApp.`;
      
      return new Response(JSON.stringify({
        success: false,
        error: userMsg,
        technical_error: costErr.message,
        debug: {
          mode,
          department,
          city,
          k_oficina_used: selectedOffice.k_oficina,
          office_name: selectedOffice.office_name,
          entrega
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log("[DAC COST RESULT]", {
      mode,
      department,
      city,
      k_oficina: selectedOffice.k_oficina,
      office_name: selectedOffice.office_name,
      entrega,
      cost
    });

    return new Response(JSON.stringify({
      success: true,
      provider: "dac",
      cost: cost,
      currency: "UYU",
      finalKOficina: selectedOffice.k_oficina,
      officeName: selectedOffice.office_name,
      raw_response: {
        costo: cost,
        oficina: selectedOffice.office_name,
        k_oficina: selectedOffice.k_oficina,
        entrega: entrega,
        modo: mode,
        tiempo_estimado: "24-48 hs hábiles"
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[DAC Get Cost Error]:", error.message);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || "No pudimos calcular DAC para esta localidad. Consultanos por WhatsApp.", 
      technical_error: error.message 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
