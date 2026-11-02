import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { verifyOptionalAuth } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getGuestTokenSecret, verifyOrderAccessToken } from "../_shared/order-token.ts";

interface OrderStatusRequest {
  order_id: string;
  order_token?: string;
}

/**
 * Read-Only Order Status Endpoint
 * Strictly guarantees ZERO side effects:
 * - No payment finalization
 * - No order mutation
 * - No stock manipulation
 * - Zero suborder/vendor changes
 * - Zero notifications or external API calls
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const user = await verifyOptionalAuth(req);
    const body = (await req.json().catch(() => ({}))) as OrderStatusRequest;
    const { order_id, order_token } = body;

    if (!order_id) {
      return new Response(JSON.stringify({ error: "Missing order_id" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Strictly SELECT order fields (read-only)
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, status, payment_status, total_amount, currency, payment_method, customer_id, customer_email, created_at, payment_processed_at")
      .eq("id", order_id)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Orden no encontrada." }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check authorization: Admin, Logged-in Buyer, or Guest holding valid cryptographic order_token
    let isAdmin = false;
    if (user) {
      const { data: prof } = await supabaseAdmin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (prof?.is_admin) isAdmin = true;
    }

    const isUserMatched = Boolean(user && order.customer_id && user.id === order.customer_id);

    const guestSecret = await getGuestTokenSecret(supabaseServiceRoleKey);
    const isTokenValid = order_token ? await verifyOrderAccessToken(order_token, order_id, guestSecret) : false;

    if (order.customer_id) {
      if (!isAdmin && !isUserMatched && !isTokenValid) {
        return new Response(JSON.stringify({ error: "No tienes permisos para consultar esta orden." }), {
          status: 403,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    } else {
      if (!isAdmin && !isTokenValid) {
        return new Response(JSON.stringify({ error: "Acceso no autorizado: token de acceso inválido o ausente." }), {
          status: 403,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        total_amount: order.total_amount,
        currency: order.currency,
        payment_method: order.payment_method,
        created_at: order.created_at,
        is_paid: order.payment_status === "approved" || ["paid", "confirmed"].includes(order.status)
      }
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Error al consultar estado" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
