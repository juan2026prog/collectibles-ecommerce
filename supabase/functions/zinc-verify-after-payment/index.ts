import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { calculateFee, calculateCanonicalPricing } from "../_shared/pricing.ts";
import { 
  resolveZincApiKey, 
  buildZincAddress, 
  dollarsToCents, 
  assertProductionGate,
  ZincOrderCreatePayload 
} from "../_shared/zinc/index.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    // Auth client
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    
    // Authorization check: service role, admin, or customer ownership
    let isServiceCall = false;
    if (authHeader.includes(serviceRoleKey)) {
      isServiceCall = true;
    }

    let userObj: any = null;
    let isAdmin = false;
    if (!isServiceCall) {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Unauthorized");
      userObj = user;
      isAdmin = user.app_metadata?.role === 'admin' || user.user_metadata?.role === 'admin';
    }

    const { order_id, is_auto, is_retry = false } = await req.json();
    if (!order_id) throw new Error("Invalid payload: order_id is required");
    
    const { data: order, error: orderFetchErr } = await serviceClient
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single();

    if (orderFetchErr || !order) throw new Error("Order not found");

    // Enforce authorization: only service role, admin, or order owner can trigger purchase verification
    if (!isServiceCall && !isAdmin) {
      if (order.user_id !== userObj.id) {
        throw new Error("Forbidden: caller is not authorized for this order");
      }
    }

    const { data: settings } = await serviceClient.from('international_sync_settings').select('*').eq('id', 1).single();
    if (!settings) throw new Error("International sync settings not found");

    // Resolve explicit Zinc environment (no generic fallback)
    const targetEnv: "sandbox" | "production" = settings.zinc_production_enabled === true ? "production" : "sandbox";
    const ZINC_API_KEY = await resolveZincApiKey(serviceClient, targetEnv);

    let finalOrderStatus = order.status;
    let allOk = true;

    const shipping = order.shipping_address || {};

    // Strict address validation (throws descriptive error on missing fields; no fake placeholders)
    let zincShippingAddress;
    try {
      zincShippingAddress = buildZincAddress(shipping);
    } catch (addrErr: any) {
      zincShippingAddress = null;
    }

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

      // 5. Strict address check
      if (!failureMessage && !zincShippingAddress) {
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
        // Enforce Server-Side Hard Production Safety Gate
        try {
          assertProductionGate(ZINC_API_KEY, settings.zinc_production_enabled === true);
        } catch (gateErr: any) {
          console.warn("[ZINC PRODUCTION GATE BLOCKED]", gateErr.message);
          await serviceClient.from('international_order_items').update({
            purchase_status: 'zinc_failed',
            review_reason_code: 'ZINC_GATE_BLOCKED',
            zinc_error_message: gateErr.message,
            updated_at: new Date().toISOString()
          }).eq('id', intlOrderItem.id);
          allOk = false;
          finalOrderStatus = 'manual_review';
          continue;
        }

        const maxPriceCents = dollarsToCents(maxAmazonPrice);
        const stablePoNumber = `${order.order_number || order.id}-${intlOrderItem.id.slice(0, 8)}`;
        
        // 1. Official V2 Idempotency: single key per logical purchase, persisted in DB BEFORE first POST
        let idempotencyKey = intlOrderItem.idempotency_key;
        if (!idempotencyKey) {
          idempotencyKey = intlOrderItem.id ? String(intlOrderItem.id) : crypto.randomUUID();
          
          // CRITICAL: Persist in database BEFORE sending the POST request, and inspect error
          const { error: idempPersistErr } = await serviceClient.from('international_order_items').update({
            idempotency_key: idempotencyKey,
            zinc_po_number: stablePoNumber,
            updated_at: new Date().toISOString()
          }).eq('id', intlOrderItem.id);

          if (idempPersistErr) {
            console.error("[ZINC IDEMPOTENCY PERSISTENCE FAILED]", idempPersistErr.message);
            await serviceClient.from('international_order_items').update({
              purchase_status: 'manual_review',
              review_reason_code: 'IDEMPOTENCY_PERSISTENCE_FAILED',
              zinc_error_message: `No se pudo persistir la clave de idempotencia: ${idempPersistErr.message}`,
              updated_at: new Date().toISOString()
            }).eq('id', intlOrderItem.id);
            allOk = false;
            finalOrderStatus = 'manual_review';
            continue;
          }
          intlOrderItem.idempotency_key = idempotencyKey;
        }

        const zincRequestPayload: ZincOrderCreatePayload = {
          products: [{
            url: prod.product_url_external,
            quantity: Math.max(1, item.quantity || 1)
          }],
          shipping_address: zincShippingAddress!,
          max_price: maxPriceCents,
          idempotency_key: idempotencyKey,
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
          const isAlreadyExists = zincRes.status === 409 || zincData?.code === 'already_exists';

          if (isAlreadyExists) {
            // Official V2 Idempotency: already_exists on retry means original order got through.
            let existingOrderId: string | null = null;
            const cand = zincData?.details?.identifier;
            if (typeof cand === "string" && cand.trim().length > 0 && cand !== stablePoNumber) {
              existingOrderId = cand.trim();
            } else if (typeof zincData?.id === "string" && zincData.id.trim().length > 0 && zincData.id !== stablePoNumber) {
              existingOrderId = zincData.id.trim();
            } else if (intlOrderItem.zinc_order_id && intlOrderItem.zinc_order_id !== stablePoNumber) {
              existingOrderId = intlOrderItem.zinc_order_id;
            }
            // CRITICAL: NEVER store stablePoNumber in zinc_order_id

            const { error: itemUpdErr } = await serviceClient.from('international_order_items').update({
              purchase_status: 'zinc_order_created',
              zinc_order_id: existingOrderId,
              zinc_po_number: stablePoNumber,
              zinc_request_payload: zincRequestPayload,
              zinc_response_payload: zincData,
              zinc_error_message: null,
              review_reason_code: null,
              updated_at: new Date().toISOString()
            }).eq('id', intlOrderItem.id);

            if (itemUpdErr) {
              console.error("[zinc-verify-after-payment] Error updating item on already_exists:", itemUpdErr.message);
            }

            const { error: spendErr } = await serviceClient.rpc('spend_international_capacity', {
              p_reservation_id: intlOrderItem.reservation_id || null,
              p_order_id: order.id
            });
            if (spendErr) {
              console.error("[zinc-verify-after-payment] Error spending capacity on already_exists:", spendErr.message);
            }
          } else if (!zincRes.ok || zincData.error || (zincData.status && zincData.status === 'failed')) {
            const errStr = zincData.message || zincData.error?.message || zincData.error || "Zinc orders creation failed";
            const { error: itemUpdErr } = await serviceClient.from('international_order_items').update({
              purchase_status: 'zinc_failed',
              review_reason_code: 'ZINC_REJECTED',
              zinc_po_number: stablePoNumber,
              zinc_request_payload: zincRequestPayload,
              zinc_response_payload: zincData,
              zinc_error_message: errStr,
              updated_at: new Date().toISOString()
            }).eq('id', intlOrderItem.id);

            if (itemUpdErr) {
              console.error("[zinc-verify-after-payment] Error updating item on reject:", itemUpdErr.message);
            }
            allOk = false;
            finalOrderStatus = 'manual_review';
          } else {
            // Success - Zinc order request accepted
            const zincOrderId = zincData.id || zincData.request_id || null;
            const { error: itemUpdErr } = await serviceClient.from('international_order_items').update({
              purchase_status: 'zinc_order_created',
              zinc_order_id: zincOrderId,
              zinc_po_number: stablePoNumber,
              zinc_request_payload: zincRequestPayload,
              zinc_response_payload: zincData,
              zinc_error_message: null,
              review_reason_code: null,
              updated_at: new Date().toISOString()
            }).eq('id', intlOrderItem.id);

            if (itemUpdErr) {
              console.error("[zinc-verify-after-payment] Error updating item on success:", itemUpdErr.message);
            }

            // Transition capital reservation to SPENT
            const { error: spendErr } = await serviceClient.rpc('spend_international_capacity', {
              p_reservation_id: intlOrderItem.reservation_id || null,
              p_order_id: order.id
            });
            if (spendErr) {
              console.error("[zinc-verify-after-payment] Error spending capacity on success:", spendErr.message);
            }
          }
        } catch (zincCallErr: any) {
          const { error: itemUpdErr } = await serviceClient.from('international_order_items').update({
            purchase_status: 'zinc_failed',
            review_reason_code: 'ZINC_TIMEOUT',
            zinc_error_message: "Error de conexión con API de compras: " + zincCallErr.message,
            updated_at: new Date().toISOString()
          }).eq('id', intlOrderItem.id);

          if (itemUpdErr) {
            console.error("[zinc-verify-after-payment] Error updating item on timeout:", itemUpdErr.message);
          }
          allOk = false;
          finalOrderStatus = 'manual_review';
        }
      }
    }

    if (!allOk) {
      const { error: orderUpdErr } = await serviceClient.from('orders').update({ status: finalOrderStatus }).eq('id', order_id);
      if (orderUpdErr) {
        console.error("[zinc-verify-after-payment] Error updating parent order status:", orderUpdErr.message);
      }
    }

    return new Response(JSON.stringify({ success: true, orderStatus: finalOrderStatus, allOk }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status: 200
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status: error.message?.includes("Forbidden") ? 403 : error.message?.includes("Unauthorized") ? 401 : 500
    });
  }
});
