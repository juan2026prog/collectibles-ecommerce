import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { verifyOptionalAuth } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getGuestTokenSecret, verifyOrderAccessToken } from "../_shared/order-token.ts";

// This endpoint only requests a cancellation. It NEVER refunds a payment or cancels a Zinc purchase.
Deno.serve(async (req: Request) => {
  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers });
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const url = Deno.env.get("SUPABASE_URL") || "";
    if (!serviceKey || !url) throw new Error("SERVER_NOT_CONFIGURED");
    const db = createClient(url, serviceKey);
    const user = await verifyOptionalAuth(req);
    const { order_id, order_token, reason } = await req.json();
    if (typeof order_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(order_id)) return new Response(JSON.stringify({ error: "INVALID_ORDER" }), { status: 400, headers });
    if (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 1000) return new Response(JSON.stringify({ error: "INVALID_REASON" }), { status: 400, headers });
    const { data: order, error } = await db.from("orders").select("id,customer_id,is_international,payment_method,status,payment_status").eq("id", order_id).maybeSingle();
    if (error || !order) return new Response(JSON.stringify({ error: "ORDER_NOT_FOUND" }), { status: 404, headers });
    const permitted = order.customer_id
      ? Boolean(user && user.id === order.customer_id)
      : await verifyOrderAccessToken(order_token, order_id, await getGuestTokenSecret(serviceKey));
    if (!permitted) return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 403, headers });
    if (order.is_international !== true || order.payment_method !== "dlocalgo") return new Response(JSON.stringify({ error: "NOT_INTERNATIONAL_DLOCAL_ORDER" }), { status: 409, headers });
    if (["refunded","cancelled","cancelada"].includes(String(order.status).toLowerCase()) || order.payment_status === "refunded") return new Response(JSON.stringify({ error: "ORDER_ALREADY_CLOSED" }), { status: 409, headers });
    const { data: existing, error: existingError } = await db.from("international_cancellation_requests").select("id,status").eq("order_id", order_id).not("status","in",'("rejected","refunded")').maybeSingle();
    if (existingError) throw existingError;
    if (existing) return new Response(JSON.stringify({ success: true, request_id: existing.id, status: existing.status, already_requested: true }), { headers });
    const { data, error: insertError } = await db.from("international_cancellation_requests").insert({ order_id, requester_id: user?.id || null, reason: reason.trim(), status: "pending_review" }).select("id,status").single();
    if (insertError?.code === "23505") return new Response(JSON.stringify({ error: "REQUEST_ALREADY_EXISTS" }), { status: 409, headers });
    if (insertError || !data) throw insertError || new Error("CANCELLATION_REQUEST_FAILED");
    return new Response(JSON.stringify({ success: true, request_id: data.id, status: data.status, message: "Solicitud recibida. No se ha cancelado la compra en Zinc ni reembolsado el pago." }), { status: 201, headers });
  } catch (error) {
    console.error("Cancellation request failed", error);
    return new Response(JSON.stringify({ error: "CANCELLATION_REQUEST_FAILED" }), { status: 500, headers });
  }
});
