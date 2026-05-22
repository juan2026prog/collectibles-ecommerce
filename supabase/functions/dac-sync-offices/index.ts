import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { wsLogin } from "../_shared/dac-client.ts";

/**
 * DAC Sync Offices — Fetches all offices from wsOficina(K_Oficina=0)
 * and upserts them into the dac_offices table.
 * Also supports testing costs for all offices when mode=test.
 */
serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "sync"; // 'sync' | 'test'

    // Get DAC credentials
    const { data: provider } = await supabase
      .from('delivery_providers')
      .select('*')
      .eq('provider_key', 'dac')
      .single();

    if (!provider) throw new Error("DAC provider not found");

    const { username, password_encrypted, api_url } = provider;

    // Login
    const session = await wsLogin(api_url, username, password_encrypted);

    // Fetch all offices via JSON endpoint
    const officeUrl = api_url.replace('/GAgencia/GAgencia.asmx', '/JAgencia/JAgencia.asmx/wsOficina');
    const officeRes = await fetch(officeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ ID_Sesion: session.id_session, K_Oficina: 0 })
    });
    const officeData = await officeRes.json();

    if (officeData.result !== 0 || !Array.isArray(officeData.data)) {
      throw new Error(`Failed to fetch offices: ${JSON.stringify(officeData).substring(0, 200)}`);
    }

    const offices = officeData.data;
    console.log(`[DAC Sync] Fetched ${offices.length} offices from DAC API`);

    if (action === "sync") {
      // Upsert offices
      let added = 0, updated = 0, errors = 0;

      for (const o of offices) {
        const row = {
          k_oficina: o.K_Oficina,
          office_name: (o.D_Oficina || '').trim(),
          department: (o.D_Estado || '').trim(),
          city: (o.D_Ciudad || '').trim(),
          address: (o.Calle || '').trim(),
          barrio: (o.D_Barrio || '').trim(),
          phone: (o.Telefono || '').trim(),
          latitude: (o.Latitud || '').trim(),
          longitude: (o.Longitud || '').trim(),
          k_ciudad: o.K_Ciudad || 0,
          k_estado: o.K_Estado || 0,
          is_active: true,
          supports_pickup: true,
          supports_delivery: true,
          updated_at: new Date().toISOString()
        };

        const { data: existing } = await supabase
          .from('dac_offices')
          .select('id')
          .eq('k_oficina', o.K_Oficina)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('dac_offices')
            .update(row)
            .eq('k_oficina', o.K_Oficina);
          if (error) { errors++; console.error(`Update error for ${o.K_Oficina}:`, error.message); }
          else updated++;
        } else {
          const { error } = await supabase
            .from('dac_offices')
            .insert(row);
          if (error) { errors++; console.error(`Insert error for ${o.K_Oficina}:`, error.message); }
          else added++;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        total_from_api: offices.length,
        added,
        updated,
        errors,
        synced_at: new Date().toISOString()
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (action === "test") {
      // Test cost for all offices
      const costUrl = api_url.replace('/GAgencia/GAgencia.asmx', '/JAgencia/JAgencia.asmx/wsObtieneCosto_Nuevo');
      const kCliente = parseInt(session.k_cliente) || 365928;
      const results: any[] = [];

      for (const o of offices) {
        // Test domicilio
        const domPayload = {
          ID_Sesion: session.id_session,
          K_Tipo_Guia: 4, K_Tipo_Envio: 1,
          K_Cliente_Remitente: kCliente,
          K_Cliente_Destinatario: 5,
          Direccion_Destinatario: o.Calle || "Test",
          K_Oficina_Destino: o.K_Oficina,
          Entrega: 1, Paquetes_Ampara: 1,
          Detalle_Paquetes: JSON.stringify([{ Cantidad: 1, Tipo: 1 }]),
          esRecoleccion: 0, usaBolsa: 0
        };

        const domRes = await fetch(costUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(domPayload)
        });
        const domData = await domRes.json();

        // Save to dac_office_cost_tests
        const domEntry = {
          k_oficina: o.K_Oficina,
          office_name: o.D_Oficina,
          mode: 'domicilio',
          request_payload: domPayload,
          raw_response: domData,
          parsed_cost: domData.result === 0 ? domData.data?.Total_Guia : null,
          success: domData.result === 0,
          error_message: domData.result !== 0 ? (typeof domData.data === 'string' ? domData.data : 'Unknown error') : null,
          tested_at: new Date().toISOString()
        };

        await supabase.from('dac_office_cost_tests').insert(domEntry);

        // Test agency
        const agePayload = { ...domPayload, Entrega: 2 };
        const ageRes = await fetch(costUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(agePayload)
        });
        const ageData = await ageRes.json();

        const ageEntry = {
          k_oficina: o.K_Oficina,
          office_name: o.D_Oficina,
          mode: 'agencia',
          request_payload: agePayload,
          raw_response: ageData,
          parsed_cost: ageData.result === 0 ? ageData.data?.Total_Guia : null,
          success: ageData.result === 0,
          error_message: ageData.result !== 0 ? (typeof ageData.data === 'string' ? ageData.data : 'Unknown error') : null,
          tested_at: new Date().toISOString()
        };

        await supabase.from('dac_office_cost_tests').insert(ageEntry);

        results.push({
          k_oficina: o.K_Oficina,
          office_name: o.D_Oficina,
          department: o.D_Estado,
          domicilio_cost: domEntry.parsed_cost,
          agency_cost: ageEntry.parsed_cost,
          dom_success: domEntry.success,
          age_success: ageEntry.success
        });
      }

      const domOk = results.filter(r => r.dom_success).length;
      const ageOk = results.filter(r => r.age_success).length;

      return new Response(JSON.stringify({
        success: true,
        total_tested: results.length,
        domicilio_ok: domOk,
        agency_ok: ageOk,
        results,
        tested_at: new Date().toISOString()
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[DAC Sync Error]:", error.message);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
    });
  }
});
