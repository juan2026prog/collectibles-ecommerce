import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

function normalizeLocation(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isLocationInSoyDeliveryZone(department?: string | null, city?: string | null): boolean {
  if (!department || !city) return false;
  
  const normDept = normalizeLocation(department).toLowerCase();
  const normCity = normalizeLocation(city).toLowerCase();
  
  if (normDept === "montevideo") {
    return true;
  }
  
  if (normDept === "san jose") {
    return normCity === "ciudad del plata";
  }
  
  if (normDept === "canelones") {
    const coveredCanelones = new Set([
      "ciudad de la costa", "colinas de carrasco", "el pinar", "lagomar", "lomas de solymar",
      "parque carrasco", "paso de carrasco", "shangrila", "solymar",
      "la paz", "las piedras", "progreso", "barros blancos", "joaquin suarez", "pando", "toledo",
      "ciudad de canelones", "canelones"
    ]);
    return coveredCanelones.has(normCity);
  }
  
  return false;
}


serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const { order_id } = await req.json();
    if (!order_id) throw new Error("Missing order_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch order/suborder polymorphically
    let resolvedVendorId = null;
    let resolvedShippingMethod = null;
    let resolvedTrackingNumber = null;
    let resolvedShippingAddress = null;
    let resolvedCustomerPhone = null;
    let resolvedCustomerEmail = null;
    let isSuborder = false;
    let parentOrderId = order_id;
    let orderNumber = "";

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
      orderNumber = suborderData.suborder_number;
      
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
      // Fallback: It's a parent order
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();

      if (orderErr || !orderData) {
        throw new Error(`No se encontró la orden: ${orderErr?.message}`);
      }
      resolvedVendorId = orderData.vendor_id;
      resolvedShippingMethod = orderData.shipping_method;
      resolvedTrackingNumber = orderData.tracking_number;
      resolvedShippingAddress = orderData.shipping_address || {};
      resolvedCustomerPhone = orderData.customer_phone;
      resolvedCustomerEmail = orderData.customer_email;
      orderNumber = String(orderData.id);
    }

    // 2. Idempotency / Duplicate Check
    if (resolvedTrackingNumber) {
      console.log(`[SoyDelivery] Already has a tracking number: ${resolvedTrackingNumber}. Skipping.`);
      return new Response(JSON.stringify({
        success: true,
        already_exists: true,
        trackingId: resolvedTrackingNumber
      }), { headers: corsHeaders });
    }

    // Only process if shipping to an address (not pickup)
    const addr = resolvedShippingAddress;
    if (!addr || typeof addr === 'string' || !addr.street) {
      return new Response(JSON.stringify({ skipped: true, reason: "No shipping address (might be pickup)" }), { headers: corsHeaders });
    }

    // 3. Fetch SoyDelivery credentials (Vendor or Global Fallback)
    let apiId = '';
    let apiKey = '';
    let negocioId = '';
    let negocioClave = '';
    let isSandbox = false;
    let usedVendor = false;

    if (resolvedVendorId) {
      const { data: vConn } = await supabase
        .from('vendor_shipping_connections')
        .select('*')
        .eq('vendor_id', resolvedVendorId)
        .eq('provider', 'soydelivery')
        .single();
      
      if (vConn && vConn.connection_status === 'connected' && vConn.credentials_encrypted) {
        try {
           const { decryptData } = await import("../_shared/crypto.ts");
           const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
           const decryptedJson = await decryptData(vConn.credentials_encrypted, secret);
           const creds = JSON.parse(decryptedJson);
           apiKey = creds.apiKey;
           apiId = creds.clientId;
           negocioId = creds.clientId; 
           negocioClave = creds.secret;
           usedVendor = true;
        } catch (e) {
           console.log("[SoyDelivery] Fallo al desencriptar credenciales del vendor, ignorando.");
        }
      }
    }

    if (!usedVendor) {
      const { data: settingsData } = await supabase.from('site_settings').select('key, value');
      const settings = Object.fromEntries((settingsData || []).map((s: any) => [s.key, s.value]));

      if (settings['shipping_soydelivery_enabled'] !== 'true') {
        return new Response(JSON.stringify({ skipped: true, reason: "SoyDelivery disabled in global settings" }), { headers: corsHeaders });
      }

      apiId = settings['shipping_soydelivery_api_id'];
      apiKey = settings['shipping_soydelivery_api_key'];
      negocioId = settings['shipping_soydelivery_negocio_id'];
      negocioClave = settings['shipping_soydelivery_negocio_clave'];
      isSandbox = settings['shipping_soydelivery_sandbox'] === 'true';
    }

    // Centralized Logistics: Retrieve vendor's dispatch address as origin/remitente if possible
    let originAddress = "Retiro Defecto";
    let originCity = "Montevideo";
    let originPhone = "099000000";
    let originDepartment = "Montevideo";

    if (resolvedVendorId) {
      const { data: defaultAddr } = await supabase
        .from('vendor_dispatch_addresses')
        .select('*')
        .eq('vendor_id', resolvedVendorId)
        .eq('is_default', true)
        .maybeSingle();

      if (defaultAddr) {
        originAddress = defaultAddr.address;
        originCity = defaultAddr.city;
        originPhone = defaultAddr.phone || originPhone;
        originDepartment = defaultAddr.department;
      } else {
        const { data: anyAddr } = await supabase
          .from('vendor_dispatch_addresses')
          .select('*')
          .eq('vendor_id', resolvedVendorId)
          .limit(1)
          .maybeSingle();
        if (anyAddr) {
          originAddress = anyAddr.address;
          originCity = anyAddr.city;
          originPhone = anyAddr.phone || originPhone;
          originDepartment = anyAddr.department;
        }
      }
    }

    // Validate geographic coverage
    const isOriginCovered = isLocationInSoyDeliveryZone(originDepartment, originCity);
    const isDestinationCovered = isLocationInSoyDeliveryZone(addr.department, addr.city);

    if (!isOriginCovered || !isDestinationCovered) {
      const errorMsg = "SoyDelivery no disponible para origen/destino";
      
      const shipmentPayload = {
        order_id: isSuborder ? parentOrderId : order_id,
        suborder_id: isSuborder ? order_id : null,
        provider_key: 'soydelivery',
        tracking_code: null,
        shipping_label_url: null,
        shipping_status: 'failed',
        error_message: errorMsg,
        customer_name: `${addr.first_name || ''} ${addr.last_name || ''}`.trim(),
        customer_phone: resolvedCustomerPhone || "099000000",
        customer_address: addr.street || '',
        customer_city: addr.city || "Montevideo",
        customer_department: addr.department || "",
        package_weight: 1.0,
        package_quantity: 1,
        provider_response: { 
          success: false, 
          error: "Geographic coverage validation failed",
          origin: { city: originCity, department: originDepartment },
          destination: { city: addr.city, department: addr.department },
          fallback_suggestions: ["DAC", "UES"]
        }
      };
      
      await supabase.from('shipments').insert(shipmentPayload);

      if (isSuborder) {
        await supabase
          .from("order_suborders")
          .update({ 
               shipping_status: "failed",
               updated_at: new Date().toISOString()
          })
          .eq("id", order_id);
      } else {
        await supabase
          .from("orders")
          .update({ 
               shipping_status: "failed",
               updated_at: new Date().toISOString()
          })
          .eq("id", order_id);
      }

      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMsg, 
        fallback_suggestions: ["DAC", "UES"] 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      });
    }

    if (!apiId || !apiKey || !negocioId || !negocioClave) {
      throw new Error("Faltan credenciales de SoyDelivery.");
    }

    // Determine base URL
    const baseUrl = isSandbox 
        ? "http://testing.soydelivery.com.uy/rest" 
        : "https://soydelivery.com.uy/rest";

    // 4. Authenticate with SoyDelivery
    const authRes = await fetch(`${baseUrl}/sdws_autenticar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ApiId: Number(apiId),
            ApiKey: apiKey
        })
    });
    
    const authData = await authRes.json();
    if (authData.ErrId && authData.ErrId !== "0") {
        throw new Error(`SoyDelivery Auth Error: ${authData.ErrDescription}`);
    }
    const token = authData.AccessToken;
    if (!token) throw new Error("No token returned from SoyDelivery");

    // 5. Create the delivery order
    // Parse street and number from addr.street
    const streetMatches = addr.street.match(/^(.*?)([\d].*)$/);
    const street = streetMatches ? streetMatches[1].trim() : addr.street;
    const number = streetMatches ? streetMatches[2].trim() : "S/N";

    // Set delivery date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const deliveryDate = tomorrow.toISOString().split('T')[0];

    // Build the payload
    const payload = {
        Negocio_id: Number(negocioId),
        Negocio_clave: Number(negocioClave),
        Negocio_RepartidoId: 0,
        Nombre_cliente: `${addr.first_name || ''} ${addr.last_name || ''}`.trim(),
        Telefono_cliente: resolvedCustomerPhone || "099000000",
        Email_cliente: resolvedCustomerEmail || "",
        Negocio_sucursal_external_id: "1",
        Ciudad_origen: originCity,
        Calle_origen: originAddress,
        Numero_origen: "S/N",
        Apto_origen: "",
        Esquina_origen: "",
        Observacion_origen: "",
        Location_origen: "",
        Ciudad_destino: addr.city || "Montevideo",
        Calle_destino: street,
        Numero_destino: number,
        Apto_destino: addr.apartment || "",
        Esquina_destino: "",
        Observacion_destino: "",
        Location_destino: "",
        Fecha_entrega: deliveryDate,
        Franja_horaria: 4, // 4 = Todo el dia (10 a 18hs)
        Cantidad_bultos: 1,
        Detalle: `Orden #${orderNumber}`,
        Pedido_external_id: order_id,
        Nro_Factura: "",
        Servicio: "Express",
        Tipo_Vehiculo_Nombre: "MOTO",
        Tipo_Producto: 1, // CHICO
        Complejidad: "NORMAL",
        Productos: []
    };

    const createRes = await fetch(`${baseUrl}/awsnuevopedido1`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
    });

    const createData = await createRes.json();
    console.log("SoyDelivery Create Response:", createData);

    if (createData.Error_code !== 0) {
        throw new Error(`SoyDelivery Create Error: ${createData.Error_desc}`);
    }

    // 6. Update order/suborder with tracking ID
    const trackingId = createData.Pedido_id;
    if (trackingId) {
        if (isSuborder) {
            await supabase
              .from("order_suborders")
              .update({ 
                   tracking_number: String(trackingId),
                   shipping_provider: "SoyDelivery",
                   shipping_status: "ready_to_ship",
                   updated_at: new Date().toISOString()
              })
              .eq("id", order_id);
        } else {
            await supabase
              .from("orders")
              .update({ 
                   tracking_number: String(trackingId),
                   shipping_provider: "SoyDelivery",
                   shipping_status: "ready_to_ship",
                   updated_at: new Date().toISOString()
              })
              .eq("id", order_id);
        }

        // 7. Insert into shipments table using correct schema columns
        const shipmentPayload = {
            order_id: isSuborder ? parentOrderId : order_id,
            suborder_id: isSuborder ? order_id : null,
            provider_key: 'soydelivery',
            tracking_code: String(trackingId),
            shipping_label_url: null,
            shipping_status: 'ready_to_ship',
            customer_name: `${addr.first_name || ''} ${addr.last_name || ''}`.trim(),
            customer_phone: resolvedCustomerPhone || "099000000",
            customer_address: `${street} ${number}`,
            customer_city: addr.city || "Montevideo",
            customer_department: addr.department || "",
            package_weight: 1.0,
            package_quantity: 1,
            provider_response: createData
        };
        await supabase.from('shipments').insert(shipmentPayload);
    }

    return new Response(JSON.stringify({ success: true, trackingId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("SoyDelivery Sync Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
