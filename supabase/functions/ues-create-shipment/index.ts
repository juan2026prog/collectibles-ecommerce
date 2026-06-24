import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { order_id } = body;

    if (!order_id) throw new Error("Missing order_id");

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
      // It's a parent order
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
      console.log(`[UES] Already has a tracking number: ${resolvedTrackingNumber}. Skipping.`);
      return new Response(JSON.stringify({
        success: true,
        already_exists: true,
        trackingCode: resolvedTrackingNumber
      }), { headers: corsHeaders });
    }

    const addr = resolvedShippingAddress;
    if (!addr || typeof addr === 'string' || !addr.street) {
      return new Response(JSON.stringify({ skipped: true, reason: "No shipping address" }), { headers: corsHeaders });
    }

    // 3. Fetch UES credentials (Vendor or Global Fallback)
    let username = '';
    let password = '';
    let apiKey = '';
    let token = '';
    let usedVendor = false;

    if (resolvedVendorId) {
      const { data: vConn } = await supabase
        .from('vendor_shipping_connections')
        .select('*')
        .eq('vendor_id', resolvedVendorId)
        .eq('provider', 'ues')
        .single();
      
      if (vConn && vConn.connection_status === 'connected' && vConn.credentials_encrypted) {
        try {
           const { decryptData } = await import("../_shared/crypto.ts");
           const secret = Deno.env.get("SHIPPING_ENCRYPTION_KEY") || supabaseKey.substring(0, 32);
           const decryptedJson = await decryptData(vConn.credentials_encrypted, secret);
           const creds = JSON.parse(decryptedJson);
           username = creds.username;
           password = creds.password;
           apiKey = creds.apiKey;
           token = creds.token;
           usedVendor = true;
        } catch (e) {
           console.log("[UES] Fallo al desencriptar credenciales del vendor, ignorando.");
        }
      }
    }

    if (!usedVendor) {
      // Global fallback: load from delivery_providers
      const { data: provider } = await supabase
        .from('delivery_providers')
        .select('*')
        .eq('provider_key', 'ues')
        .single();

      if (provider) {
        username = provider.username || '';
        password = provider.password_encrypted || '';
        if (provider.settings) {
          apiKey = provider.settings.apiKey || '';
          token = provider.settings.token || '';
        }
      }
    }

    // Check if UES credentials are configured (from vendor or global)
    if (!username || !apiKey || !token) {
      console.log(`[UES] UES global credentials not configured. Failing shipment.`);
      
      // Update suborder status to failed
      if (isSuborder) {
        await supabase
          .from("order_suborders")
          .update({ 
               shipping_provider: "UES",
               shipping_status: "failed"
          })
          .eq("id", order_id);
      } else {
        await supabase
          .from("orders")
          .update({ 
               shipping_provider: "UES"
          })
          .eq("id", order_id);
      }

      // Insert failed shipment row
      const shipmentPayload = {
          order_id: isSuborder ? parentOrderId : order_id,
          suborder_id: isSuborder ? order_id : null,
          provider_key: 'ues',
          tracking_code: null,
          shipping_label_url: null,
          shipping_status: 'failed',
          customer_name: `${addr.first_name || ''} ${addr.last_name || ''}`.trim(),
          customer_phone: resolvedCustomerPhone || "099000000",
          customer_address: addr.street || "",
          customer_city: addr.city || "",
          customer_department: addr.department || "",
          package_weight: 1.0,
          package_quantity: 1,
          provider_response: { 
            status: "provider_not_configured", 
            error: "UES global credentials not configured",
            created_at: new Date().toISOString() 
          }
      };
      await supabase.from('shipments').insert(shipmentPayload);

      return new Response(JSON.stringify({ 
        success: false, 
        status: "provider_not_configured",
        error_message: "UES global credentials not configured" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 4. Create shipment with UES API (Simulated/mocked ticket since it's a test environment)
    console.log(`[UES] Connecting to UES API using vendor credentials for order #${orderNumber}...`);
    
    // Simulate generation of UES tracking number and label
    const trackingCode = `UES-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const labelUrl = `https://api.ues.com.uy/v1/labels/${trackingCode}.pdf`;

    // 5. Update order/suborder with tracking ID
    if (isSuborder) {
        await supabase
          .from("order_suborders")
          .update({ 
               tracking_number: trackingCode,
               tracking_url: `https://www.ues.com.uy/clientes/tracking?nro=${trackingCode}`,
               shipping_provider: "UES",
               shipping_status: "ready_to_ship"
          })
          .eq("id", order_id);
    } else {
        await supabase
          .from("orders")
          .update({ 
               tracking_number: trackingCode,
               shipping_provider: "UES"
          })
          .eq("id", order_id);
    }

    // 6. Insert into shipments table
    const shipmentPayload = {
        order_id: isSuborder ? parentOrderId : order_id,
        suborder_id: isSuborder ? order_id : null,
        provider_key: 'ues',
        tracking_code: trackingCode,
        shipping_label_url: labelUrl,
        shipping_status: 'ready_to_ship',
        customer_name: `${addr.first_name || ''} ${addr.last_name || ''}`.trim(),
        customer_phone: resolvedCustomerPhone || "099000000",
        customer_address: addr.street || "",
        customer_city: addr.city || "",
        customer_department: addr.department || "",
        package_weight: 1.0,
        package_quantity: 1,
        provider_response: { trackingCode, labelUrl, created_at: new Date().toISOString() }
    };
    await supabase.from('shipments').insert(shipmentPayload);

    return new Response(JSON.stringify({ success: true, trackingCode, labelUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("UES Sync Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
