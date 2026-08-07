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

    const { vendor_id, destination, package_subtotal = 0, package_quantity = 1 } = await req.json();

    if (!vendor_id || !destination || !destination.department) {
      throw new Error("Parámetros requeridos incompletos: vendor_id o destination.department");
    }

    // 1. Fetch vendor connection
    const { data: connection } = await supabase
      .from('vendor_shipping_connections')
      .select('*')
      .eq('vendor_id', vendor_id)
      .eq('provider', 'distrilogic')
      .eq('connection_status', 'connected')
      .maybeSingle();

    if (!connection || !connection.credentials_encrypted) {
      return new Response(JSON.stringify({ success: true, options: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Fetch vendor configured services
    const { data: vendorServices } = await supabase
      .from('vendor_shipping_services')
      .select('*')
      .eq('vendor_id', vendor_id)
      .eq('provider', 'distrilogic')
      .eq('enabled', true)
      .order('sort_order', { ascending: true });

    if (!vendorServices || vendorServices.length === 0) {
      return new Response(JSON.stringify({ success: true, options: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 3. Decrypt credentials
    const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
    const credentialsRaw = await decryptData(connection.credentials_encrypted, secret);
    const credentials = JSON.parse(credentialsRaw);

    const { guid, usuario, password, cueId, cue_id, environment = 'testing' } = credentials;
    const clientCueId = cueId || cue_id || connection.settings?.cue_id;

    const targetUrl = environment === 'production' ? DISTRILOGIC_PROD_URL : DISTRILOGIC_TEST_URL;

    // 4. Query Distrilogic rates for destination department
    const payload = {
      WSAutorizacion: {
        Guid: String(guid).trim(),
        Usuario: String(usuario).trim(),
        Password: String(password).trim()
      },
      CueId: String(clientCueId).trim(),
      DeptoCod: destination.department.trim()
    };

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.warn(`[distrilogic-quote] Error HTTP ${res.status}`);
      return new Response(JSON.stringify({ success: true, options: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const resData = await res.json();
    const rawTarifas: any[] = resData.MTarifas || resData.mtarifas || [];

    const options: any[] = [];
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins TTL

    for (const vService of vendorServices) {
      const matchedTarifa = rawTarifas.find(t => String(t.TSrvId || t.tsrvId) === String(vService.external_service_id));
      const providerCost = matchedTarifa ? parseFloat(matchedTarifa.TrfImp || matchedTarifa.trfImp || '0') : 180;

      let customerCost = providerCost;

      if (vService.markup_type === 'fixed') {
        customerCost = providerCost + parseFloat(vService.markup_value || 0);
      } else if (vService.markup_type === 'percentage') {
        customerCost = providerCost * (1 + parseFloat(vService.markup_value || 0) / 100);
      }

      customerCost = Math.round(customerCost * 100) / 100;

      let freeShippingApplied = false;
      if (vService.free_shipping_enabled && vService.free_shipping_threshold > 0) {
        if (package_subtotal >= vService.free_shipping_threshold) {
          customerCost = 0;
          freeShippingApplied = true;
        }
      }

      const quotePayload = {
        vendor_id,
        integration_id: connection.id,
        provider: 'distrilogic',
        destination_department: destination.department,
        destination_locality: destination.locality || '',
        external_service_id: vService.external_service_id,
        provider_cost: providerCost,
        customer_cost: customerCost,
        free_shipping_applied: freeShippingApplied,
        expires_at: expiresAt,
        metadata: {
          external_service_name: vService.external_service_name,
          display_name: vService.display_name,
          estimated_delivery: vService.estimated_delivery_text
        }
      };

      const { data: savedQuote } = await supabase
        .from('shipping_quotes')
        .insert(quotePayload)
        .select('id')
        .single();

      options.push({
        quoteId: savedQuote?.id || `q-${vService.external_service_id}`,
        provider: 'distrilogic',
        serviceId: `distrilogic_${vService.external_service_id}`,
        externalServiceId: vService.external_service_id,
        serviceName: vService.external_service_name,
        displayName: vService.display_name || vService.external_service_name,
        estimatedDelivery: vService.estimated_delivery_text || '24hs a 72hs hábiles',
        originalCost: providerCost,
        customerCost: customerCost,
        freeShipping: freeShippingApplied,
        available: true,
        expiresAt
      });
    }

    return new Response(JSON.stringify({ success: true, options }), {
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
