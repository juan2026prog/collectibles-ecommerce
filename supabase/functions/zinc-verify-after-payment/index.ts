import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { calculateFee, calculateRealCost, calculateProfitEngine, applyProfitProtection } from "../_shared/pricing.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    
    // Auth client
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });
    
    // Check if user is authenticated or it's a service role bypass
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    let isServiceCall = false;
    if (authHeader.includes(serviceRoleKey)) {
      isServiceCall = true;
    }

    let userObj = null;
    if (!isServiceCall) {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Unauthorized");
      userObj = user;
    }

    const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");
    if (!ZINC_API_KEY) throw new Error("ZINC_API_KEY no configurada");

    const { order_id, is_auto } = await req.json();
    if (!order_id) throw new Error("Invalid payload: order_id is required");

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    
    const { data: order, error: orderFetchErr } = await serviceClient
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single();

    if (orderFetchErr || !order) throw new Error("Order not found");

    const { data: settings } = await serviceClient.from('international_sync_settings').select('*').eq('id', 1).single();
    if (!settings) throw new Error("International sync settings not found");

    let finalOrderStatus = order.status;
    let allOk = true;

    // Parse Courier Address for Zinc
    let first_name = order.shipping_address.first_name || '';
    let last_name = order.shipping_address.last_name || '';
    let address_line1 = '2030 NW 95th AVE';
    let address_line2 = '';
    let city = 'Doral';
    let state = 'FL';
    let zip_code = '33172';
    let phone_number = '7863140977';

    const courierType = order.shipping_address.international_courier;

    // Address verification helper
    const isAddressValid = () => {
      if (!courierType) return false;
      if (courierType === 'other') {
        const rawAddr = order.shipping_address.international_miami_address;
        return !!rawAddr;
      } else {
        const suite = order.shipping_address.international_suite;
        return !!suite;
      }
    };

    if (isAddressValid()) {
      if (courierType === 'other') {
        const rawAddr = order.shipping_address.international_miami_address;
        if (typeof rawAddr === 'object' && rawAddr !== null) {
          first_name = rawAddr.fullName?.split(' ')[0] || first_name;
          last_name = rawAddr.fullName?.split(' ').slice(1).join(' ') || last_name;
          address_line1 = rawAddr.address1 || address_line1;
          address_line2 = rawAddr.address2 || '';
          city = rawAddr.city || city;
          state = rawAddr.state || state;
          zip_code = rawAddr.zip || zip_code;
          phone_number = rawAddr.phone || phone_number;
        } else if (typeof rawAddr === 'string') {
          const lines = rawAddr.split(/\r?\n|\,/g).map(l => l.trim()).filter(Boolean);
          if (lines.length > 0) address_line1 = lines[0];
          if (lines.length > 1) address_line2 = lines[1];
          if (lines.length > 2) {
            const lastLines = lines.slice(2).join(' ');
            const zipMatch = lastLines.match(/\b\d{5}\b/);
            if (zipMatch) zip_code = zipMatch[0];
            const stateMatch = lastLines.match(/\b[A-Z]{2}\b/);
            if (stateMatch) state = stateMatch[0];
            if (lastLines.toLowerCase().includes('miami')) city = 'Miami';
            else if (lastLines.toLowerCase().includes('doral')) city = 'Doral';
            else if (lastLines.toLowerCase().includes('medley')) city = 'Medley';
          }
        }
      } else {
        const suite = order.shipping_address.international_suite || '';
        address_line2 = `Suite ${suite}`;
      }
    }

    const zincShippingAddress = {
      first_name,
      last_name,
      address_line1,
      address_line2,
      city,
      state,
      zip_code,
      country: 'US',
      phone_number
    };

    for (const item of order.order_items) {
      if (!item.product_id) continue;

      const { data: prod } = await serviceClient.from('international_products').select('*').eq('id', item.product_id).single();
      if (!prod) continue; // Standard product, skip

      // 1. Find or create international_order_items record
      let { data: intlOrderItem } = await serviceClient
        .from('international_order_items')
        .select('*')
        .eq('order_item_id', item.id)
        .maybeSingle();

      if (!intlOrderItem) {
        const { data: newRecord, error: insertErr } = await serviceClient
          .from('international_order_items')
          .insert({
            order_item_id: item.id,
            purchase_status: 'pending_purchase',
            expected_profit_usd: prod.expected_profit_usd || 0,
            final_price_usd: prod.final_price_usd || 0
          })
          .select('*')
          .single();
        
        if (insertErr || !newRecord) {
          console.error("Error creating international order item tracker:", insertErr);
          continue;
        }
        intlOrderItem = newRecord;
      }

      // 2. Skip if already processed in Zinc
      const skippedStatuses = ['zinc_order_created', 'zinc_processing', 'purchased', 'shipped_to_courier', 'delivered_to_courier'];
      if (skippedStatuses.includes(intlOrderItem.purchase_status)) {
        continue;
      }

      // If automatic webhook call, do not retry manual_review, zinc_failed, or if zinc_order_id already exists
      if (is_auto) {
        if (intlOrderItem.zinc_order_id) {
          continue; // already has a zinc order id
        }
        if (['manual_review', 'zinc_failed'].includes(intlOrderItem.purchase_status)) {
          continue; // skip automatic retries for failed/review states
        }
      }

      let failureMessage = "";

      // 3. Check if order is paid
      if (order.payment_status !== 'approved' && order.status !== 'paid') {
        failureMessage = "La orden no está marcada como pagada.";
      }

      // 4. Check if product has external URL
      if (!failureMessage && !prod.product_url_external) {
        failureMessage = "El producto no tiene una URL de origen externa.";
      }

      // 5. Check if shipping address is valid
      if (!failureMessage && !isAddressValid()) {
        failureMessage = "La dirección del courier en USA está incompleta.";
      }

      // 6. Live Check & Profit Protection Engine Check
      let currentPrice = null;
      if (!failureMessage) {
        try {
          const url = `https://api.zinc.com/products/${prod.external_product_id}?retailer=amazon`;
          const res = await fetch(url, { headers: { 'Authorization': `Bearer ${ZINC_API_KEY}` } });
          
          if (!res.ok) throw new Error(`Zinc API error: ${res.status}`);
          const data = await res.json();
          
          const priceRaw = data.price || (data.offers && data.offers.length > 0 ? data.offers[0].price : null);
          currentPrice = priceRaw ? priceRaw / 100 : null;

          let newAvail = 'unavailable';
          const status = (data.status || '').toLowerCase();
          if (status === 'available') newAvail = 'in_stock';
          else if (status === 'out_of_stock' || status.includes('unavailable')) newAvail = 'unavailable';
          else newAvail = 'in_stock';

          if (settings.only_prime && data.buy_box && !data.buy_box.prime) {
              newAvail = 'unavailable';
          }

          if (!currentPrice || newAvail === 'unavailable') {
              failureMessage = "El producto internacional ya no está disponible en Amazon.";
          }
        } catch (err) {
          failureMessage = "No se pudo verificar disponibilidad del producto en Amazon. " + err.message;
        }
      }

      let maxAmazonPrice = 0;
      if (!failureMessage && currentPrice) {
        const usaShipping = Number(prod.usa_domestic_shipping_usd || 0);
        const realCost = calculateRealCost(currentPrice, usaShipping, settings as any);
        const expectedProfit = calculateProfitEngine(realCost, settings as any);
        const protection = applyProfitProtection(currentPrice, prod.collectibles_fee_usd, realCost, expectedProfit, settings as any);

        const paidPriceUsd = Number(intlOrderItem.final_price_usd);
        const currentProfit = paidPriceUsd - realCost;

        if (protection.isLoss || currentProfit < (settings.min_absolute_profit_usd || 2.0)) {
          failureMessage = `Variación de costos excede la rentabilidad mínima (Ganancia calculada: $${currentProfit.toFixed(2)} USD).`;
        }

        // Calculate max amazon price allowed to protect minimum required profit
        maxAmazonPrice = (paidPriceUsd - usaShipping - (settings.zinc_fee_usd || 1.00) - (settings.min_absolute_profit_usd || 2.00) - 0.61) / 1.0305;
      }

      if (failureMessage) {
        allOk = false;
        finalOrderStatus = 'manual_review';
        await serviceClient.from('international_order_items').update({
          purchase_status: 'manual_review',
          zinc_error_message: failureMessage,
          updated_at: new Date().toISOString()
        }).eq('id', intlOrderItem.id);
        continue;
      }

      // 7. Place Order in Zinc
      if (settings.auto_purchase_enabled || isServiceCall || (userObj && order.status === 'paid')) {
        const maxPriceCents = Math.max(1, Math.round(maxAmazonPrice * 100));
        const zincRequestPayload = {
          retailer: 'amazon',
          products: [{
            url: prod.product_url_external,
            quantity: item.quantity
          }],
          shipping_address: zincShippingAddress,
          max_price: maxPriceCents,
          payment_method: {
            use_zinc_card: true
          },
          po_number: order.order_number || order.id,
          metadata: {
            collectibles_order_id: order.id,
            customer_id: order.customer_id,
            international_order_item_id: intlOrderItem.id,
            product_id: prod.id
          }
        };

        try {
          const zincOrdersUrl = 'https://api.zinc.com/orders';
          const zincRes = await fetch(zincOrdersUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ZINC_API_KEY}`
            },
            body: JSON.stringify(zincRequestPayload)
          });

          const zincData = await zincRes.json();

          if (!zincRes.ok || zincData.error || (zincData.status && zincData.status === 'failed')) {
            const errStr = zincData.error?.message || zincData.error || "Zinc orders creation failed";
            await serviceClient.from('international_order_items').update({
              purchase_status: 'zinc_failed',
              zinc_request_payload: zincRequestPayload,
              zinc_response_payload: zincData,
              zinc_error_message: errStr,
              updated_at: new Date().toISOString()
            }).eq('id', intlOrderItem.id);
            allOk = false;
            finalOrderStatus = 'manual_review';
          } else {
            // Success - Zinc order request created asynchronously
            const zincOrderId = zincData.request_id || zincData.id;
            await serviceClient.from('international_order_items').update({
              purchase_status: 'zinc_order_created',
              zinc_order_id: zincOrderId,
              zinc_request_payload: zincRequestPayload,
              zinc_response_payload: zincData,
              zinc_error_message: null,
              updated_at: new Date().toISOString()
            }).eq('id', intlOrderItem.id);
          }
        } catch (zincCallErr) {
          await serviceClient.from('international_order_items').update({
            purchase_status: 'zinc_failed',
            zinc_error_message: "Error de conexión con API de Zinc: " + zincCallErr.message,
            updated_at: new Date().toISOString()
          }).eq('id', intlOrderItem.id);
          allOk = false;
          finalOrderStatus = 'manual_review';
        }
      }
    }

    if (!allOk) {
      await serviceClient.from('orders').update({ status: finalOrderStatus }).eq('id', order_id);
    }

    return new Response(JSON.stringify({ success: true, orderStatus: finalOrderStatus, allOk }), { headers: getCorsHeaders(), status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: getCorsHeaders(), status: 500 });
  }
});
