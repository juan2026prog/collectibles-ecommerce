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

    // 1. Validation of Order ID
    if (!order_id) throw new Error("Missing order_id");

    // Fetch order/suborder to resolve DAC parameters and customer details
    let resolvedVendorId = null;
    let resolvedShippingMethod = null;
    let resolvedTrackingNumber = null;
    let resolvedShippingAddress = null;
    let resolvedCustomerPhone = null;
    let resolvedCustomerEmail = null;
    let isSuborder = false;
    let parentOrderId = order_id;

    const { data: suborderData } = await supabase
      .from('order_suborders')
      .select('*')
      .eq('id', order_id)
      .maybeSingle();

    if (suborderData) {
      isSuborder = true;
      parentOrderId = suborderData.parent_order_id;
      resolvedVendorId = suborderData.vendor_id;
      resolvedShippingMethod = suborderData.shipping_method;
      resolvedTrackingNumber = suborderData.tracking_number;
      
      // Fetch parent order's shipping address and details
      const { data: parentOrder, error: parentErr } = await supabase
        .from('orders')
        .select('shipping_address, customer_phone, customer_email')
        .eq('id', suborderData.parent_order_id)
        .single();
        
      if (parentErr || !parentOrder) {
        throw new Error(`No se encontró la orden principal de la suborden: ${parentErr?.message}`);
      }
      resolvedShippingAddress = parentOrder.shipping_address || {};
      resolvedCustomerPhone = parentOrder.customer_phone;
      resolvedCustomerEmail = parentOrder.customer_email;
    } else {
      // Fallback: It's a main order
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .select('shipping_address, shipping_method, customer_phone, customer_email, tracking_number, vendor_id')
        .eq('id', order_id)
        .single();

      if (orderErr || !orderData) {
        throw new Error(`No se encontró la orden con ID ${order_id}: ${orderErr?.message}`);
      }
      resolvedVendorId = orderData.vendor_id;
      resolvedShippingMethod = orderData.shipping_method;
      resolvedTrackingNumber = orderData.tracking_number;
      resolvedShippingAddress = orderData.shipping_address || {};
      resolvedCustomerPhone = orderData.customer_phone;
      resolvedCustomerEmail = orderData.customer_email;
    }

    // 2. Idempotency / Duplicate Check
    // A. Check tracking number
    if (resolvedTrackingNumber) {
      console.log(`[DAC Create Shipment] Already has a tracking number: ${resolvedTrackingNumber}. Skipping.`);
      return new Response(JSON.stringify({
        success: true,
        already_exists: true,
        trackingCode: resolvedTrackingNumber
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // B. Check existing shipment in database
    const shipmentQuery = supabase
      .from('shipments')
      .select('id, tracking_code, external_guide, shipping_label_url');
      
    if (isSuborder) {
      shipmentQuery.eq('suborder_id', order_id);
    } else {
      shipmentQuery.eq('order_id', order_id).is('suborder_id', null);
    }
    const { data: existingShipment } = await shipmentQuery.maybeSingle();

    if (existingShipment) {
      if (existingShipment.tracking_code || existingShipment.external_guide) {
        console.log(`[DAC Create Shipment] Shipment already exists with tracking ${existingShipment.tracking_code}`);
        return new Response(JSON.stringify({
          success: true,
          already_exists: true,
          shipment: existingShipment,
          trackingCode: existingShipment.tracking_code,
          labelUrl: existingShipment.shipping_label_url
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } else {
        console.log(`[DAC Create Shipment] Deleting existing failed shipment row ${existingShipment.id} for retry.`);
        await supabase
          .from('shipments')
          .delete()
          .eq('id', existingShipment.id);
      }
    }

    // 3. Resolve missing fields dynamically
    const shippingAddress = resolvedShippingAddress || {};
    const shippingMethod = resolvedShippingMethod;
    const dacDeliveryMode = shippingAddress.dac_delivery_mode || (shippingMethod === "dac_agency" ? "agency" : "home");

    const resolvedName = (customer_name || `${shippingAddress.first_name || ""} ${shippingAddress.last_name || ""}`.trim()).trim();
    const resolvedPhone = (customer_phone || resolvedCustomerPhone || shippingAddress.phone || "").trim();
    const resolvedCity = (customer_city || shippingAddress.city || "").trim();
    const resolvedDepartment = (customer_department || shippingAddress.department || "").trim();
    const resolvedAddress = (customer_address || shippingAddress.street || "").trim();
    const resolvedWeight = package_weight !== undefined ? Number(package_weight) : 1.0;
    const resolvedQuantity = package_quantity !== undefined ? Number(package_quantity) : 1;

    // Validate resolved fields
    if (!resolvedName) throw new Error("Missing customer_name");
    if (!resolvedPhone) throw new Error("Missing customer_phone");
    if (!resolvedCity) throw new Error("Missing customer_city");
    if (!resolvedDepartment) throw new Error("Missing customer_department");
    if (dacDeliveryMode === "home" && !resolvedAddress) {
      throw new Error("Missing customer_address for home delivery");
    }
    if (isNaN(resolvedWeight) || resolvedWeight <= 0) {
      throw new Error("Invalid package_weight. Must be a number greater than 0");
    }
    if (isNaN(resolvedQuantity) || resolvedQuantity <= 0) {
      throw new Error("Invalid package_quantity. Must be an integer greater than 0");
    }

    // 4. Fetch DAC credentials (Vendor-specific or Global fallback)
    let username = "";
    let password_encrypted = "";
    let api_url = "http://ws01.dac.com.uy/ws_ecommerce_v4/ServiciosGenerales.asmx"; // Default URL
    let kOficinaOrigen = "800";
    let entregaDomicilio = 1;
    let entregaAgencia = 2;
    let kTipoGuia = 4;
    let kTipoEnvio = 1;
    let usedVendor = false;

    if (resolvedVendorId) {
      const { data: vConn } = await supabase
        .from('vendor_shipping_connections')
        .select('*')
        .eq('vendor_id', resolvedVendorId)
        .eq('provider', 'dac')
        .single();
      
      if (vConn && vConn.connection_status === 'connected' && vConn.credentials_encrypted) {
        try {
           const { decryptData } = await import("../_shared/crypto.ts");
           const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
           const decryptedJson = await decryptData(vConn.credentials_encrypted, secret);
           const creds = JSON.parse(decryptedJson);
           username = creds.username;
           password_encrypted = creds.password; // Ya es texto plano en realidad pero wsLogin acepta plano
           usedVendor = true;
           
           if (vConn.settings?.agencyCode) kOficinaOrigen = String(vConn.settings.agencyCode);
        } catch (e) {
           console.log("[DAC] Fallo al desencriptar credenciales del vendor, ignorando.");
        }
      }
    }

    // Centralized Logistics Fallback: use global credentials if vendor connection is not configured/connected
    if (!usedVendor) {
      const { data: provider, error: providerErr } = await supabase
        .from('delivery_providers')
        .select('*')
        .eq('provider_key', 'dac')
        .single();

      if (providerErr || !provider) {
        throw new Error("No hay credenciales DAC globales configuradas en la plataforma.");
      }
      username = provider.username;
      password_encrypted = provider.password_encrypted;
      api_url = provider.api_url || api_url;
      
      if (provider.settings) {
        if (provider.settings.k_oficina_origen !== undefined) kOficinaOrigen = String(provider.settings.k_oficina_origen);
        if (provider.settings.entrega_domicilio !== undefined) entregaDomicilio = Number(provider.settings.entrega_domicilio);
        if (provider.settings.entrega_agencia !== undefined) entregaAgencia = Number(provider.settings.entrega_agencia);
        if (provider.settings.k_tipo_guia !== undefined) kTipoGuia = Number(provider.settings.k_tipo_guia);
        if (provider.settings.k_tipo_envio !== undefined) kTipoEnvio = Number(provider.settings.k_tipo_envio);
      }
    }

    if (!username || !password_encrypted) {
      throw new Error("Faltan credenciales DAC para realizar el envío.");
    }

    // 5. Resolve active session
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

    // 6. Construct packages list
    const packages = [];
    const qty = Math.max(1, Math.round(Number(resolvedQuantity)));
    const totalWt = Number(resolvedWeight);
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
      : resolvedAddress;

    // Include CI in DAC guide observations so it prints on the label clearly!
    const ci = shippingAddress.ci || "";
    let finalObservations = observations || "";
    if (ci) {
      finalObservations = `CI: ${ci}${finalObservations ? ` | ${finalObservations}` : ""}`.trim();
    }

    // 7. Call DAC wsInGuia_peso
    const shipmentInput = {
      celular: resolvedPhone,
      destinatario: resolvedName,
      direccion: dacAddress,
      cp: "",
      localidad: dacDeliveryMode === "agency" ? (shippingAddress.city || resolvedCity) : resolvedCity,
      departamento: dacDeliveryMode === "agency" ? (shippingAddress.department || resolvedDepartment) : resolvedDepartment,
      telefono: resolvedPhone,
      email: "",
      observaciones: finalObservations,
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

    // 8. Call wsGetPegote to fetch the PDF label base64
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

    // 9. Store shipment record in database (with sanitized logs of attempt, request & response)
    const { data: shipment, error: dbErr } = await supabase
      .from('shipments')
      .insert({
        order_id: parentOrderId,
        suborder_id: isSuborder ? order_id : null,
        provider_key: 'dac',
        tracking_code: dacResult.trackingCode,
        external_guide: dacResult.kGuia,
        destination_office: dacResult.destinationOffice || String(kOficinaDestino || ""),
        shipping_status: 'documented',
        shipping_label_url: labelPublicUrl || null,
        shipping_label_base64: labelBase64 || null,
        customer_name: resolvedName,
        customer_phone: resolvedPhone,
        customer_address: dacAddress,
        customer_city: dacDeliveryMode === "agency" ? (shippingAddress.city || resolvedCity) : resolvedCity,
        customer_department: dacDeliveryMode === "agency" ? (shippingAddress.department || resolvedDepartment) : resolvedDepartment,
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
          dac_office_address: shippingAddress.dac_office_address,
          attempted_at: new Date().toISOString(),
          request_payload: shipmentInput,
          response_raw: dacResult
        }
      })
      .select()
      .single();

    if (dbErr) {
      throw new Error(`Failed to store shipment record: ${dbErr.message}`);
    }

    // 10. Update tracking info in order/suborder tables
    if (isSuborder) {
      await supabase
        .from('order_suborders')
        .update({
          tracking_number: dacResult.trackingCode,
          tracking_url: `https://www.gacela.com.uy/gacelamobile/tracking?guia=${dacResult.trackingCode}`,
          shipping_status: 'documented',
          updated_at: new Date().toISOString()
        })
        .eq('id', order_id);
    } else {
      let orderUpdateSuccess = false;
      try {
        const { error: orderUpdateErr } = await supabase
          .from('orders')
          .update({
            tracking_number: dacResult.trackingCode,
            tracking_provider: 'dac',
            shipping_status: 'documented'
          })
          .eq('id', order_id);

        if (!orderUpdateErr) {
          orderUpdateSuccess = true;
        }
      } catch {
        // Fallback
      }

      if (!orderUpdateSuccess) {
        await supabase
          .from('orders')
          .update({
            tracking_number: dacResult.trackingCode,
            tracking_provider: 'dac'
          })
          .eq('id', order_id);
      }
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

    // Securely log the failed attempt inside the shipments table
    if (order_id) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Delete any existing shipments for this order and provider key to avoid duplicates/errors
        await supabase
          .from('shipments')
          .delete()
          .eq('order_id', order_id)
          .eq('provider_key', 'dac');

        const { data: orderData } = await supabase
          .from('orders')
          .select('shipping_address, customer_phone')
          .eq('id', order_id)
          .single();

        const shippingAddress = orderData?.shipping_address || {};
        const resolvedName = (customer_name || `${shippingAddress.first_name || ""} ${shippingAddress.last_name || ""}`.trim() || 'Cliente').trim();
        const resolvedPhone = (customer_phone || orderData?.customer_phone || shippingAddress.phone || 'N/A').trim();
        const resolvedCity = (customer_city || shippingAddress.city || 'N/A').trim();
        const resolvedDepartment = (customer_department || shippingAddress.department || 'N/A').trim();
        const resolvedAddress = (customer_address || shippingAddress.street || 'N/A').trim();
        const dacDeliveryMode = shippingAddress.dac_delivery_mode || 'home';

        await supabase
          .from('shipments')
          .insert({
            order_id: order_id,
            provider_key: 'dac',
            shipping_status: 'error',
            customer_name: resolvedName,
            customer_phone: resolvedPhone,
            customer_address: dacDeliveryMode === "agency"
              ? `RETIRO EN AGENCIA: ${shippingAddress.dac_office_name || "Agencia DAC"}`
              : resolvedAddress,
            customer_city: resolvedCity,
            customer_department: resolvedDepartment,
            package_weight: package_weight !== undefined ? Number(package_weight) : 1.0,
            package_quantity: package_quantity !== undefined ? Number(package_quantity) : 1,
            provider_response: {
              error: error.message || String(error),
              failed_at: new Date().toISOString(),
              request_payload: {
                celular: resolvedPhone,
                destinatario: resolvedName,
                direccion: dacDeliveryMode === "agency"
                  ? `RETIRO EN AGENCIA: ${shippingAddress.dac_office_name || "Agencia DAC"}`
                  : resolvedAddress,
                localidad: resolvedCity,
                departamento: resolvedDepartment,
                codigoPedido: order_id,
                paquetesAmpara: package_quantity !== undefined ? Number(package_quantity) : 1,
                peso: package_weight !== undefined ? Number(package_weight) : 1.0,
                dac_delivery_mode: dacDeliveryMode
              }
            }
          });
          
        console.log(`[DAC Create Shipment Error] Logged error shipment for order ${order_id}`);
      } catch (logError: any) {
        console.error("Failed to log DAC creation error to shipments table:", logError.message);
      }
    }

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
