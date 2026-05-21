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
      .from('delivery_providers')
      .select('*')
      .eq('provider_key', 'dac')
      .single();

    if (providerErr || !provider) {
      throw new Error("No se encontró la configuración del proveedor DAC en la base de datos.");
    }

    if (!provider.is_active) {
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
      throw new Error("Credenciales de DAC incompletas en delivery_providers.");
    }

    // 2. Resolve destination office (K_Oficina_Destino) from dac_offices or override
    let selectedOffice = null;

    if (mode === "agency") {
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
        selectedOffice = {
          k_oficina: Number(k_oficina_destino),
          office_name: office?.office_name || `Agencia DAC (${k_oficina_destino})`,
          address: office?.address || office?.office_name || `Agencia DAC (${k_oficina_destino})`
        };
      } else {
        throw new Error("Para retiro en agencia DAC, debe seleccionar una agencia.");
      }
    } else {
      // mode === 'home'
      if (!address) {
        throw new Error("Para entrega a domicilio, la dirección es obligatoria.");
      }
      if (k_oficina_destino !== undefined && k_oficina_destino !== null && k_oficina_destino !== "") {
        selectedOffice = {
          k_oficina: Number(k_oficina_destino),
          office_name: `Oficina de Prueba (${k_oficina_destino})`,
          address: address
        };
      } else {
        if (!department) throw new Error("Falta el departamento para cotizar");
        if (!city) throw new Error("Falta la localidad/ciudad para cotizar");

        // Try exact department match
        let officeQuery = supabase
          .from('dac_offices')
          .select('k_oficina, office_name, address')
          .eq('is_active', true)
          .ilike('department', department.trim());
          
        const { data: offices, error: officeErr } = await officeQuery;
        if (officeErr) {
          throw new Error(`Error buscando oficinas de DAC: ${officeErr.message}`);
        }

        if (offices && offices.length > 0) {
          const normalizedCity = city.trim().toLowerCase();
          const found = offices.find(o => 
            o.office_name.toLowerCase().includes(normalizedCity) || 
            normalizedCity.includes(o.office_name.toLowerCase())
          );
          
          if (found) {
            selectedOffice = {
              k_oficina: Number(found.k_oficina),
              office_name: found.office_name,
              address: address
            };
          } else {
            selectedOffice = {
              k_oficina: Number(offices[0].k_oficina),
              office_name: offices[0].office_name,
              address: address
            }; // fallback to first office in that department
          }
        }

        // If still no office is found, fallback to settings.k_oficina_destino_default or 601
        if (!selectedOffice) {
          const defaultOfficeK = settings.k_oficina_destino_default !== undefined && settings.k_oficina_destino_default !== null
            ? Number(settings.k_oficina_destino_default)
            : 601;
          selectedOffice = {
            k_oficina: defaultOfficeK,
            office_name: `Oficina Predeterminada (${defaultOfficeK})`,
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

    // 4. Calculate cost calling JSON wsObtieneCosto_Nuevo
    const kClienteRemitente = sessionParam.k_cliente ? parseInt(sessionParam.k_cliente) : 99090;
    
    // Read parameters from settings with default fallbacks
    const kTipoGuia = settings.k_tipo_guia !== undefined ? Number(settings.k_tipo_guia) : 4;
    const kTipoEnvio = settings.k_tipo_envio !== undefined ? Number(settings.k_tipo_envio) : 1;
    const kClienteDestinatario = settings.k_cliente_destinatario !== undefined ? Number(settings.k_cliente_destinatario) : 5;
    
    const entregaDomicilio = settings.entrega_domicilio !== undefined ? Number(settings.entrega_domicilio) : 1;
    const entregaAgencia = settings.entrega_agencia !== undefined ? Number(settings.entrega_agencia) : 2;
    const entrega = mode === "agency" ? entregaAgencia : entregaDomicilio;

    const esRecoleccion = settings.es_recoleccion !== undefined ? Number(settings.es_recoleccion) : 1;
    const usaBolsa = settings.usa_bolsa !== undefined ? Number(settings.usa_bolsa) : 0;

    const dacAddress = mode === "agency" ? (selectedOffice.address || selectedOffice.office_name) : address;

    const costInput = {
      ID_Sesion: sessionParam.id_session,
      K_Tipo_Guia: kTipoGuia,
      K_Tipo_Envio: kTipoEnvio,
      K_Cliente_Remitente: kClienteRemitente,
      K_Cliente_Destinatario: kClienteDestinatario,
      Direccion_Destinatario: dacAddress,
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
      provider: "dac",
      cost: cost,
      currency: "UYU",
      raw_response: {
        costo: cost,
        oficina: selectedOffice.office_name,
        k_oficina: selectedOffice.k_oficina,
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
      error: "No pudimos calcular DAC para esta localidad. Consultanos por WhatsApp.", 
      technical_error: error.message 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
