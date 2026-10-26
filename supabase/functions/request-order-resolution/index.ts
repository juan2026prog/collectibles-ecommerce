import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

/**
 * request-order-resolution
 * Motor unificado de Cancelaciones, Devoluciones y Reclamaciones.
 * Modelos contemplados:
 * 1. Collectibles Nacional: ventana de cancelación inmediata 10 min tras pago confirmado.
 * 2. Vendors Nacionales: según políticas configuradas por cada vendor (mínimos legales respetados).
 * 3. Collectibles Internacional: cancelación basada en confirmación Zinc 2.0 (HTTP 204).
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

    let businessModel = "collectibles_national";
    if (targetSuborder) {
      if (targetSuborder.is_international) {
        businessModel = "collectibles_international";
      } else if (!targetSuborder.is_collectibles_order && targetSuborder.vendor_id) {
        businessModel = "vendor_national";
      }
    } else if (order.is_international) {
      businessModel = "collectibles_international";
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

      // A. Registrar solicitud en estado inicial CANCELLATION_PENDING (No APPROVED antes del reembolso)
      const idempotencyKey = `cancel-10m-${orderId}-${Date.now()}`;
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
          idempotency_key: idempotencyKey
        })
        .select()
        .single();

      if (reqInsertErr) throw reqInsertErr;

      // B. Invocar refund-order para procesar la reversión idempotente
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
          idempotencyKey
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
        // Falló la reversión en la pasarela: marcar como REFUND_FAILED / UNDER_REVIEW para no dar falsa confirmación
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

    // 4. CANCELACIÓN INTERNACIONAL ZINC 2.0 (POST /orders/{order_id}/cancel -> HTTP 204)
    if (businessModel === "collectibles_international" && requestType === "cancel_international_zinc") {
      const { data: intlItems, error: intlErr } = await supabaseAdmin
        .from("international_order_items")
        .select("*")
        .eq("order_id", orderId);

      if (intlErr || !intlItems || intlItems.length === 0) {
        return new Response(JSON.stringify({ error: "No se encontraron ítems internacionales para esta orden." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Si ningún ítem ha sido enviado a Zinc todavía (todos pending_purchase): cancelar en outbox local
      const anySentToZinc = intlItems.some((item: any) => item.zinc_order_id);

      if (!anySentToZinc) {
        // Bloquear de forma transaccional cancelando compras pendientes
        await supabaseAdmin
          .from("international_order_items")
          .update({
            purchase_status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq("order_id", orderId);

        const { data: intlReq } = await supabaseAdmin
          .from("unified_order_requests")
          .insert({
            order_id: orderId,
            suborder_id: targetSuborder?.id || null,
            customer_id: user.id,
            business_model: businessModel,
            request_type: requestType,
            status: "CANCELLATION_CONFIRMED",
            amount_requested: order.total_amount,
            amount_approved: order.total_amount,
            currency: order.currency || "UYU",
            reason: reason,
            customer_notes: notes
          })
          .select()
          .single();

        return new Response(JSON.stringify({
          success: true,
          zincConfirmed: true,
          message: "Compra internacional cancelada con éxito antes de ser enviada al proveedor exterior.",
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
          // Zinc 2.0: POST https://api.zinc.com/orders/{order_id}/cancel
          // Respuesta exitosa documentada oficial: HTTP 204 No Content (Sin JSON body)
          const cancelRes = await fetch(`https://api.zinc.com/orders/${item.zinc_order_id}/cancel`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${ZINC_API_KEY}`
            }
          });

          if (cancelRes.status === 204) {
            // Confirmación auténtica Zinc 2.0
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
          customer_id: user.id,
          business_model: businessModel,
          request_type: requestType,
          status: finalZincStatus,
          amount_requested: order.total_amount,
          reason: reason,
          customer_notes: notes,
          zinc_order_id: intlItems.map((i: any) => i.zinc_order_id).filter(Boolean).join(", "),
          zinc_cancellation_status: allZincCancelled ? '204_confirmed' : 'pending_manual_review',
          zinc_response_payload: { results: cancellationResults }
        })
        .select()
        .single();

      return new Response(JSON.stringify({
        success: allZincCancelled,
        zincConfirmed: allZincCancelled,
        message: allZincCancelled 
          ? "Zinc 2.0 confirmó la cancelación (HTTP 204 No Content). Compra detenida en proveedor."
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
        evidence_images: Array.isArray(evidenceImages) ? evidenceImages : []
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
