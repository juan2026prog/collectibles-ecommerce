import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { resolveZincApiKey } from "../_shared/zinc/index.ts";

const VALID_REASONS = [
  "damaged",
  "not_delivered",
  "empty_box",
  "wrong_item",
  "defective",
  "not_as_described",
  "wrong_size",
  "no_longer_needed",
  "forced_cancellation",
  "other",
];

const ELIGIBLE_MIAMI_STATUSES = [
  "purchased",
  "zinc_order_created",
  "zinc_processing",
  "shipped_to_courier",
  "delivered_to_courier",
];

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const cors = getCorsHeaders(req);

  try {
    const user = await verifyAdmin(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { order_id, international_order_item_id, reason, notes } = await req.json();

    if (!order_id && !international_order_item_id) {
      return new Response(
        JSON.stringify({ error: "order_id o international_order_item_id es requerido." }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (!reason || !VALID_REASONS.includes(reason)) {
      return new Response(
        JSON.stringify({ error: `Motivo de devolución inválido. Motivos válidos: ${VALID_REASONS.join(", ")}` }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch international order item
    let query = supabase.from("international_order_items").select("*, order_items(order_id)");
    if (international_order_item_id) {
      query = query.eq("id", international_order_item_id);
    } else {
      // Find by order_id via order_items
      const { data: orderItems, error: oiErr } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", order_id);

      if (oiErr || !orderItems || orderItems.length === 0) {
        return new Response(
          JSON.stringify({ error: "No se encontraron ítems para esta orden." }),
          { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      const orderItemIds = orderItems.map((oi) => oi.id);
      query = query.in("order_item_id", orderItemIds);
    }

    const { data: currentItems, error: fetchErr } = await query;
    if (fetchErr || !currentItems || currentItems.length === 0) {
      return new Response(
        JSON.stringify({ error: "Ítem de orden internacional no encontrado." }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const currentItem = currentItems[0];
    const resolvedOrderId = order_id || currentItem.order_items?.order_id;

    if (!currentItem.zinc_order_id) {
      return new Response(
        JSON.stringify({ error: "La orden aún no tiene un ID de compra en Zinc." }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 2. Validate Miami casillero boundary rule
    const currentPurchaseStatus = (currentItem.purchase_status || "").trim().toLowerCase();
    if (!ELIGIBLE_MIAMI_STATUSES.includes(currentPurchaseStatus)) {
      return new Response(
        JSON.stringify({
          error: `Devolución no permitida: El paquete se encuentra en estado '${currentPurchaseStatus}'. La devolución solo aplica mientras el paquete está en el casillero de Miami antes del vuelo a Uruguay.`,
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 3. Check for existing open return request
    const { data: existingReturn } = await supabase
      .from("international_return_requests")
      .select("*")
      .eq("zinc_order_id", currentItem.zinc_order_id)
      .in("status", ["open", "approved"])
      .maybeSingle();

    if (existingReturn) {
      return new Response(
        JSON.stringify({
          error: "Ya existe una solicitud de devolución activa para esta orden.",
          return_request: existingReturn,
        }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 4. Resolve Zinc API key
    const env: "sandbox" | "production" = currentItem.zinc_environment === "production" ? "production" : "sandbox";
    const apiKey = await resolveZincApiKey(supabase, env);

    // 5. Inquire order in Zinc to extract internal Zinc order_item_id
    const zincOrderUrl = `https://api.zinc.com/orders/${currentItem.zinc_order_id}`;
    const zincOrderRes = await fetch(zincOrderUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!zincOrderRes.ok) {
      const errText = await zincOrderRes.text();
      return new Response(
        JSON.stringify({ error: `Error al consultar la orden en Zinc (${zincOrderRes.status}): ${errText}` }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const zincOrderData = await zincOrderRes.json();
    const zincOrderItemId = zincOrderData.items?.[0]?.id;

    if (!zincOrderItemId) {
      return new Response(
        JSON.stringify({ error: "No se encontró el order_item_id en el detalle de la orden de Zinc." }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 6. Submit Return Request to Zinc V2 POST /returns
    const returnPayload = {
      order_id: currentItem.zinc_order_id,
      items: [
        {
          order_item_id: zincOrderItemId,
          quantity: 1,
        },
      ],
      reason,
      notes: notes || "Solicitud de devolución en casillero Miami",
    };

    const zincReturnRes = await fetch("https://api.zinc.com/returns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(returnPayload),
    });

    const returnData = await zincReturnRes.json().catch(() => ({}));

    if (!zincReturnRes.ok) {
      const message = returnData.message || returnData.detail || returnData.code || "Error desconocido al crear devolución en Zinc";
      return new Response(
        JSON.stringify({ error: `Zinc API Error (${zincReturnRes.status}): ${message}`, zinc_response: returnData }),
        { status: zincReturnRes.status, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 7. Persist Return Request in Database
    const { data: insertedReturn, error: insertErr } = await supabase
      .from("international_return_requests")
      .insert({
        order_id: resolvedOrderId,
        order_item_id: currentItem.order_item_id,
        international_order_item_id: currentItem.id,
        zinc_order_id: currentItem.zinc_order_id,
        zinc_return_id: returnData.id || null,
        status: returnData.status || "open",
        reason,
        notes: notes || null,
        resolution_notes: returnData.resolution_notes || null,
        label_urls: Array.isArray(returnData.label_urls) ? returnData.label_urls : [],
        merchant_return_id: returnData.merchant_return_id || null,
        zinc_response_payload: returnData,
        created_by: user.id && user.id !== "service_role" ? user.id : null,
      })
      .select("*")
      .single();

    if (insertErr) {
      console.error("[zinc-create-return] Insert error:", insertErr);
      throw insertErr;
    }

    // 8. Update international_order_items status
    await supabase
      .from("international_order_items")
      .update({
        purchase_status: "return_in_progress",
        review_reason_code: "ZINC_RETURN_REQUESTED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentItem.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Solicitud de devolución en Miami creada exitosamente.",
        return_request: insertedReturn,
      }),
      { status: 201, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[zinc-create-return] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error interno del servidor" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
