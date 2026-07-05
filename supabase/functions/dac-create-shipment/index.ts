// supabase/functions/dac-create-shipment/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { DACAdapter } from "../_shared/adapters/shipping-adapter.ts";

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

    if (!order_id) throw new Error("Missing order_id");

    // Fetch order/suborder to resolve DAC parameters and customer details
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
        .select('shipping_address, shipping_method, customer_phone, customer_email, vendor_id')
        .eq('id', order_id)
        .single();

      if (orderErr || !orderData) {
        throw new Error(`No se encontró la orden con ID ${order_id}: ${orderErr?.message}`);
      }
      resolvedVendorId = orderData.vendor_id;
      resolvedShippingMethod = orderData.shipping_method;
      resolvedShippingAddress = orderData.shipping_address || {};
      resolvedCustomerPhone = orderData.customer_phone;
      resolvedCustomerEmail = orderData.customer_email;
    }

    // Weight and Quantity resolution
    let totalWt = 1.0;
    let qty = 1;

    if (isSuborder) {
      const { data: items } = await supabase
        .from('order_items')
        .select('quantity, products(weight)')
        .eq('vendor_id', resolvedVendorId)
        .eq('order_id', parentOrderId);

      if (items && items.length > 0) {
        let totalItemsQty = 0;
        let calculatedWeight = 0;
        for (const item of items) {
          const itemQty = Number(item.quantity) || 1;
          totalItemsQty += itemQty;
          const productWeight = Number((item.products as any)?.weight) || 0.5;
          calculatedWeight += productWeight * itemQty;
        }
        totalWt = calculatedWeight;
        qty = totalItemsQty;
      }
    }

    if (package_weight !== undefined && package_weight !== null) totalWt = Number(package_weight);
    if (package_quantity !== undefined && package_quantity !== null) qty = Number(package_quantity);

    // Get connection info (BYOC)
    let dacCreds: any = null;
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
          
          dacCreds = {
            username: creds.username,
            password: creds.password,
            apiUrl: creds.apiUrl || creds.api_url,
            settings: vConn.settings || {}
          };
          if (vConn.settings?.agencyCode) {
            dacCreds.settings.k_oficina_origen = vConn.settings.agencyCode;
          }
          usedVendor = true;
        } catch (e) {
          console.log("[DAC] Failed to decrypt vendor credentials, falling back to global.");
        }
      }
    }

    if (!usedVendor) {
      const { data: provider, error: providerErr } = await supabase
        .from('shipping_providers')
        .select('*')
        .eq('code', 'dac')
        .single();

      if (providerErr || !provider) {
        throw new Error("No hay credenciales DAC globales configuradas en la plataforma.");
      }
      
      dacCreds = {
        username: provider.username,
        password: provider.password_encrypted,
        apiUrl: provider.api_url,
        settings: provider.settings || {}
      };
    }

    let observationsOverride = observations || "";
    if (resolvedVendorId) {
      const { data: vendor } = await supabase
        .from("vendors")
        .select("store_name, contact_phone, pickup_address, shipping_settings")
        .eq("id", resolvedVendorId)
        .single();
      if (vendor) {
        const s = vendor.shipping_settings || {};
        const senderName = vendor.store_name || "Vendedor Collectibles";
        const senderPhone = s.dac?.phone || vendor.contact_phone || "N/A";
        const senderAddress = s.dac?.dispatch_address || vendor.pickup_address || "N/A";
        observationsOverride = `REMITENTE: ${senderName} (Tel: ${senderPhone}, Despacha: ${senderAddress}). ${observationsOverride}`.trim();
        
        // Override preferred agency/office code if present
        if (s.dac?.preferred_agency && dacCreds) {
          dacCreds.kOficinaOrigen = String(s.dac.preferred_agency);
        }
      }
    }

    const adapter = new DACAdapter();
    if (!adapter.validateConfig(dacCreds)) {
      throw new Error("Credenciales DAC incompletas.");
    }

    const shippingAddress = resolvedShippingAddress || {};
    const recipientName = (customer_name || `${shippingAddress.first_name || ""} ${shippingAddress.last_name || ""}`.trim() || 'Cliente').trim();
    const recipientPhone = (customer_phone || resolvedCustomerPhone || shippingAddress.phone || 'N/A').trim();
    const resolvedCity = (customer_city || shippingAddress.city || 'N/A').trim();
    const resolvedDepartment = (customer_department || shippingAddress.department || 'N/A').trim();
    const resolvedAddress = (customer_address || shippingAddress.street || 'N/A').trim();
    
    // Clear any existing shipments to prevent duplicates
    const delQuery = supabase.from('shipments').delete().eq('provider_key', 'dac');
    if (isSuborder) {
      delQuery.eq('suborder_id', order_id);
    } else {
      delQuery.eq('order_id', order_id).is('suborder_id', null);
    }
    await delQuery;

    // Call Adapter
    const result = await adapter.createShipment(
      supabase,
      order_id,
      dacCreds,
      shippingAddress,
      totalWt,
      qty,
      observationsOverride,
      { name: recipientName, phone: recipientPhone }
    );

    if (result.success) {
      const suborderShippingCost = isSuborder && suborderData ? (Number(suborderData.shipping_cost) || 0.00) : 0.00;
      const chargedToCustomer = suborderShippingCost;
      const providerCost = Number((chargedToCustomer * 0.90).toFixed(2));
      const margin = Number((chargedToCustomer - providerCost).toFixed(2));
      const billingMode = 'collectibles_envios';
      const paidBy = 'collectibles';

      // Store successful shipment record
      const { data: shipment, error: dbErr } = await supabase
        .from('shipments')
        .insert({
          order_id: parentOrderId,
          suborder_id: isSuborder ? order_id : null,
          provider_key: 'dac',
          tracking_code: result.trackingCode, // Only real tracking here!
          internal_reference: isSuborder ? `COL-${suborderNumber}` : `COL-${order_id}`, // Save internal reference!
          external_guide: result.externalGuide,
          destination_office: result.externalGuide || "",
          shipping_status: 'documented',
          shipping_label_url: result.labelUrl || null,
          shipping_label_path: result.labelPath || null,
          shipping_label_base64: null, // Removed full Base64 storage
          customer_name: recipientName,
          customer_phone: recipientPhone,
          customer_address: resolvedAddress,
          customer_city: resolvedCity,
          customer_department: resolvedDepartment,
          package_weight: totalWt,
          package_quantity: qty,
          provider_response: result.rawResponse,
          shipping_quote_to_customer: chargedToCustomer,
          shipping_charged_to_customer: chargedToCustomer,
          shipping_provider_cost_estimated: providerCost,
          shipping_provider_cost_real: providerCost,
          shipping_provider_cost: providerCost,
          shipping_margin_estimated: margin,
          shipping_margin_real: margin,
          shipping_margin: margin,
          shipping_paid_by: paidBy,
          shipping_billing_mode: billingMode,
          shipping_invoice_status: 'pending'
        })
        .select()
        .single();

      if (dbErr) throw dbErr;

      // Update suborder / order tracking
      if (isSuborder) {
        await supabase
          .from('order_suborders')
          .update({
            tracking_number: result.trackingCode,
            tracking_url: `https://www.gacela.com.uy/gacelamobile/tracking?guia=${result.trackingCode}`,
            shipping_status: 'documented',
            shipping_quote_to_customer: chargedToCustomer,
            shipping_charged_to_customer: chargedToCustomer,
            shipping_provider_cost_estimated: providerCost,
            shipping_provider_cost_real: providerCost,
            shipping_provider_cost: providerCost,
            shipping_margin_estimated: margin,
            shipping_margin_real: margin,
            shipping_margin: margin,
            shipping_paid_by: paidBy,
            shipping_billing_mode: billingMode,
            shipping_invoice_status: 'pending',
            shipping_provider_invoice_status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', order_id);
      } else {
        await supabase
          .from('orders')
          .update({
            tracking_number: result.trackingCode,
            tracking_provider: 'dac',
            shipping_status: 'documented'
          })
          .eq('id', order_id);
      }

      return new Response(JSON.stringify({
        success: true,
        shipment: shipment,
        trackingCode: result.trackingCode,
        labelUrl: result.labelUrl
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      throw new Error(result.error || "Error al crear envío en DAC");
    }

  } catch (error: any) {
    console.error("[DAC Create Shipment Error]:", error.message);

    // Save failed shipment record
    try {
      const body = await req.json().catch(() => ({}));
      const order_id = body.order_id;
      if (order_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: subData } = await supabase
          .from('order_suborders')
          .select('parent_order_id, suborder_number')
          .eq('id', order_id)
          .maybeSingle();

        const resolvedParentId = subData ? subData.parent_order_id : order_id;
        const resolvedSuborderId = subData ? order_id : null;
        const suborderNumber = subData?.suborder_number || "";

        await supabase
          .from('shipments')
          .insert({
            order_id: resolvedParentId,
            suborder_id: resolvedSuborderId,
            provider_key: 'dac',
            shipping_status: 'failed',
            error_message: error.message || String(error),
            internal_reference: subData ? `COL-${suborderNumber}` : `COL-${order_id}`,
            customer_name: body.customer_name || "Cliente",
            customer_phone: body.customer_phone || "N/A",
            customer_address: body.customer_address || "N/A",
            customer_city: body.customer_city || "N/A",
            customer_department: body.customer_department || "N/A",
            package_weight: body.package_weight ? Number(body.package_weight) : 1.0,
            package_quantity: body.package_quantity ? Number(body.package_quantity) : 1,
            provider_response: { error: error.message || String(error), failed_at: new Date().toISOString() }
          });
      }
    } catch (logErr) {
      console.error("Failed to log error to shipments:", logErr);
    }

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
