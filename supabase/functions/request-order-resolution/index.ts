import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

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

    // 1. Obtener la orden y validar propiedad o rol admin
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("*, suborders:order_suborders(*)")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Orden no encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Comprobar que pertenece al usuario o es admin
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = profile?.is_admin === true;
    if (order.user_id !== user.id && !isAdmin) {
      return new Response(JSON.stringify({ error: "No tienes permisos sobre esta orden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Determinar modelo comercial y suborden objetivo
    let targetSuborder = null;
    if (suborderId) {
      targetSuborder = order.suborders?.find((s: any) => s.id === suborderId);
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

    // 3. Evaluar lógica específica de Cancelación Inmediata (Fase 1: 10 Minutos)
    if (requestType === "cancel_immediate_10m") {
      if (businessModel !== "collectibles_national") {
        return new Response(JSON.stringify({ error: "La cancelación inmediata de 10m solo aplica a productos nacionales de Collectibles." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Validar ventana de 10 minutos desde el pago confirmado
      const paymentDate = new Date(order.paid_at || order.created_at).getTime();
      const now = Date.now();
      const diffMinutes = (now - paymentDate) / (1000 * 60);

      if (diffMinutes > 10) {
        return new Response(JSON.stringify({ 
          error: "La ventana de cancelación inmediata (10 minutos) ha expirado. Por favor iniciá una solicitud ordinaria de arrepentimiento o reclamo.",
          windowExpired: true 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Validar si ya fue despachado
      const { data: shipments } = await supabaseAdmin
        .from("shipments")
        .select("shipping_status")
        .eq("order_id", orderId);

      const isDispatched = shipments?.some((s: any) => 
        ['in_transit', 'out_for_delivery', 'delivered', 'shipped'].includes(s.shipping_status)
      );

      if (isDispatched) {
        return new Response(JSON.stringify({ error: "El pedido ya fue despachado físicamente. Se requiere devolución ordinaria." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Crear solicitud en estado APPROVED y disparar refund-order
      const { data: requestRecord, error: reqErr } = await supabaseAdmin
        .from("unified_order_requests")
        .insert({
          order_id: orderId,
          suborder_id: targetSuborder?.id || null,
          customer_id: user.id,
          business_model: businessModel,
          request_type: requestType,
          status: "APPROVED",
          amount_requested: order.total_amount,
          amount_approved: order.total_amount,
          currency: order.currency || "UYU",
          reason: reason || "Cancelación inmediata ventana 10 min",
          customer_notes: notes
        })
        .select()
        .single();

      if (reqErr) throw reqErr;

      // Invocar Edge Function refund-order con service role
      const refundRes = await fetch(`${supabaseUrl}/functions/v1/refund-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          orderId,
          suborderId: targetSuborder?.id || null,
          reason: `Cancelación inmediata 10 min por cliente (${user.email || user.id})`
        })
      });

      const refundResult = await refundRes.json();

      return new Response(JSON.stringify({
        success: true,
        message: "Cancelación inmediata procesada con éxito",
        request: requestRecord,
        refund: refundResult
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. Evaluar lógica Internacional Zinc (Fase 3)
    if (businessModel === "collectibles_international" && requestType === "cancel_international_zinc") {
      // Buscar el ítem internacional
      const { data: intlItems } = await supabaseAdmin
        .from("international_order_items")
        .select("*")
        .eq("order_id", orderId);

      const intlItem = intlItems?.[0];
      const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");

      if (!intlItem || !intlItem.zinc_order_id) {
        // Aún no ha sido enviado a Zinc: se puede cancelar internamente
        const { data: reqRecord } = await supabaseAdmin
          .from("unified_order_requests")
          .insert({
            order_id: orderId,
            suborder_id: targetSuborder?.id || null,
            customer_id: user.id,
            business_model: businessModel,
            request_type: requestType,
            status: "APPROVED",
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
          message: "Compra internacional cancelada antes del despacho a proveedor",
          request: reqRecord
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Si ya tiene zinc_order_id, verificar estado en Zinc
      if (['purchased', 'warehouse_received', 'shipped', 'delivered', 'shipped_to_courier'].includes(intlItem.purchase_status)) {
        return new Response(JSON.stringify({ 
          error: "El proveedor internacional (Amazon) ya procesó el envío hacia la casilla en USA. No es posible cancelarlo automáticamente.",
          purchaseStatus: intlItem.purchase_status
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Enviar solicitud de cancelación a Zinc si está en cola o procesando
      if (ZINC_API_KEY && intlItem.zinc_order_id) {
        try {
          const cancelRes = await fetch(`https://api.zinc.com/orders/${intlItem.zinc_order_id}/cancel`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${ZINC_API_KEY}` }
          });
          const cancelData = await cancelRes.json();

          const isZincSuccess = cancelRes.ok && (cancelData.status === 'cancelled' || cancelData.cancelled === true);

          const { data: reqRecord } = await supabaseAdmin
            .from("unified_order_requests")
            .insert({
              order_id: orderId,
              suborder_id: targetSuborder?.id || null,
              customer_id: user.id,
              business_model: businessModel,
              request_type: requestType,
              status: isZincSuccess ? "CANCELLATION_CONFIRMED" : "CANCELLATION_PENDING",
              amount_requested: order.total_amount,
              reason: reason,
              customer_notes: notes,
              zinc_order_id: intlItem.zinc_order_id,
              zinc_cancellation_status: cancelData.status || (isZincSuccess ? 'confirmed' : 'pending'),
              zinc_response_payload: cancelData
            })
            .select()
            .single();

          if (isZincSuccess) {
            await supabaseAdmin.from("international_order_items").update({
              purchase_status: 'cancelled',
              updated_at: new Date().toISOString()
            }).eq("id", intlItem.id);
          }

          return new Response(JSON.stringify({
            success: true,
            zincConfirmed: isZincSuccess,
            message: isZincSuccess 
              ? "Zinc confirmó la cancelación en el proveedor" 
              : "Solicitud enviada a Zinc. Pendiente de verificación por proveedor.",
            request: reqRecord
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });

        } catch (zincErr: any) {
          console.error("Error contactando a Zinc para cancelación:", zincErr);
        }
      }
    }

    // 5. Solicitud general (Vendors Nacionales, Incidencias de Transporte o Casos Ordinarios)
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
      message: "Solicitud registrada con éxito para revisión",
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
