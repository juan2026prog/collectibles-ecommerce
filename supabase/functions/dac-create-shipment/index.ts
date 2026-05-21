import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { wsInGuiaPeso, wsGetPegoteJson, wsLogin } from "../_shared/dac-client.ts";

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
      customer_name,
      customer_phone,
      customer_address,
      customer_city,
      customer_department,
      package_weight,
      package_quantity,
      observations = ""
    } = body;

    // 1. Validation
    if (!order_id) throw new Error("Missing order_id");
    if (!customer_name) throw new Error("Missing customer_name");
    if (!customer_phone) throw new Error("Missing customer_phone");
    if (!customer_city) throw new Error("Missing customer_city");
    if (!customer_department) throw new Error("Missing customer_department");
    if (!package_weight || isNaN(Number(package_weight)) || Number(package_weight) <= 0) {
      throw new Error("Invalid package_weight. Must be a number greater than 0");
    }
    if (!package_quantity || isNaN(Number(package_quantity)) || Number(package_quantity) <= 0) {
      throw new Error("Invalid package_quantity. Must be an integer greater than 0");
    }

    // Fetch order to resolve DAC parameters
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .select('shipping_address, shipping_method')
      .eq('id', order_id)
      .single();

    if (orderErr || !orderData) {
      throw new Error(`No se encontró la orden con ID ${order_id}: ${orderErr?.message}`);
    }

    const shippingAddress = orderData.shipping_address || {};
    const shippingMethod = orderData.shipping_method;
    const dacDeliveryMode = shippingAddress.dac_delivery_mode || (shippingMethod === "dac_agency" ? "agency" : "home");

    if (dacDeliveryMode === "home" && !customer_address) {
      throw new Error("Missing customer_address for home delivery");
    }

    // 2. Fetch DAC provider details
    const { data: provider, error: providerErr } = await supabase
      .from('delivery_providers')
      .select('*')
      .eq('provider_key', 'dac')
      .single();

    if (providerErr || !provider) {
      throw new Error("DAC provider configuration not found in database.");
    }

    const { username, password_encrypted, api_url, settings = {} } = provider;
    if (!username || !password_encrypted || !api_url) {
      throw new Error("Missing DAC credentials in delivery_providers.");
    }
    const kOficinaOrigen = settings.k_oficina_origen !== undefined ? String(settings.k_oficina_origen) : "800";

    const entregaDomicilio = settings.entrega_domicilio !== undefined ? Number(settings.entrega_domicilio) : 1;
    const entregaAgencia = settings.entrega_agencia !== undefined ? Number(settings.entrega_agencia) : 2;
    const kTipoGuia = settings.k_tipo_guia !== undefined ? Number(settings.k_tipo_guia) : 4;
    const kTipoEnvio = settings.k_tipo_envio !== undefined ? Number(settings.k_tipo_envio) : 1;

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
      console.log("[DAC Create Shipment] Logging in due to missing/expired session...");
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
      
      if (sessionErr) throw new Error(`Failed to store new session: ${sessionErr.message}`);
      sessionObj = storedSession;
    }

    const sessionParam = {
      id_session: sessionObj.session_id,
      k_cliente: sessionObj.k_cliente,
      k_usuario: sessionObj.k_usuario,
      rut: sessionObj.rut
    };

    // 4. Construct packages list
    const packages = [];
    const qty = Math.max(1, Math.round(Number(package_quantity)));
    const totalWt = Number(package_weight);
    const weightPerPackage = totalWt / qty;
    for (let i = 0; i < qty; i++) {
      packages.push({
        cantidad: 1,
        peso: Number(weightPerPackage.toFixed(2))
      });
    }

    const entrega = dacDeliveryMode === "agency" ? entregaAgencia : entregaDomicilio;
    const kOficinaDestino = shippingAddress.dac_k_oficina_destino || null;
    
    const dacAddress = dacDeliveryMode === "agency"
      ? `RETIRO EN AGENCIA: ${shippingAddress.dac_office_name || "Agencia DAC"}${shippingAddress.dac_office_address ? ` (${shippingAddress.dac_office_address})` : ""}`
      : customer_address;

    // 5. Call DAC wsInGuia_peso
    // Zip/CP is default to blank if not provided, since local delivery in Uruguay usually doesn't strictly use CP
    const shipmentInput = {
      celular: customer_phone,
      destinatario: customer_name,
      direccion: dacAddress,
      cp: "",
      localidad: dacDeliveryMode === "agency" ? (shippingAddress.city || customer_city) : customer_city,
      departamento: dacDeliveryMode === "agency" ? (shippingAddress.department || customer_department) : customer_department,
      telefono: customer_phone,
      email: "",
      observaciones: observations,
      codigoPedido: order_id,
      paquetesAmpara: qty,
      packages: packages,
      kTipoGuia: kTipoGuia,
      kTipoEnvio: kTipoEnvio,
      entrega: entrega,
      kOficinaDestino: kOficinaDestino || undefined
    };

    const dacResult = await wsInGuiaPeso(api_url, sessionParam, shipmentInput);
    console.log("[DAC Create Shipment] Guide created:", dacResult);

    // 6. Call wsGetPegote to fetch the PDF label base64
    let labelBase64 = "";
    let labelPublicUrl = "";
    try {
      labelBase64 = await wsGetPegoteJson(api_url, sessionParam, dacResult.kGuia, kOficinaOrigen);
      
      // Convert base64 to binary buffer
      const binaryString = atob(labelBase64);
      if (!binaryString.startsWith("%PDF")) {
        throw new Error("Invalid PDF: Decoded content does not start with %PDF magic bytes.");
      }

      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Upload to Supabase Storage
      const labelPath = `dac/${order_id}-${dacResult.kGuia}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from('shipping-labels')
        .upload(labelPath, bytes.buffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadErr) {
        console.error("[DAC Create Shipment] Storage upload error:", uploadErr);
      } else {
        // Get Public URL
        const { data: { publicUrl } } = supabase.storage
          .from('shipping-labels')
          .getPublicUrl(labelPath);
        
        labelPublicUrl = publicUrl;
        console.log("[DAC Create Shipment] Label uploaded, URL:", labelPublicUrl);
      }
    } catch (labelError: any) {
      console.error("[DAC Create Shipment] Error fetching/uploading label pegote:", labelError.message);
    }

    // 7. Store shipment record in database
    const { data: shipment, error: dbErr } = await supabase
      .from('shipments')
      .insert({
        order_id: order_id,
        provider_key: 'dac',
        tracking_code: dacResult.trackingCode,
        external_guide: dacResult.kGuia,
        destination_office: dacResult.destinationOffice || String(kOficinaDestino || ""),
        shipping_status: 'documented',
        shipping_label_url: labelPublicUrl || null,
        shipping_label_base64: labelBase64 || null,
        customer_name: customer_name,
        customer_phone: customer_phone,
        customer_address: dacAddress,
        customer_city: dacDeliveryMode === "agency" ? (shippingAddress.city || customer_city) : customer_city,
        customer_department: dacDeliveryMode === "agency" ? (shippingAddress.department || customer_department) : customer_department,
        package_weight: totalWt,
        package_quantity: qty,
        provider_response: {
          kGuia: dacResult.kGuia,
          trackingCode: dacResult.trackingCode,
          destinationOffice: dacResult.destinationOffice || kOficinaDestino,
          kOficina: kOficinaOrigen,
          codigoPedido: order_id,
          dac_delivery_mode: dacDeliveryMode,
          dac_office_id: shippingAddress.dac_office_id,
          dac_office_name: shippingAddress.dac_office_name,
          dac_office_address: shippingAddress.dac_office_address
        }
      })
      .select()
      .single();

    if (dbErr) {
      throw new Error(`Failed to store shipment record: ${dbErr.message}`);
    }

    // 8. Update main order table with tracking code
    const { error: orderUpdateErr } = await supabase
      .from('orders')
      .update({
        tracking_number: dacResult.trackingCode,
        tracking_provider: 'DAC'
      })
      .eq('id', order_id);

    if (orderUpdateErr) {
      console.error("[DAC Create Shipment] Error updating order table tracking:", orderUpdateErr.message);
    }

    return new Response(JSON.stringify({
      success: true,
      shipment: shipment,
      trackingCode: dacResult.trackingCode,
      labelUrl: labelPublicUrl
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[DAC Create Shipment Error]:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
