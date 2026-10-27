import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { syncProductsToCloudflareD1 } from "../_shared/cloudflareCatalogSync.ts";

Deno.serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  let user: any = null;
  let clientIp = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "";
  let orderId: string | null = null;
  let suborderId: string | null = null;
  let orderItemId: string | null = null;
  let refundQuantity: number | null = null;
  let effectiveRefundQty = 0;
  let restoreStock = false;
  let amount: number | null = null;
  let reason: string | null = null;
  let bypassLiquidationCheck = false;

  let order: any = null;
  let refundAmount = 0;
  let processingRefundId: string | null = null;
  let refundSuccess = false;
  let refundDetails: any = null;
  let gatewayRefundId: string | null = null;
  let isManualRefundRequired = false;

  try {
    // SECURITY: Only admins can process refunds
    user = await verifyAdmin(req);
    const requestedBy = (user?.id && user.id !== 'test_bypass' && user.id !== 'service_role') ? user.id : null;

    const payload = await req.json();
    orderId = payload.orderId;
    suborderId = payload.suborderId;
    orderItemId = payload.orderItemId || null;
    refundQuantity = payload.quantity !== undefined && payload.quantity !== null ? Number(payload.quantity) : null;
    restoreStock = payload.restoreStock !== undefined ? Boolean(payload.restoreStock) : true; // Por defecto true si cancela unidades
    amount = payload.amount;
    reason = payload.reason;
    bypassLiquidationCheck = payload.bypassLiquidationCheck || false;
    const idempotencyKey = payload.idempotencyKey ? String(payload.idempotencyKey).trim() : null;

    if (!orderId) throw new Error("Falta el ID de la orden");
    if (!idempotencyKey) {
      throw new Error("Idempotency key obligatoria: toda solicitud de reembolso requiere un identificador único.");
    }

    // Idempotency check: if refund already completed for this order / suborder / idempotencyKey
    if (idempotencyKey) {
      const { data: existingRefund } = await supabaseAdmin
        .from("refunds")
        .select("*")
        .eq("order_id", orderId)
        .eq("status", "completed")
        .filter("api_response->idempotency_key", "eq", idempotencyKey)
        .maybeSingle();

      if (existingRefund) {
        console.log(`[Refund] Idempotent replay detected for key: ${idempotencyKey}`);
        return new Response(JSON.stringify({ 
          success: true, 
          refundSuccess: true, 
          idempotent: true, 
          refundDetails: existingRefund.api_response 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 1. Fetch Order
    const { data: fetchedOrder, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !fetchedOrder) {
      console.error("Error fetching order:", orderErr);
      throw new Error("Orden no encontrada");
    }
    order = fetchedOrder;
    if (order.status === "cancelada" && !suborderId && !orderItemId) {
      throw new Error("La orden ya está completamente cancelada");
    }

    // 2. Fetch Suborders
    const { data: suborders, error: subordersErr } = await supabaseAdmin
      .from("order_suborders")
      .select("*")
      .eq("parent_order_id", orderId);

    if (subordersErr || !suborders || suborders.length === 0) {
      throw new Error("No se encontraron subórdenes para esta orden.");
    }

    // 3. Fetch Payments
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Validate Vendor Liquidation Status (Finance Protection)
    if (suborderId) {
      const sub = suborders.find(s => s.id === suborderId);
      if (!sub) throw new Error("Suborden no encontrada");
      if (sub.status === "cancelled" || sub.status === "refunded") {
        throw new Error("Esta suborden ya está cancelada o reembolsada");
      }
      if (sub.liquidation_status === "paid" && !bypassLiquidationCheck) {
        throw new Error("Esta suborden ya fue liquidada al vendedor. Bloqueo financiero activo.");
      }
    } else {
      // Full Refund check
      const hasPaidLiquidation = suborders.some(s => s.liquidation_status === "paid");
      if (hasPaidLiquidation && !bypassLiquidationCheck) {
        throw new Error("Esta orden contiene subórdenes ya liquidadas al vendedor. Bloqueo financiero activo.");
      }
    }

    // 5. Calculate Refund Amount & Validate Financial and Quantity Bounds
    let targetSuborder: any = null;
    let targetOrderItem: any = null;
    let vendorId: string | null = null;

    if (orderItemId) {
      const { data: itemData, error: itemErr } = await supabaseAdmin
        .from("order_items")
        .select("id, order_id, suborder_id, product_id, variant_id, vendor_id, quantity, unit_price, total_price, final_total, discount_total, refunded_quantity, refunded_amount")
        .eq("id", orderItemId)
        .eq("order_id", orderId)
        .single();

      if (itemErr || !itemData) {
        throw new Error("El artículo a reembolsar no pertenece a esta orden.");
      }
      targetOrderItem = itemData;

      if (suborderId && targetOrderItem.suborder_id && targetOrderItem.suborder_id !== suborderId) {
        throw new Error("El artículo no coincide con la suborden seleccionada.");
      }
      if (!suborderId && targetOrderItem.suborder_id) {
        suborderId = targetOrderItem.suborder_id;
      }

      if (suborderId) {
        targetSuborder = suborders.find(s => s.id === suborderId);
        vendorId = targetSuborder?.vendor_id || targetOrderItem.vendor_id || null;
      }

      const itemTotal = Number(targetOrderItem.final_total || targetOrderItem.total_price || (targetOrderItem.unit_price * (targetOrderItem.quantity || 1)));
      const alreadyRefundedItem = Number(targetOrderItem.refunded_amount || 0);
      const remainingItemAmount = Math.max(0, itemTotal - alreadyRefundedItem);

      const itemQty = Number(targetOrderItem.quantity || 1);
      const alreadyRefundedQty = Number(targetOrderItem.refunded_quantity || 0);
      const remainingQty = Math.max(0, itemQty - alreadyRefundedQty);

      if (remainingQty <= 0 && remainingItemAmount <= 0.01) {
        throw new Error("El artículo ya ha sido completamente reembolsado tanto en cantidad como en importe.");
      }

      // Validar cantidad numérica con Number.isInteger y Number.isFinite
      if (refundQuantity !== null && refundQuantity !== undefined) {
        if (!Number.isFinite(refundQuantity) || !Number.isInteger(refundQuantity)) {
          throw new Error("La cantidad de unidades debe ser un número entero finito.");
        }
        if (refundQuantity < 0) {
          throw new Error("La cantidad de unidades a reembolsar o cancelar no puede ser negativa.");
        }
        if (refundQuantity > remainingQty) {
          throw new Error(`La cantidad solicitada (${refundQuantity}) supera las unidades disponibles para reembolso (${remainingQty}) del artículo.`);
        }
      }

      // Validar importe con Number.isFinite y exigir límites positivos
      if (amount !== undefined && amount !== null) {
        if (!Number.isFinite(amount) || isNaN(amount)) {
          throw new Error("El importe a reembolsar debe ser un número finito válido.");
        }
        if (amount <= 0) {
          throw new Error("El importe a reembolsar debe ser estrictamente mayor a 0.");
        }
        refundAmount = Number(amount);
        // Si el llamador especificó explícitamente refundQuantity (incluso 0 para compensación monetaria pura):
        if (refundQuantity !== null && refundQuantity !== undefined) {
          effectiveRefundQty = refundQuantity;
        } else {
          // Si NO se especificó cantidad, es compensación monetaria sin cancelación de unidades (0 unidades)
          // NUNCA inferir unidades devueltas solo porque el importe coincide con el total
          effectiveRefundQty = 0;
        }
      } else if (refundQuantity !== null && refundQuantity !== undefined && itemQty > 0) {
        effectiveRefundQty = refundQuantity;
        const perUnit = itemTotal / itemQty;
        refundAmount = Math.min(remainingItemAmount, perUnit * refundQuantity);
      } else {
        // Reembolso total de la línea restante
        effectiveRefundQty = remainingQty;
        refundAmount = remainingItemAmount;
      }

      if (refundAmount > remainingItemAmount + 0.01) {
        throw new Error(`El importe solicitado ($${refundAmount}) supera el saldo disponible del artículo ($${remainingItemAmount}).`);
      }
    } else if (suborderId) {
      targetSuborder = suborders.find(s => s.id === suborderId);
      vendorId = targetSuborder.vendor_id;
      const suborderTotal = Number(targetSuborder.product_subtotal) + Number(targetSuborder.shipping_cost) - Number(targetSuborder.discount_total || 0);
      
      if (amount !== undefined && amount !== null) {
        if (!Number.isFinite(amount) || isNaN(amount) || amount <= 0) {
          throw new Error("El importe a reembolsar debe ser un número finito estrictamente mayor a 0.");
        }
        refundAmount = Number(amount);
      } else {
        refundAmount = suborderTotal;
      }

      if (refundAmount > suborderTotal) {
        throw new Error(`El importe de reembolso ($${refundAmount}) supera el total de la suborden ($${suborderTotal})`);
      }
    } else {
      if (amount !== undefined && amount !== null) {
        if (!Number.isFinite(amount) || isNaN(amount) || amount <= 0) {
          throw new Error("El importe a reembolsar debe ser un número finito estrictamente mayor a 0.");
        }
        refundAmount = Number(amount);
      } else {
        refundAmount = Number(order.total_amount);
      }
    }

    // Adquisición atómica del lock y reserva transaccional de saldo en PostgreSQL usando EXACTAMENTE el importe validado
    const { data: lockResult, error: lockRpcErr } = await supabaseAdmin.rpc("acquire_refund_lock_atomic", {
      p_order_id: orderId,
      p_suborder_id: suborderId || null,
      p_amount: refundAmount,
      p_idempotency_key: idempotencyKey,
      p_provider: order.payment_method,
      p_reason: reason || "Intención de reembolso en proceso",
      p_requested_by: requestedBy,
      p_order_item_id: orderItemId || null
    });

    if (lockRpcErr) {
      console.error("[Refund] Error RPC acquire_refund_lock_atomic:", lockRpcErr.message);
      throw new Error(`Error en el bloqueo transaccional de reembolso: ${lockRpcErr.message}`);
    }

    // Si lockResult indica idempotent === true, terminar INMEDIATAMENTE sin llamar a ninguna pasarela
    if (lockResult?.idempotent === true) {
      console.log(`[Refund] RPC Idempotent replay detected for key: ${idempotencyKey}. No gateway called.`);
      return new Response(JSON.stringify({ 
        success: true, 
        refundSuccess: true, 
        idempotent: true, 
        refundDetails: lockResult.refund_details 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!lockResult || lockResult.success !== true) {
      throw new Error(lockResult?.error || "No se pudo adquirir el lock de reembolso.");
    }

    processingRefundId = lockResult.lock_id;

    // 5b. Control estricto de reembolsos acumulados sobre la orden
    const { data: previousRefunds } = await supabaseAdmin
      .from("refunds")
      .select("amount, status")
      .eq("order_id", orderId)
      .in("status", ["completed", "partial"]);

    const totalPreviouslyRefunded = (previousRefunds || []).reduce(
      (sum: number, r: any) => sum + Number(r.amount || 0), 
      0
    );

    const orderTotal = Number(order.total_amount || 0);
    const availableToRefund = Math.max(0, orderTotal - totalPreviouslyRefunded);

    if (refundAmount > availableToRefund + 0.01) { // 1 cent threshold
      throw new Error(`El importe solicitado ($${refundAmount.toFixed(2)}) supera el saldo disponible reembolsable de la orden ($${availableToRefund.toFixed(2)}). Total cobrado: $${orderTotal.toFixed(2)}, ya reembolsado: $${totalPreviouslyRefunded.toFixed(2)}.`);
    }

    // Get config for tokens
    const { data: settings } = await supabaseAdmin.from('site_settings').select('key, value');
    const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));
      
    let mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || config.payments_mercadopago_access_token;
    const isEnvTestOrDev = Deno.env.get("ENVIRONMENT") === "development" || Deno.env.get("ENVIRONMENT") === "test";
    const isMockPayment = isEnvTestOrDev && (order.payment_id?.startsWith('MP-MOCK') || order.payment_id?.startsWith('DLG-MOCK'));

    refundSuccess = false;
    refundDetails = null;
    gatewayRefundId = null;
    isManualRefundRequired = false;

    // ═════ COURIER SHIPMENTS CHECK (FASE 1) ═════
    const shipmentQuery = supabaseAdmin
      .from("shipments")
      .select("*")
      .eq("order_id", orderId);
    
    if (suborderId) {
      shipmentQuery.eq("suborder_id", suborderId);
    }
    const { data: orderShipments } = await shipmentQuery;

    let hasDispatchedShipment = false;
    let hasLabelCreatedShipment = false;

    if (orderShipments && orderShipments.length > 0) {
      for (const ship of orderShipments) {
        const status = ship.shipping_status;
        if (['in_transit', 'out_for_delivery', 'delivered', 'shipped', 'rejected'].includes(status)) {
          hasDispatchedShipment = true;
        } else if (['documented', 'ready_to_ship', 'label_created'].includes(status)) {
          hasLabelCreatedShipment = true;
        }
      }
    }

    if (hasDispatchedShipment) {
      throw new Error("El envío ya fue despachado. Se requiere devolución física de los productos e intervención manual. No se puede realizar reembolso automático.");
    }

    if (hasLabelCreatedShipment) {
      // Set shipment status to label_created
      if (orderShipments) {
        for (const ship of orderShipments) {
          if (['documented', 'ready_to_ship', 'label_created'].includes(ship.shipping_status)) {
            await supabaseAdmin
              .from("shipments")
              .update({ shipping_status: "label_created", updated_at: new Date().toISOString() })
              .eq("id", ship.id);
          }
        }
      }
      isManualRefundRequired = true;
      refundDetails = { error: "La etiqueta de envío ya fue generada. Se requiere cancelación manual de la guía en el transportista." };
    }

    if (!hasDispatchedShipment && !hasLabelCreatedShipment && orderShipments && orderShipments.length > 0) {
      // Caso A: La etiqueta todavía NO fue creada. Cancelar shipments en DB.
      for (const ship of orderShipments) {
        await supabaseAdmin
          .from("shipments")
          .update({ shipping_status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", ship.id);
      }
    }

    // ═════ INTERNATIONAL ZINC ORDER CHECK (FASE 2) ═════
    const { data: orderItems } = await supabaseAdmin
      .from("order_items")
      .select("id, suborder_id")
      .eq("order_id", orderId);

    const orderItemIds = orderItems?.map((i: any) => i.id) || [];
    let hasPurchasedIntlItem = false;
    const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");

    if (orderItemIds.length > 0) {
      const { data: intlItems } = await supabaseAdmin
        .from("international_order_items")
        .select("*, order_item:order_items(suborder_id)")
        .in("order_item_id", orderItemIds);

      if (intlItems && intlItems.length > 0) {
        for (const intlItem of intlItems) {
          const itemSuborderId = intlItem.order_item?.suborder_id;
          if (suborderId && itemSuborderId !== suborderId) {
            continue;
          }
          const purchaseStatus = intlItem.purchase_status;
          
          if (['purchased', 'warehouse_received', 'shipped', 'delivered', 'shipped_to_courier', 'delivered_to_courier'].includes(purchaseStatus)) {
            hasPurchasedIntlItem = true;
            break;
          }

          if (['zinc_order_created', 'zinc_processing'].includes(purchaseStatus) && intlItem.zinc_order_id) {
            if (!ZINC_API_KEY) {
              throw new Error("ZINC_API_KEY no configurada para procesar la cancelación internacional.");
            }
            
            console.log(`[Refund] Attempting to cancel Zinc order ${intlItem.zinc_order_id} for item ${intlItem.id}...`);
            try {
              const cancelRes = await fetch(`https://api.zinc.com/orders/${intlItem.zinc_order_id}/cancel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${ZINC_API_KEY}` }
              });
              
              if (cancelRes.status === 204) {
                // Zinc 2.0 Cancellation Protocol: HTTP 204 No Content confirms cancellation
                console.log(`[Refund] Zinc 2.0 cancellation confirmed with HTTP 204 for order ${intlItem.zinc_order_id}`);
                
                await supabaseAdmin.from("international_order_items").update({
                  purchase_status: 'cancelled',
                  review_reason_code: 'ZINC_204_CANCELLED',
                  updated_at: new Date().toISOString()
                }).eq("id", intlItem.id);
              } else {
                const errText = await cancelRes.text().catch(() => '');
                console.error(`[Refund] Zinc cancellation API error: ${cancelRes.status}`, errText);
                
                await supabaseAdmin.from("international_order_items").update({
                  purchase_status: 'cancellation_requires_review'
                }).eq("id", intlItem.id);
                
                if (itemSuborderId) {
                  await supabaseAdmin.from("order_suborders").update({
                    status: 'cancellation_requires_review',
                    updated_at: new Date().toISOString()
                  }).eq("id", itemSuborderId);
                }
                
                await supabaseAdmin.from("orders").update({
                  status: 'cancellation_requires_review',
                  updated_at: new Date().toISOString()
                }).eq("id", orderId);
                
                throw new Error("Zinc no pudo cancelar la compra en Amazon. Cancelación automática bloqueada. Se requiere revisión manual.");
              }
              
            } catch (err: any) {
              console.error(`[Refund] Error calling Zinc cancellation API:`, err.message);
              
              await supabaseAdmin.from("international_order_items").update({
                purchase_status: 'cancellation_requires_review'
              }).eq("id", intlItem.id);
              
              if (itemSuborderId) {
                await supabaseAdmin.from("order_suborders").update({
                  status: 'cancellation_requires_review',
                  updated_at: new Date().toISOString()
                }).eq("id", itemSuborderId);
              }
              
              await supabaseAdmin.from("orders").update({
                status: 'cancellation_requires_review',
                updated_at: new Date().toISOString()
              }).eq("id", orderId);
              
              throw new Error(`Error llamando a la API de cancelación de Zinc: ${err.message}`);
            }
          }
        }
      }
    }

    if (hasPurchasedIntlItem) {
      throw new Error("El proveedor internacional ya procesó la compra. Reembolso automático bloqueado para evitar pérdidas financieras.");
    }

    // ═════ REFUND PROCESSING BY METHOD ═════
    if (isManualRefundRequired) {
      console.log(`[Refund] Manual refund required because label was already created.`);
      refundSuccess = false;
    }
    else if (isMockPayment) {
      console.log(`[Refund] Mock Mode: Bypassing external API call for payment method "${order.payment_method}"`);
      refundSuccess = true;
      gatewayRefundId = "REFUND-MOCK-" + Math.floor(Math.random() * 1000000);
      refundDetails = { refund_id: gatewayRefundId, mock: true };
    } 
    else if (order.payment_method === 'mercadopago') {
      if (!mpAccessToken) {
        throw new Error("NOT_CONFIGURED: Credenciales de Mercado Pago no configuradas para procesar el reembolso.");
      }
      let actualPaymentId = order.payment_id;
      if (!actualPaymentId || isNaN(Number(actualPaymentId))) {
        // Search payment by reference
        try {
          const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc`;
          const searchRes = await fetch(searchUrl, {
            headers: { "Authorization": `Bearer ${mpAccessToken}` }
          });
          const searchData = await searchRes.json();
          if (searchRes.ok && searchData.results?.length > 0) {
            const approved = searchData.results.find((p: any) => p.status === 'approved') || searchData.results[0];
            actualPaymentId = approved.id.toString();
          }
        } catch (e: any) {
          console.error("Error searching MP payment ID:", e.message);
        }
      }

      if (actualPaymentId && !isNaN(Number(actualPaymentId))) {
        try {
          const bodyPayload: Record<string, any> = {};
          if (suborderId || amount) {
            bodyPayload.amount = refundAmount;
          }
          const resp = await fetch(`https://api.mercadopago.com/v1/payments/${actualPaymentId}/refunds`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${mpAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: Object.keys(bodyPayload).length > 0 ? JSON.stringify(bodyPayload) : undefined
          });
          const mpData = await resp.json();
          
          if (!resp.ok) {
            console.error("Error Mercado Pago Refund API:", mpData);
            refundDetails = mpData;
            throw new Error(mpData.message || 'Error en la API de Mercado Pago');
          } else {
            refundSuccess = true;
            gatewayRefundId = mpData.id?.toString() || null;
            refundDetails = mpData;
          }
        } catch (e: any) {
          console.error("MP refund error:", e.message);
          throw e;
        }
      } else {
        throw new Error("No se pudo obtener un ID de pago de Mercado Pago válido para esta orden.");
      }
    } 
    else if (order.payment_method === 'paypal') {
      const isSandbox = config.payments_paypal_sandbox === 'true';
      const clientId = config.payments_paypal_client_id;
      const secret = config.payments_paypal_client_secret || config.payments_paypal_secret_key;
      const baseUrl = isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

      if (clientId && secret && order.payment_id) {
        try {
          const auth = btoa(`${clientId}:${secret}`);
          const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
            method: "POST",
            headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: "grant_type=client_credentials"
          });
          const tokenData = await tokenRes.json();

          if (tokenRes.ok) {
            const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.payment_id}`, {
              headers: { "Authorization": `Bearer ${tokenData.access_token}` }
            });
            const captureData = await captureRes.json();
            const captureId = captureData?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
            
            if (captureId) {
              const bodyPayload: Record<string, any> = {};
              if (suborderId || amount) {
                bodyPayload.amount = {
                  value: refundAmount.toFixed(2),
                  currency_code: order.currency || "UYU"
                };
              }
              const refundRes = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${tokenData.access_token}`,
                  "Content-Type": "application/json"
                },
                body: Object.keys(bodyPayload).length > 0 ? JSON.stringify(bodyPayload) : undefined
              });
              const refundData = await refundRes.json();
              if (refundRes.ok) {
                refundSuccess = true;
                gatewayRefundId = refundData.id;
                refundDetails = refundData;
              } else {
                refundDetails = refundData;
                throw new Error(refundData.message || 'Error en la API de PayPal');
              }
            } else {
              throw new Error("No se pudo obtener el capture ID de PayPal");
            }
          } else {
            throw new Error("Error de autenticación con PayPal");
          }
        } catch (e: any) {
          console.error("PayPal refund error:", e.message);
          throw e;
        }
      } else {
        throw new Error("Credenciales de PayPal incompletas o ID de pago no asignado.");
      }
    } 
    else if (order.payment_method === 'handy' || order.payment_method === 'dlocalgo' || order.payment_method === 'dlocal') {
      console.warn(`[Refund] Payment method "${order.payment_method}" requires manual refund.`);
      isManualRefundRequired = true;
      refundSuccess = false;
      refundDetails = { error: "Esta pasarela requiere devolución manual." };
    } 
    else {
      console.log(`[Refund] Offline payment method "${order.payment_method}". Requires administrative confirmation.`);
      isManualRefundRequired = true;
      refundSuccess = false;
      refundDetails = { manual_offline: true, note: "Pago offline requiere verificación y comprobante antes de marcar reembolsado." };
    }

    // ═════ DATABASE UPDATES (TRANSACTIONAL WORKFLOW) ═════
    const paymentIdUuid = payment?.id || null;

    if (refundSuccess) {
      // A. SUCCESSFUL REVERSAL FLOW
      let dbRefund: any = null;
      if (processingRefundId) {
        const { data: updatedRefund, error: refundUpdateErr } = await supabaseAdmin
          .from("refunds")
          .update({
            suborder_id: suborderId || null,
            order_item_id: orderItemId || null,
            quantity: effectiveRefundQty,
            vendor_id: vendorId,
            payment_id: paymentIdUuid,
            provider: order.payment_method,
            provider_refund_id: gatewayRefundId,
            idempotency_key: idempotencyKey || null,
            amount: refundAmount,
            reason: reason || "Cancelación / Reembolso procesado",
            status: "completed",
            processed_at: new Date().toISOString(),
            api_response: {
              ...refundDetails,
              idempotency_key: idempotencyKey || undefined,
              order_item_id: orderItemId || undefined
            }
          })
          .eq("id", processingRefundId)
          .select("id")
          .single();

        if (refundUpdateErr) throw refundUpdateErr;
        dbRefund = updatedRefund;
      } else {
        const { data: insertedRefund, error: refundInsertErr } = await supabaseAdmin
          .from("refunds")
          .insert({
            order_id: orderId,
            suborder_id: suborderId || null,
            order_item_id: orderItemId || null,
            quantity: effectiveRefundQty,
            vendor_id: vendorId,
            payment_id: paymentIdUuid,
            provider: order.payment_method,
            provider_refund_id: gatewayRefundId,
            amount: refundAmount,
            reason: reason || "Cancelación / Reembolso procesado",
            status: "completed",
            requested_by: requestedBy,
            processed_at: new Date().toISOString(),
            api_response: {
              ...refundDetails,
              idempotency_key: idempotencyKey || undefined,
              order_item_id: orderItemId || undefined
            }
          })
          .select("id")
          .single();

        if (refundInsertErr) throw refundInsertErr;
        dbRefund = insertedRefund;
      }

      // Create Vendor Financial Adjustments if any suborder was already paid
      const paidSuborders = suborders.filter(s => s.liquidation_status === 'paid' && (suborderId ? s.id === suborderId : true));
      for (const sub of paidSuborders) {
        let subRefundAmount = 0;
        if (suborderId) {
          subRefundAmount = refundAmount;
        } else {
          subRefundAmount = Number(sub.product_subtotal) + Number(sub.shipping_cost) - Number(sub.discount_total || 0);
        }

        const { error: adjErr } = await supabaseAdmin
          .from("vendor_financial_adjustments")
          .insert({
            vendor_id: sub.vendor_id,
            suborder_id: sub.id,
            order_id: orderId,
            refund_id: dbRefund.id,
            type: 'refund_debit',
            amount: subRefundAmount,
            reason: `Reembolso post-liquidación autorizado por admin. Motivo: ${reason || 'Devolución'}`,
            status: 'pending',
            created_by: requestedBy
          });

        if (adjErr) {
          console.error("Error creating vendor financial adjustment:", adjErr);
          throw new Error("Error al registrar el ajuste financiero del vendedor: " + adjErr.message);
        }
      }

      // Log the event in payment_audit_logs
      await supabaseAdmin.from("payment_audit_logs").insert({
        user_id: requestedBy,
        action: suborderId ? "partial_refund_success" : "full_refund_success",
        order_id: orderId,
        suborder_id: suborderId || null,
        payment_id: paymentIdUuid,
        refund_id: dbRefund.id,
        provider: order.payment_method,
        amount: refundAmount,
        api_response: refundDetails,
        ip_address: clientIp
      });

      // Update payments table
      if (paymentIdUuid) {
        const nextPaymentStatus = suborderId ? "partially_refunded" : "refunded";
        await supabaseAdmin
          .from("payments")
          .update({
            status: nextPaymentStatus,
            provider_refund_id: gatewayRefundId,
            refund_amount: refundAmount,
            refund_date: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", paymentIdUuid);
      }

      // Update Order, Suborders, and Items
      if (orderItemId && targetOrderItem) {
        // ─── GRANULAR ITEM-LEVEL REFUND ───
        const currentRefQty = Number(targetOrderItem.refunded_quantity || 0);
        const itemOrderedQty = Number(targetOrderItem.quantity || 1);
        const newRefQty = Math.min(itemOrderedQty, currentRefQty + effectiveRefundQty);
        const currentRefAmt = Number(targetOrderItem.refunded_amount || 0);
        const newRefAmt = currentRefAmt + refundAmount;

        const itemTotalAmount = Number(targetOrderItem.final_total || targetOrderItem.total_price || 0);
        // El artículo solo queda 'refunded' si se reembolsó la totalidad del dinero O si todas sus unidades fueron canceladas/devueltas
        const isItemFullyRefunded = (newRefAmt >= itemTotalAmount - 0.01) || (newRefQty >= itemOrderedQty);

        await supabaseAdmin
          .from("order_items")
          .update({
            status: isItemFullyRefunded ? "refunded" : "active",
            refunded_quantity: newRefQty,
            refunded_amount: newRefAmt
          })
          .eq("id", orderItemId);

        // Actualizar order_suborders proporcionalmente SIN marcar toda la suborden como refunded si quedan otros ítems activos
        const { data: siblingItems } = await supabaseAdmin
          .from("order_items")
          .select("id, status, refunded_amount, final_total")
          .eq("suborder_id", targetOrderItem.suborder_id);

        const allSiblingsRefunded = siblingItems && siblingItems.every((si: any) => si.status === 'refunded' || si.status === 'cancelled');

        if (allSiblingsRefunded) {
          await supabaseAdmin
            .from("order_suborders")
            .update({
              status: "refunded",
              liquidation_status: bypassLiquidationCheck ? "paid" : "cancelled",
              updated_at: new Date().toISOString()
            })
            .eq("id", targetOrderItem.suborder_id);
        } else {
          await supabaseAdmin
            .from("order_suborders")
            .update({
              status: "partially_refunded",
              updated_at: new Date().toISOString()
            })
            .eq("id", targetOrderItem.suborder_id);
        }

        // Actualizar estado general de la orden
        const { data: allOrderItems } = await supabaseAdmin
          .from("order_items")
          .select("id, status")
          .eq("order_id", orderId);

        const allOrderItemsRefunded = allOrderItems && allOrderItems.every((oi: any) => oi.status === 'refunded' || oi.status === 'cancelled');

        await supabaseAdmin
          .from("orders")
          .update({
            payment_status: allOrderItemsRefunded ? "refunded" : "partially_refunded",
            status: allOrderItemsRefunded ? "refunded" : "partially_refunded",
            delivery_notes: order.delivery_notes 
              ? `${order.delivery_notes}\n[Refund Ítem] Artículo ${targetOrderItem.product_name || orderItemId} reembolsado ($${refundAmount}).`
              : `[Refund Ítem] Artículo ${targetOrderItem.product_name || orderItemId} reembolsado ($${refundAmount}).`,
            updated_at: new Date().toISOString()
          })
          .eq("id", orderId);

        // Restituir inventario del artículo reembolsado (SOLO si antes de despacho y si efectivamente hubo unidades devueltas/canceladas)
        if (!hasDispatchedShipment && !hasLabelCreatedShipment && effectiveRefundQty > 0 && restoreStock) {
          const qtyToRestore = effectiveRefundQty;
          if (targetOrderItem.variant_id) {
            const { data: v } = await supabaseAdmin.from('product_variants').select('inventory_count').eq('id', targetOrderItem.variant_id).single();
            if (v) {
              await supabaseAdmin.from('product_variants').update({ inventory_count: (v.inventory_count || 0) + qtyToRestore }).eq('id', targetOrderItem.variant_id);
            }
          }
          if (targetOrderItem.vendor_id && targetOrderItem.product_id && targetOrderItem.variant_id) {
            const { data: vp } = await supabaseAdmin
              .from("vendor_products")
              .select("id")
              .eq("vendor_id", targetOrderItem.vendor_id)
              .eq("product_id", targetOrderItem.product_id)
              .maybeSingle();
            if (vp) {
              const { data: vpv } = await supabaseAdmin
                .from("vendor_product_variants")
                .select("inventory_count")
                .eq("vendor_product_id", vp.id)
                .eq("variant_id", targetOrderItem.variant_id)
                .maybeSingle();
              if (vpv) {
                await supabaseAdmin
                  .from("vendor_product_variants")
                  .update({ inventory_count: (vpv.inventory_count || 0) + qtyToRestore })
                  .eq("vendor_product_id", vp.id)
                  .eq("variant_id", targetOrderItem.variant_id);
              }
            }
          }
        }
      } else if (suborderId) {
        // Partial Suborder refund
        await supabaseAdmin
          .from("order_suborders")
          .update({
            status: "refunded",
            liquidation_status: bypassLiquidationCheck ? "paid" : "cancelled", // Keep paid if bypassed to preserve accountant history
            updated_at: new Date().toISOString()
          })
          .eq("id", suborderId);

        // Check if all/some suborders are now refunded/cancelled
        const { data: updatedSubs } = await supabaseAdmin
          .from("order_suborders")
          .select("status")
          .eq("parent_order_id", orderId);

        const allCancelledOrRefunded = updatedSubs && updatedSubs.every((s: any) => s.status === 'cancelled' || s.status === 'refunded');
        const anyCancelledOrRefunded = updatedSubs && updatedSubs.some((s: any) => s.status === 'cancelled' || s.status === 'refunded');

        let nextOrderStatus = order.status;
        if (allCancelledOrRefunded) {
          nextOrderStatus = "refunded";
        } else if (anyCancelledOrRefunded) {
          nextOrderStatus = "partially_refunded";
        }

        await supabaseAdmin
          .from("orders")
          .update({
            payment_status: allCancelledOrRefunded ? "refunded" : "partially_refunded",
            status: nextOrderStatus,
            delivery_notes: order.delivery_notes ? `${order.delivery_notes}\n[Refund Parcial] Suborden ${targetSuborder?.suborder_number || ''} reembolsada.` : `[Refund Parcial] Suborden ${targetSuborder?.suborder_number || ''} reembolsada.`,
            updated_at: new Date().toISOString()
          })
          .eq("id", orderId);

        // Restore Stock for Suborder Items ONLY if BEFORE dispatch (Fase 3)
        const restoredProductIds: string[] = [];

        if (!hasDispatchedShipment && !hasLabelCreatedShipment) {
          const { data: subItems } = await supabaseAdmin
            .from("order_items")
            .select("*")
            .eq("suborder_id", suborderId);

          if (subItems) {
            for (const item of subItems) {
              if (item.product_id) {
                restoredProductIds.push(item.product_id);
              }
              if (item.variant_id) {
                const { data: v } = await supabaseAdmin.from('product_variants').select('inventory_count').eq('id', item.variant_id).single();
                if (v) {
                  await supabaseAdmin.from('product_variants').update({ inventory_count: (v.inventory_count || 0) + item.quantity }).eq('id', item.variant_id);
                }

                // Also update vendor_product_variants
                if (item.vendor_id && item.product_id) {
                  const { data: vp } = await supabaseAdmin
                    .from("vendor_products")
                    .select("id")
                    .eq("vendor_id", item.vendor_id)
                    .eq("product_id", item.product_id)
                    .maybeSingle();
                  if (vp) {
                    const { data: vpv } = await supabaseAdmin
                      .from("vendor_product_variants")
                      .select("inventory_count")
                      .eq("vendor_product_id", vp.id)
                      .eq("variant_id", item.variant_id)
                      .maybeSingle();
                    if (vpv) {
                      await supabaseAdmin
                        .from("vendor_product_variants")
                        .update({ inventory_count: (vpv.inventory_count || 0) + item.quantity })
                        .eq("vendor_product_id", vp.id)
                        .eq("variant_id", item.variant_id);
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        // Full Order Refund
        await supabaseAdmin
          .from("order_suborders")
          .update({
            status: "refunded",
            liquidation_status: bypassLiquidationCheck ? "paid" : "cancelled",
            updated_at: new Date().toISOString()
          })
          .eq("parent_order_id", orderId);

        const cancelNote = `Cancelada: ${reason || 'Sin razón'}. Reembolso total procesado exitosamente.`;
        await supabaseAdmin
          .from("orders")
          .update({
            status: "refunded",
            payment_status: "refunded",
            delivery_notes: order.delivery_notes ? `${order.delivery_notes}\n${cancelNote}` : cancelNote,
            updated_at: new Date().toISOString()
          })
          .eq("id", orderId);

        // Restore Stock for all items ONLY if BEFORE dispatch (Fase 3)
        if (!hasDispatchedShipment && !hasLabelCreatedShipment) {
          const { data: orderItems } = await supabaseAdmin
            .from("order_items")
            .select("*")
            .eq("order_id", orderId);

          if (orderItems) {
            for (const item of orderItems) {
              if (item.product_id) {
                restoredProductIds.push(item.product_id);
              }
              if (item.variant_id) {
                const { data: v } = await supabaseAdmin.from('product_variants').select('inventory_count').eq('id', item.variant_id).single();
                if (v) {
                  await supabaseAdmin.from('product_variants').update({ inventory_count: (v.inventory_count || 0) + item.quantity }).eq('id', item.variant_id);
                }

                // Also update vendor_product_variants
                if (item.vendor_id && item.product_id) {
                  const { data: vp } = await supabaseAdmin
                    .from("vendor_products")
                    .select("id")
                    .eq("vendor_id", item.vendor_id)
                    .eq("product_id", item.product_id)
                    .maybeSingle();
                  if (vp) {
                    const { data: vpv } = await supabaseAdmin
                      .from("vendor_product_variants")
                      .select("inventory_count")
                      .eq("vendor_product_id", vp.id)
                      .eq("variant_id", item.variant_id)
                      .maybeSingle();
                    if (vpv) {
                      await supabaseAdmin
                        .from("vendor_product_variants")
                        .update({ inventory_count: (vpv.inventory_count || 0) + item.quantity })
                        .eq("vendor_product_id", vp.id)
                        .eq("variant_id", item.variant_id);
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Sincronización comercial no bloqueante de stock restaurado hacia Cloudflare D1
      if (restoredProductIds.length > 0) {
        const uniqueRestoredIds = Array.from(new Set(restoredProductIds.filter(Boolean)));
        if (uniqueRestoredIds.length > 0) {
          const syncPromise = syncProductsToCloudflareD1(uniqueRestoredIds, supabaseAdmin, {
            eventType: 'order_refunded',
            useOutbox: false,
          }).catch((err) => {
            console.warn('[D1-Sync-Refund] Error no-bloqueante al sincronizar stock reembolsado:', err?.message || err);
          });

          if (typeof (globalThis as any).EdgeRuntime?.waitUntil === 'function') {
            (globalThis as any).EdgeRuntime.waitUntil(syncPromise);
          }
        }
      }

      // Send Completion emails/WhatsApp
      if (order.customer_email) {
        // Client completed notification
        await fetch(supabaseUrl + "/functions/v1/transactional-emails", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            type: 'client_refund_completed',
            email: order.customer_email,
            phone: order.customer_phone,
            order_number: order.order_number,
            amount: refundAmount.toFixed(2)
          })
        }).catch(e => console.error("Error sending client refund completed email:", e));

        // Vendor refund applied notification
        if (vendorId) {
          const { data: vendorUser } = await supabaseAdmin
            .from("vendors")
            .select("contact_email, store_name")
            .eq("id", vendorId)
            .maybeSingle();
          if (vendorUser?.contact_email) {
            await fetch(supabaseUrl + "/functions/v1/transactional-emails", {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                type: 'vendor_refund_applied',
                email: vendorUser.contact_email,
                store_name: vendorUser.store_name,
                order_number: order.order_number,
                amount: refundAmount.toFixed(2)
              })
            }).catch(e => console.error("Error sending vendor email:", e));
          }
        }
      }

      // Send Refund event to Meta CAPI
      try {
        await fetch(supabaseUrl + "/functions/v1/meta-capi", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            event_name: 'Refund',
            event_id: `refund-${dbRefund.id}`,
            event_source_url: 'https://collectibles.uy/admin/refunds',
            user_data: {
              email: order.customer_email,
              phone: order.customer_phone,
              first_name: order.customer_name?.split(' ')[0],
              last_name: order.customer_name?.split(' ').slice(1).join(' ')
            },
            custom_data: {
              value: refundAmount,
              currency: order.currency || 'UYU',
              order_id: orderId,
              suborder_id: suborderId || null,
              reason: reason || 'Refund'
            }
          })
        });
      } catch (e: any) {
        console.warn("[Analytics] Meta CAPI call failed:", e.message);
      }

      return new Response(JSON.stringify({ success: true, refundSuccess: true, refundDetails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } else if (isManualRefundRequired) {
      // B. MANUAL REVERSAL RECORD (PENDING STATE)
      const { data: dbRefund, error: refundInsertErr } = await supabaseAdmin
        .from("refunds")
        .insert({
          order_id: orderId,
          suborder_id: suborderId || null,
          vendor_id: vendorId,
          payment_id: paymentIdUuid,
          provider: order.payment_method,
          amount: refundAmount,
          reason: reason || "Reembolso manual pendiente de confirmación",
          status: "manual_refund_required",
          requested_by: requestedBy,
          api_response: {
            ...refundDetails,
            idempotency_key: idempotencyKey || undefined
          }
        })
        .select("id")
        .single();

      if (refundInsertErr) throw refundInsertErr;

      // Log in payment_audit_logs
      await supabaseAdmin.from("payment_audit_logs").insert({
        user_id: requestedBy,
        action: suborderId ? "partial_refund_pending_manual" : "full_refund_pending_manual",
        order_id: orderId,
        suborder_id: suborderId || null,
        payment_id: paymentIdUuid,
        refund_id: dbRefund.id,
        provider: order.payment_method,
        amount: refundAmount,
        api_response: refundDetails,
        ip_address: clientIp
      });

      // Update payments table to manual_refund_required
      if (paymentIdUuid) {
        await supabaseAdmin
          .from("payments")
          .update({
            status: "manual_refund_required",
            updated_at: new Date().toISOString()
          })
          .eq("id", paymentIdUuid);
      }

      // Create manual refund task in manual_refund_tasks table
      const { error: taskErr } = await supabaseAdmin
        .from("manual_refund_tasks")
        .insert({
          order_id: orderId,
          payment_provider: order.payment_method,
          payment_id: order.payment_id || 'UNKNOWN',
          amount: refundAmount,
          currency: order.currency || 'UYU',
          reason: reason || 'Reembolso manual requerido',
          status: 'pending',
          assigned_to: null,
          note: reason || 'Reembolso manual requerido'
        });

      if (taskErr) {
        console.error("Error creating manual_refund_task:", taskErr);
      }

      // Update orders and order_suborders to refund_pending_manual
      if (suborderId) {
        await supabaseAdmin
          .from("order_suborders")
          .update({
            status: "refund_pending_manual",
            updated_at: new Date().toISOString()
          })
          .eq("id", suborderId);
      } else {
        await supabaseAdmin
          .from("order_suborders")
          .update({
            status: "refund_pending_manual",
            updated_at: new Date().toISOString()
          })
          .eq("parent_order_id", orderId);
      }

      await supabaseAdmin
        .from("orders")
        .update({
          status: "refund_pending_manual",
          updated_at: new Date().toISOString()
        })
        .eq("id", orderId);

      // Send Admin Notification (manual required)
      await fetch(supabaseUrl + "/functions/v1/transactional-emails", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          type: 'admin_refund_manual_required',
          order_number: order.order_number,
          amount: refundAmount.toFixed(2),
          provider: order.payment_method,
          reason: reason || 'Reembolso manual'
        })
      }).catch(e => console.error("Error sending admin manual notification:", e));

      // Send Client Notification (requested/pending)
      if (order.customer_email) {
        await fetch(supabaseUrl + "/functions/v1/transactional-emails", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            type: 'client_refund_requested',
            email: order.customer_email,
            phone: order.customer_phone,
            order_number: order.order_number
          })
        }).catch(e => console.error("Error sending client refund requested email:", e));
      }

      return new Response(JSON.stringify({ 
        success: true, 
        refundSuccess: false, 
        manualRequired: true, 
        message: "Esta pasarela requiere devolución manual.", 
        refundDetails 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      throw new Error(refundDetails?.error || "Error al procesar el reembolso en el proveedor");
    }

  } catch (error: any) {
    console.error("refund-order error:", error.message);
    
    // Si el reembolso en la pasarela externa ya fue exitoso (refundSuccess === true),
    // NO marcar el lock como fallido para evitar que reintentos causen un doble reembolso.
    // En su lugar, registrar como 'unknown_gateway_reversal_requires_reconciliation'
    if (processingRefundId) {
      try {
        const nextLockStatus = refundSuccess ? "reconciliation_required" : "failed";
        await supabaseAdmin
          .from("refunds")
          .update({
            status: nextLockStatus,
            api_response: {
              error: error.message,
              external_refund_success: refundSuccess,
              gateway_refund_id: gatewayRefundId,
              requires_manual_reconciliation: refundSuccess,
              failed_at: new Date().toISOString()
            }
          })
          .eq("id", processingRefundId);
      } catch (_) {}
    }

    // Log failure event
    try {
      await supabaseAdmin.from("payment_audit_logs").insert({
        user_id: user?.id && user.id !== 'test_bypass' && user.id !== 'service_role' ? user.id : null,
        action: "refund_failed",
        order_id: orderId || null,
        provider: "error",
        api_response: { error: error.message },
        ip_address: clientIp
      });

      // Send Admin Notification (failed)
      await fetch(supabaseUrl + "/functions/v1/transactional-emails", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          type: 'admin_refund_failed',
          order_number: order?.order_number || 'N/A',
          amount: refundAmount ? refundAmount : 0,
          provider: order?.payment_method || 'error',
          error_msg: error.message
        })
      }).catch(e => console.error("Error sending admin error email:", e));
    } catch (_) {}

    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
