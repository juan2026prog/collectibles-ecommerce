import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

/**
 * request-order-resolution
 * Motor unificado de Cancelaciones, Devoluciones y Reclamaciones.
 * Modelos contemplados:
 * 1. Collectibles Nacional: ventana de cancelación inmediata 10 min tras pago confirmado.
 * 2. Vendors Nacionales: según políticas configuradas por cada vendor (mínimos legales respetados).
 * 3. Collectibles Internacional: cancelación basada en confirmación Zinc 2.0 (HTTP 204) coordinada con el outbox worker.
 */

Deno.serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Sesión inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const payload = await req.json();
    const {
      orderId,
      suborderId,
      orderItemId,
      requestType,
      reason,
      notes,
      evidenceImages = []
    } = payload;

    if (!orderId || !requestType || !reason) {
      return new Response(JSON.stringify({ error: "Faltan parámetros requeridos (orderId, requestType, reason)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Obtener orden, subórdenes, pagos y verificar identidad auténtica
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        suborders:order_suborders(*),
        payments:payments(*)
      `)
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Orden no encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verificar identidad server-side (customer_id o user_id o admin)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = profile?.is_admin === true;
    const isOwner = (order.customer_id === user.id) || (order.user_id === user.id);

    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: "No tienes permisos sobre esta orden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Determinar suborden y modelo comercial
    let targetSuborder: any = null;
    if (suborderId) {
      targetSuborder = order.suborders?.find((s: any) => s.id === suborderId);
      if (!targetSuborder) {
        return new Response(JSON.stringify({ error: "Suborden especificada no encontrada en la orden" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    } else if (order.suborders?.length === 1) {
      targetSuborder = order.suborders[0];
    }

    // Comprobar si los order_items seleccionados o de la suborden son internacionales mediante relaciones
    let itemsQueryForIntlCheck = supabaseAdmin
      .from("order_items")
      .select("id, suborder_id, product_id")
      .eq("order_id", orderId);

    if (orderItemId) {
      itemsQueryForIntlCheck = itemsQueryForIntlCheck.eq("id", orderItemId);
    } else if (targetSuborder?.id) {
      itemsQueryForIntlCheck = itemsQueryForIntlCheck.eq("suborder_id", targetSuborder.id);
    }

    const { data: queriedOrderItems } = await itemsQueryForIntlCheck;
    const queriedItemIds = (queriedOrderItems || []).map((i: any) => i.id);

    let hasIntlRelationalRecords = false;
    if (queriedItemIds.length > 0) {
      const { data: intlCheckItems } = await supabaseAdmin
        .from("international_order_items")
        .select("id")
        .in("order_item_id", queriedItemIds);
      hasIntlRelationalRecords = Boolean(intlCheckItems && intlCheckItems.length > 0);
    }

    let businessModel = "collectibles_national";
    if (hasIntlRelationalRecords || targetSuborder?.is_international || (order.is_international && (!targetSuborder || order.suborders?.length === 1))) {
      businessModel = "collectibles_international";
    } else if (targetSuborder) {
      if (!targetSuborder.is_collectibles_order && targetSuborder.vendor_id) {
        businessModel = "vendor_national";
      }
    }

    // IDEMPOTENCY KEY ESTABLE Y DETERMINÍSTICA
    // Formato: cancel-{requestType}-{orderId}-{suborderId || 'all'}-{orderItemId || 'all'}
    const stableIdempotencyKey = `cancel-${requestType}-${orderId}-${suborderId || 'all'}-${orderItemId || 'all'}`;

    // Verificar si ya existe una solicitud activa o procesada con esta clave
    const { data: existingRequest } = await supabaseAdmin
      .from("unified_order_requests")
      .select("*")
      .eq("idempotency_key", stableIdempotencyKey)
      .maybeSingle();

    if (existingRequest) {
      if (['CANCELLATION_PENDING', 'REFUND_PENDING', 'REFUND_PROCESSING'].includes(existingRequest.status)) {
        return new Response(JSON.stringify({
          success: true,
          inProgress: true,
          message: "Ya existe una operación de cancelación en proceso para este pedido.",
          requestId: existingRequest.id,
          status: existingRequest.status
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (['REFUNDED', 'CANCELLATION_CONFIRMED', 'APPROVED'].includes(existingRequest.status)) {
        return new Response(JSON.stringify({
          success: true,
          idempotentReplay: true,
          message: "Esta solicitud ya fue confirmada y procesada previamente.",
          requestId: existingRequest.id,
          status: existingRequest.status
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 3. CANCELACIÓN NACIONAL INMEDIATA (10 MINUTOS TRAS PAGO REAL)
    if (requestType === "cancel_immediate_10m") {
      if (businessModel !== "collectibles_national") {
        return new Response(JSON.stringify({ error: "La cancelación inmediata de 10m solo aplica a productos nacionales de Collectibles." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Validar fecha real de pago comprobada
      const approvedPayment = order.payments?.find((p: any) => p.status === 'approved');
      const realPaymentDateStr = approvedPayment?.created_at || order.paid_at;

      if (!realPaymentDateStr) {
        return new Response(JSON.stringify({ error: "La orden no cuenta con pago confirmado verificable para cancelación inmediata." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const paymentTimestamp = new Date(realPaymentDateStr).getTime();
      const diffMinutes = (Date.now() - paymentTimestamp) / (1000 * 60);

      if (diffMinutes > 10) {
        return new Response(JSON.stringify({ 
          error: "La ventana de cancelación inmediata (10 minutos desde el pago confirmado) ha expirado. Podés solicitar una devolución ordinaria o arrepentimiento legal.",
          windowExpired: true 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Validar si el paquete ya fue despachado físicamente
      const { data: shipments } = await supabaseAdmin
        .from("shipments")
        .select("shipping_status")
        .eq("order_id", orderId);

      const isDispatched = shipments?.some((s: any) => 
        ['in_transit', 'out_for_delivery', 'delivered', 'shipped'].includes(s.shipping_status)
      );

      if (isDispatched) {
        return new Response(JSON.stringify({ error: "El paquete ya fue despachado físicamente. Se requiere devolución ordinaria con flete de retorno." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // A. Registrar solicitud en estado inicial CANCELLATION_PENDING (Con stableIdempotencyKey)
      const { data: pendingReq, error: reqInsertErr } = await supabaseAdmin
        .from("unified_order_requests")
        .insert({
          order_id: orderId,
          suborder_id: targetSuborder?.id || null,
          customer_id: user.id,
          business_model: businessModel,
          request_type: requestType,
          status: "CANCELLATION_PENDING",
          amount_requested: order.total_amount,
          amount_approved: 0.00,
          currency: order.currency || "UYU",
          reason: reason || "Cancelación inmediata comercial 10 min",
          customer_notes: notes,
          idempotency_key: stableIdempotencyKey
        })
        .select()
        .single();

      if (reqInsertErr) throw reqInsertErr;

      // B. Invocar refund-order pasando el stableIdempotencyKey
      const refundRes = await fetch(`${supabaseUrl}/functions/v1/refund-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          orderId,
          suborderId: targetSuborder?.id || null,
          reason: `Cancelación inmediata 10 min cliente (${user.email || user.id})`,
          idempotencyKey: stableIdempotencyKey
        })
      });

      const refundResult = await refundRes.json().catch(() => ({}));

      // C. Confirmar resultado auténtico
      if (refundRes.ok && refundResult.refundSuccess) {
        await supabaseAdmin
          .from("unified_order_requests")
          .update({
            status: "REFUNDED",
            amount_approved: order.total_amount,
            resolved_at: new Date().toISOString(),
            resolved_by: user.id
          })
          .eq("id", pendingReq.id);

        return new Response(JSON.stringify({
          success: true,
          message: "Cancelación y reembolso inmediato procesados con éxito.",
          requestId: pendingReq.id,
          refund: refundResult
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } else {
        // Falló la reversión en la pasarela: marcar como REFUND_FAILED
        await supabaseAdmin
          .from("unified_order_requests")
          .update({
            status: "REFUND_FAILED",
            admin_notes: `Fallo al procesar reembolso automático: ${refundResult.error || 'Error en pasarela'}`
          })
          .eq("id", pendingReq.id);

        return new Response(JSON.stringify({
          success: false,
          error: `No se pudo procesar la devolución automática (${refundResult.error || 'Error en pasarela'}). El pedido pasará a revisión administrativa.`,
          requestId: pendingReq.id
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 4. CANCELACIÓN INTERNACIONAL ZINC 2.0 Y COORDINACIÓN CON OUTBOX WORKER
    if (businessModel === "collectibles_international" && requestType === "cancel_international_zinc") {
      // Obtener los order_items de la orden (filtrados por suborderId y/o orderItemId si fueron especificados)
      let itemsQuery = supabaseAdmin
        .from("order_items")
        .select("id, suborder_id, unit_price, quantity, total_price, final_total")
        .eq("order_id", orderId);

      if (orderItemId) {
        itemsQuery = itemsQuery.eq("id", orderItemId);
      } else if (suborderId) {
        itemsQuery = itemsQuery.eq("suborder_id", suborderId);
      }

      const { data: matchedOrderItems, error: itemsErr } = await itemsQuery;

      if (itemsErr || !matchedOrderItems || matchedOrderItems.length === 0) {
        return new Response(JSON.stringify({ error: "No se encontraron ítems de la orden para cancelar." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const orderItemIds = matchedOrderItems.map((i: any) => i.id);

      // Consultar international_order_items relacionando por order_item_id (NUNCA por order_id inexistente)
      const { data: intlItems, error: intlErr } = await supabaseAdmin
        .from("international_order_items")
        .select("*")
        .in("order_item_id", orderItemIds);

      if (intlErr || !intlItems || intlItems.length === 0) {
        return new Response(JSON.stringify({ error: "No se encontraron registros de compra internacional para los ítems seleccionados." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const intlItemIds = intlItems.map((i: any) => i.id);

      // Calcular monto exacto y aislado correspondiente a los ítems cancelados
      const calculatedRefundAmount = matchedOrderItems.reduce((acc: number, item: any) => {
        const itemVal = Number(item.final_total || item.total_price || (item.unit_price * (item.quantity || 1)));
        return acc + (isNaN(itemVal) ? 0 : itemVal);
      }, 0);

      const targetRefundAmount = calculatedRefundAmount > 0 
        ? calculatedRefundAmount 
        : (targetSuborder ? Number(targetSuborder.product_subtotal || targetSuborder.subtotal) : Number(order.total_amount));

      // Comprobar si algún ítem está en zinc_submitting (envío en curso irreversible por el outbox worker)
      const hasSubmittingItems = intlItems.some((item: any) => item.purchase_status === 'zinc_submitting');

      // Si algún ítem está activamente en zinc_submitting o hay jobs en PROCESSING, fail closed:
      // No cancelar inmediatamente ni reembolsar; pasar a revisión / CANCELLATION_PENDING
      const { data: processingJobs } = await supabaseAdmin
        .from("order_execution_jobs")
        .select("id, status")
        .eq("order_id", orderId)
        .in("job_type", ["zinc_fulfillment", "zinc_purchase", "post_payment_execution"])
        .eq("status", "PROCESSING");

      if (hasSubmittingItems || (processingJobs && processingJobs.length > 0)) {
        const { data: pendingIntlReq } = await supabaseAdmin
          .from("unified_order_requests")
          .insert({
            order_id: orderId,
            suborder_id: targetSuborder?.id || null,
            order_item_id: orderItemId || null,
            customer_id: user.id,
            business_model: businessModel,
            request_type: requestType,
            status: "CANCELLATION_PENDING",
            amount_requested: targetRefundAmount,
            currency: order.currency || "UYU",
            reason: reason,
            customer_notes: notes,
            admin_notes: "Ítem en estado zinc_submitting o worker en ejecución activa. Solicitud enviada a revisión y retención.",
            idempotency_key: stableIdempotencyKey
          })
          .select()
          .single();

        return new Response(JSON.stringify({
          success: false,
          zincConfirmed: false,
          cancellationPending: true,
          message: "La compra se encuentra en proceso activo de comunicación con el proveedor internacional. Su solicitud quedó en revisión para evitar órdenes dobles.",
          request: pendingIntlReq
        }), {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Si ningún ítem ha sido enviado a Zinc todavía (sin zinc_order_id y estados pendientes):
      const anySentToZinc = intlItems.some((item: any) => item.zinc_order_id);

      if (!anySentToZinc) {
        // 1. Coordinar order_execution_jobs:
        // Si la cancelación es de toda la orden o de todos los ítems internacionales pendientes, cancelar el job zinc_fulfillment
        const { data: allOrderItems } = await supabaseAdmin
          .from("order_items")
          .select("id")
          .eq("order_id", orderId);

        const allOrderItemIds = (allOrderItems || []).map((i: any) => i.id);
        const remainingItemIds = allOrderItemIds.filter((id: string) => !orderItemIds.includes(id));

        let hasRemainingIntlItems = false;
        if (remainingItemIds.length > 0) {
          const { data: remainingIntl } = await supabaseAdmin
            .from("international_order_items")
            .select("id")
            .in("order_item_id", remainingItemIds)
            .neq("purchase_status", "cancelled");
          hasRemainingIntlItems = Boolean(remainingIntl && remainingIntl.length > 0);
        }

        // Si NO quedan otros artículos internacionales pendientes, cancelar los jobs a nivel orden
        if (!hasRemainingIntlItems) {
          await supabaseAdmin
            .from("order_execution_jobs")
            .update({
              status: 'CANCELLED',
              last_error: `Cancelado por solicitud del comprador antes de ejecución Zinc (${user.email || user.id})`,
              updated_at: new Date().toISOString()
            })
            .eq("order_id", orderId)
            .in("job_type", ["zinc_fulfillment", "zinc_purchase"])
            .in("status", ["PENDING", "RETRYING", "QUEUED", "WAITING"]);
        } else {
          console.log(`[Resolution] Cancelación parcial de ítem(s): otros artículos internacionales activos continúan en el job zinc_fulfillment.`);
        }

        // 2. Actualizar purchase_status de los ítems internacionales seleccionados a 'cancelled'
        await supabaseAdmin
          .from("international_order_items")
          .update({
            purchase_status: 'cancelled',
            review_reason_code: 'CANCELLED_BEFORE_ZINC_SUBMISSION',
            updated_at: new Date().toISOString()
          })
          .in("id", intlItemIds);

        // Actualizar order_items a status = 'cancelled'
        // NOTA: NO inflar refunded_amount aquí; refunded_amount solo debe incrementarse cuando el reembolso financiero esté confirmado en refund-order
        await supabaseAdmin
          .from("order_items")
          .update({
            status: 'cancelled'
          })
          .in("id", orderItemIds);

        const { data: intlReq } = await supabaseAdmin
          .from("unified_order_requests")
          .insert({
            order_id: orderId,
            suborder_id: targetSuborder?.id || null,
            order_item_id: orderItemId || null,
            customer_id: user.id,
            business_model: businessModel,
            request_type: requestType,
            status: "CANCELLATION_CONFIRMED",
            amount_requested: targetRefundAmount,
            amount_approved: targetRefundAmount,
            currency: order.currency || "UYU",
            reason: reason,
            customer_notes: notes,
            idempotency_key: stableIdempotencyKey
          })
          .select()
          .single();

        // 3. Crear de forma controlada el reembolso aislado al comprador con idempotencia
        let buyerRefundResult: any = null;
        let refundTriggered = false;
        try {
          const refundRes = await fetch(`${supabaseUrl}/functions/v1/refund-order`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              orderId,
              suborderId: targetSuborder?.id || null,
              orderItemId: orderItemId || null,
              amount: targetRefundAmount,
              reason: `Cancelación internacional antes de envío a proveedor (${user.email || user.id})`,
              idempotencyKey: stableIdempotencyKey
            })
          });
          buyerRefundResult = await refundRes.json().catch(() => null);
          if (refundRes.ok && buyerRefundResult?.refundSuccess) {
            refundTriggered = true;
          }
        } catch (rfErr: any) {
          console.error("Error disparando reembolso de comprador tras cancelación internacional local:", rfErr);
        }

        if (refundTriggered) {
          await supabaseAdmin
            .from("unified_order_requests")
            .update({
              status: "REFUNDED",
              resolved_at: new Date().toISOString()
            })
            .eq("id", intlReq.id);
        }

        return new Response(JSON.stringify({
          success: true,
          zincConfirmed: false,
          localCancellationConfirmed: true,
          buyerRefundInitiated: refundTriggered,
          buyerRefundDetails: buyerRefundResult,
          message: refundTriggered 
            ? "Compra internacional cancelada localmente antes de ser enviada al proveedor. Reembolso procesado con éxito."
            : "Compra internacional cancelada localmente antes de ser enviada al proveedor. Reembolso en proceso de verificación.",
          request: intlReq
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Si ya fue enviado a Zinc, verificar que ningún ítem esté en estado irreversible
      const isIrreversible = intlItems.some((item: any) => 
        ['purchased', 'warehouse_received', 'shipped', 'delivered', 'shipped_to_courier', 'delivered_to_courier'].includes(item.purchase_status)
      );

      if (isIrreversible) {
        return new Response(JSON.stringify({
          error: "El proveedor exterior (Amazon) ya procesó o despachó la compra. La cancelación automática está bloqueada según las reglas de Zinc 2.0.",
          zincAllowed: false
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Iterar TODOS los ítems internacionales asociados que tengan zinc_order_id
      const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");
      if (!ZINC_API_KEY) {
        return new Response(JSON.stringify({ error: "ZINC_API_KEY no configurada en el servidor." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let allZincCancelled = true;
      const cancellationResults: any[] = [];

      for (const item of intlItems) {
        if (!item.zinc_order_id) continue;

        try {
          // Zinc 2.0: POST https://api.zinc.com/orders/{order_id}/cancel -> HTTP 204 No Content
          const cancelRes = await fetch(`https://api.zinc.com/orders/${item.zinc_order_id}/cancel`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${ZINC_API_KEY}`
            }
          });

          if (cancelRes.status === 204) {
            await supabaseAdmin
              .from("international_order_items")
              .update({
                purchase_status: 'cancelled',
                review_reason_code: 'ZINC_204_CANCELLED',
                updated_at: new Date().toISOString()
              })
              .eq("id", item.id);

            cancellationResults.push({ zinc_order_id: item.zinc_order_id, status: 204, cancelled: true });
          } else {
            allZincCancelled = false;
            const errText = await cancelRes.text().catch(() => '');
            cancellationResults.push({ zinc_order_id: item.zinc_order_id, status: cancelRes.status, error: errText });
          }
        } catch (fetchErr: any) {
          allZincCancelled = false;
          cancellationResults.push({ zinc_order_id: item.zinc_order_id, error: fetchErr.message });
        }
      }

      const finalZincStatus = allZincCancelled ? "CANCELLATION_CONFIRMED" : "CANCELLATION_PENDING";
      const { data: zincReqRecord } = await supabaseAdmin
        .from("unified_order_requests")
        .insert({
          order_id: orderId,
          suborder_id: targetSuborder?.id || null,
          order_item_id: orderItemId || null,
          customer_id: user.id,
          business_model: businessModel,
          request_type: requestType,
          status: finalZincStatus,
          amount_requested: targetRefundAmount,
          currency: order.currency || "UYU",
          reason: reason,
          customer_notes: notes,
          zinc_order_id: intlItems.map((i: any) => i.zinc_order_id).filter(Boolean).join(", "),
          zinc_cancellation_status: allZincCancelled ? '204_confirmed' : 'pending_manual_review',
          zinc_response_payload: { results: cancellationResults },
          idempotency_key: stableIdempotencyKey
        })
        .select()
        .single();

      // Si Zinc confirmó cancelación total, iniciar formalmente el reembolso de fondos al comprador
      let zincBuyerRefund: any = null;
      let refundTriggeredZinc = false;
      if (allZincCancelled) {
        try {
          const refundRes = await fetch(`${supabaseUrl}/functions/v1/refund-order`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              orderId,
              suborderId: targetSuborder?.id || null,
              orderItemId: orderItemId || null,
              amount: targetRefundAmount,
              reason: `Reembolso por cancelación Zinc 2.0 HTTP 204 confirmada (${user.email || user.id})`,
              idempotencyKey: stableIdempotencyKey
            })
          });
          zincBuyerRefund = await refundRes.json().catch(() => null);
          if (refundRes.ok && zincBuyerRefund?.refundSuccess) {
            refundTriggeredZinc = true;
          }
        } catch (rfErr: any) {
          console.error("Error disparando reembolso tras Zinc 204:", rfErr);
        }

        if (refundTriggeredZinc && zincReqRecord) {
          await supabaseAdmin
            .from("unified_order_requests")
            .update({
              status: "REFUNDED",
              amount_approved: targetRefundAmount,
              resolved_at: new Date().toISOString()
            })
            .eq("id", zincReqRecord.id);
        }
      }

      return new Response(JSON.stringify({
        success: allZincCancelled,
        zincConfirmed: allZincCancelled,
        buyerRefundInitiated: refundTriggeredZinc,
        buyerRefundDetails: zincBuyerRefund,
        message: allZincCancelled 
          ? "Zinc 2.0 confirmó la cancelación (HTTP 204 No Content). Compra detenida en proveedor y reembolso iniciado."
          : "Zinc no pudo cancelar automáticamente alguno de los ítems. Caso derivado a revisión manual.",
        cancellationResults,
        request: zincReqRecord
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 5. SOLICITUD DE VENDOR O CASO GENERAL (Inspección, Arrepentimiento, Transporte dañado)
    const initialStatus = businessModel === "vendor_national" ? "WAITING_VENDOR" : "UNDER_REVIEW";
    const { data: genericRequest, error: genErr } = await supabaseAdmin
      .from("unified_order_requests")
      .insert({
        order_id: orderId,
        suborder_id: targetSuborder?.id || null,
        order_item_id: orderItemId || null,
        vendor_id: targetSuborder?.vendor_id || null,
        customer_id: user.id,
        business_model: businessModel,
        request_type: requestType,
        status: initialStatus,
        amount_requested: targetSuborder ? Number(targetSuborder.product_subtotal) : Number(order.total_amount),
        currency: order.currency || "UYU",
        reason: reason,
        customer_notes: notes,
        evidence_images: Array.isArray(evidenceImages) ? evidenceImages : [],
        idempotency_key: stableIdempotencyKey
      })
      .select()
      .single();

    if (genErr) throw genErr;

    return new Response(JSON.stringify({
      success: true,
      message: "Solicitud registrada con éxito para revisión por el equipo y vendedor.",
      request: genericRequest
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("request-order-resolution error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
