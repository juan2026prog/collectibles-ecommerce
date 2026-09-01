import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { calculateFee, calculateCanonicalPricing } from "../_shared/pricing.ts";

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
    
    // Check if user is authenticated or it's a service role call
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

    const { order_id, is_auto, is_retry = false } = await req.json();
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

    const shipping = order.shipping_address || {};
    const isIntlResolved = shipping.is_international_address_resolved === true;

    // Address verification helper (Rule 3 & 4: Strict validation without generic fallback)
    const isAddressValid = () => {
      return isIntlResolved && 
             !!shipping.international_courier_name && 
             !!shipping.international_recipient_name && 
             !!shipping.international_address_line_1 && 
             !!shipping.international_city && 
             !!shipping.international_state && 
             !!shipping.international_postal_code && 
             !!shipping.international_phone;
    };

    let first_name = '';
    let last_name = '';
    let address_line1 = '';
    let address_line2 = '';
    let city = '';
    let state = '';
    let zip_code = '';
    let phone_number = '';

    if (isAddressValid()) {
      first_name = shipping.international_recipient_name?.split(' ')[0] || '';
      last_name = shipping.international_recipient_name?.split(' ').slice(1).join(' ') || '.';
      address_line1 = shipping.international_address_line_1;
      
      const line2Parts = [shipping.international_address_line_2, shipping.international_customer_code].filter(Boolean);
      address_line2 = line2Parts.join(' ') || '';
      
      city = shipping.international_city;
      state = shipping.international_state;
      zip_code = shipping.international_postal_code;
      phone_number = shipping.international_phone;
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
      if (!prod) continue; // Standard national product, skip

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

      // If manual retry requested from admin, reset status to pending_purchase first
      if (is_retry) {
        await serviceClient.rpc('reset_international_order_item_for_retry', { p_item_id: intlOrderItem.id });
      }

      // 2. ATOMIC LOCK / IDEMPOTENCY: Claim item exclusively via database RPC
      const { data: lockClaimed } = await serviceClient.rpc('claim_international_order_item_for_zinc', {
        p_item_id: intlOrderItem.id
      });

      if (!lockClaimed) {
        console.log(`[Zinc Verify Lock] Item ${intlOrderItem.id} already claimed or completed (status: ${intlOrderItem.purchase_status}). Skipping.`);
        continue;
      }

      let failureMessage = "";
      let reasonCode = "";

      // 3. Check if order is paid
      if (order.payment_status !== 'approved' && order.status !== 'paid') {
        failureMessage = "La orden no está marcada como pagada.";
        reasonCode = "PAYMENT_INCONSISTENCY";
      }

      // 4. Check if product has external URL
      if (!failureMessage && !prod.product_url_external) {
        failureMessage = "El producto no tiene una URL de origen externa.";
        reasonCode = "UNKNOWN_ERROR";
      }

      // 5. Strict address validation (NO generic Urubox fallback)
      if (!failureMessage && !isAddressValid()) {
        failureMessage = "La dirección del courier en USA está incompleta en el snapshot de la orden.";
        reasonCode = "INVALID_ADDRESS_SNAPSHOT";
      }

      // 6. Live Check on Retailer & Profit Protection Engine
      let currentPrice = null;
      if (!failureMessage) {
        try {
          const url = `https://api.zinc.com/products/${prod.external_product_id}?retailer=amazon`;
          const res = await fetch(url, { headers: { 'Authorization': `Bearer ${ZINC_API_KEY}` } });
          
          if (!res.ok) throw new Error(`Retailer API error: ${res.status}`);
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
              failureMessage = "El producto internacional ya no está disponible en el proveedor.";
              reasonCode = "OUT_OF_STOCK";
          }
        } catch (err: any) {
          failureMessage = "No se pudo verificar disponibilidad del producto. " + err.message;
          reasonCode = "ZINC_TIMEOUT";
        }
      }

      let maxAmazonPrice = 0;
      if (!failureMessage && currentPrice) {
        const usaShipping = Number(prod.usa_domestic_shipping_usd || 0);
        const fee = prod.collectibles_fee_usd || 0;
        
        // Canonical pricing validation
        const canonical = calculateCanonicalPricing(currentPrice, usaShipping, fee, settings as any);
        const paidPriceUsd = Number(intlOrderItem.final_price_usd);
        const currentProfit = Number((paidPriceUsd - canonical.acquisition_cost_usd).toFixed(2));
        const requiredMinProfit = Number(settings.min_absolute_profit_usd || 2.00);

        // Strict Profit Protection: Profit must be strictly positive (> 0) and meet minimum required profit
        if (currentProfit <= 0 || currentProfit < requiredMinProfit || canonical.is_loss_adjusted) {
          failureMessage = `Variación de costos no cumple con la rentabilidad mínima requerida (Ganancia real calculada: $${currentProfit.toFixed(2)} USD, Mínimo requerido: $${requiredMinProfit.toFixed(2)} USD).`;
          reasonCode = "PRICE_CHANGED";
        }

        // Calculate max price allowed in Zinc order to protect minimum profit
        const purchasingFeeFloor = 0.61; // ((0 * 0.025) + 0.50) * 1.22
        maxAmazonPrice = Math.max(0, (paidPriceUsd - usaShipping - (settings.zinc_fee_usd || 1.00) - requiredMinProfit - purchasingFeeFloor) / 1.0305);
      }

      if (failureMessage) {
        allOk = false;
        finalOrderStatus = 'manual_review';
        await serviceClient.from('international_order_items').update({
          purchase_status: 'manual_review',
          review_reason_code: reasonCode,
          zinc_error_message: failureMessage,
          updated_at: new Date().toISOString()
        }).eq('id', intlOrderItem.id);
        continue;
      }

      // 7. Place Order in Zinc with Deterministic PO Number
      if (settings.auto_purchase_enabled || isServiceCall || (userObj && order.status === 'paid')) {
        const maxPriceCents = Math.max(1, Math.round(maxAmazonPrice * 100));
        const stablePoNumber = `${order.order_number || order.id}-${intlOrderItem.id.slice(0, 8)}`;
        
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
          po_number: stablePoNumber,
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
              review_reason_code: 'ZINC_REJECTED',
              zinc_po_number: stablePoNumber,
              zinc_request_payload: zincRequestPayload,
              zinc_response_payload: zincData,
              zinc_error_message: errStr,
              updated_at: new Date().toISOString()
            }).eq('id', intlOrderItem.id);
            allOk = false;
            finalOrderStatus = 'manual_review';
          } else {
            // Success - Zinc order request accepted
            const zincOrderId = zincData.request_id || zincData.id;
            await serviceClient.from('international_order_items').update({
              purchase_status: 'zinc_order_created',
              zinc_order_id: zincOrderId,
              zinc_po_number: stablePoNumber,
              zinc_request_payload: zincRequestPayload,
              zinc_response_payload: zincData,
              zinc_error_message: null,
              review_reason_code: null,
              updated_at: new Date().toISOString()
            }).eq('id', intlOrderItem.id);

            // Transition capital reservation to SPENT
            await serviceClient.rpc('spend_international_capacity', {
              p_reservation_id: intlOrderItem.reservation_id || null,
              p_order_id: order.id
            });
          }
        } catch (zincCallErr: any) {
          await serviceClient.from('international_order_items').update({
            purchase_status: 'zinc_failed',
            review_reason_code: 'ZINC_TIMEOUT',
            zinc_error_message: "Error de conexión con API de compras: " + zincCallErr.message,
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

    return new Response(JSON.stringify({ success: true, orderStatus: finalOrderStatus, allOk }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status: 200
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status: 500
    });
  }
});
