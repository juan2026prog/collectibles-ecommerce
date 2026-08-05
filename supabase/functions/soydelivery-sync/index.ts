// supabase/functions/soydelivery-sync/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { SoyDeliveryAdapter } from "../_shared/adapters/shipping-adapter.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const { order_id } = await req.json();
    if (!order_id) throw new Error("Missing order_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch order/suborder polymorphically
    let resolvedVendorId = null;
    let resolvedShippingMethod = null;
    let resolvedShippingAddress = null;
    let resolvedCustomerPhone = null;
    let resolvedCustomerEmail = null;
    let isSuborder = false;
    let parentOrderId = order_id;
    let suborderNumber = "";

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
      suborderNumber = suborderData.suborder_number || "";
      
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
      resolvedShippingAddress = orderData.shipping_address || {};
      resolvedCustomerPhone = orderData.customer_phone;
      resolvedCustomerEmail = orderData.customer_email;
    }

    const addr = resolvedShippingAddress || {};

    // 2. Fetch SoyDelivery credentials (Strict Vendor BYOC Only)
    let sdCreds: any = null;

    if (!resolvedVendorId) {
      throw new Error("No se pudo asociar la orden a ningún vendedor para despachar por SoyDelivery.");
    }

    const { data: vConn, error: vConnErr } = await supabase
      .from('vendor_shipping_connections')
      .select('*')
      .eq('vendor_id', resolvedVendorId)
      .eq('provider', 'soydelivery')
      .maybeSingle();

    if (vConnErr || !vConn) {
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: "El vendedor no tiene configurada una cuenta propia (BYOC) de SoyDelivery." 
      }), { headers: corsHeaders });
    }

    if (vConn.connection_status !== 'connected' || !vConn.enabled || !vConn.credentials_encrypted) {
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: `La conexión SoyDelivery del vendedor no está activa (estado: ${vConn.connection_status}).` 
      }), { headers: corsHeaders });
    }

    try {
      const { decryptData } = await import("../_shared/crypto.ts");
      const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
      const decryptedJson = await decryptData(vConn.credentials_encrypted, secret);
      const creds = JSON.parse(decryptedJson);

      sdCreds = {
        apiKey: creds.apiKey,
        clientId: creds.clientId || creds.negocioId,
        negocioId: creds.negocioId || creds.clientId,
        secret: creds.secret || creds.negocioClave,
        negocioClave: creds.negocioClave || creds.secret,
        isSandbox: vConn.environment === 'uat' || vConn.environment === 'testing'
      };
    } catch (e: any) {
      throw new Error(`Error al descifrar las credenciales de SoyDelivery del vendedor: ${e.message}`);
    }

    const adapter = new SoyDeliveryAdapter();
    if (!adapter.validateConfig(sdCreds)) {
      throw new Error("Credenciales de SoyDelivery incompletas.");
    }

    // Call Adapter
    const result = await adapter.createShipment(
      supabase,
      order_id,
      sdCreds,
      addr,
      1.0, // Default weight
      1,   // Default quantity
      "",
      {
        name: `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || "Cliente",
        phone: resolvedCustomerPhone || addr.phone || "099000000"
      }
    );

    if (result.success && result.trackingCode) {
      const trackingId = result.trackingCode;

      // Update suborder / order tracking info
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

      // Clear any existing shipments to prevent duplicates
      const delQuery = supabase.from('shipments').delete().eq('provider_key', 'soydelivery');
      if (isSuborder) {
        delQuery.eq('suborder_id', order_id);
      } else {
        delQuery.eq('order_id', order_id).is('suborder_id', null);
      }
      await delQuery;

      // Insert shipment record
      const shipmentPayload = {
        order_id: isSuborder ? parentOrderId : order_id,
        suborder_id: isSuborder ? order_id : null,
        provider_key: 'soydelivery',
        tracking_code: String(trackingId), // Only real tracking here
        internal_reference: isSuborder ? `COL-${suborderNumber}` : `COL-${order_id}`,
        shipping_label_url: null,
        shipping_status: 'ready_to_ship',
        customer_name: `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || "Cliente",
        customer_phone: resolvedCustomerPhone || addr.phone || "099000000",
        customer_address: `${addr.street || ''} ${addr.apartment || ''}`.trim() || "N/A",
        customer_city: addr.city || "Montevideo",
        customer_department: addr.department || "",
        package_weight: 1.0,
        package_quantity: 1,
        provider_response: result.rawResponse
      };
      await supabase.from('shipments').insert(shipmentPayload);

      return new Response(JSON.stringify({ success: true, trackingId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      throw new Error(result.error || "Fallo al crear envío en SoyDelivery");
    }

  } catch (error: any) {
    console.error("SoyDelivery Sync Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
