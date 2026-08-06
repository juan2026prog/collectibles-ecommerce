import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyOptionalAuth } from "../_shared/auth.ts";
import { getHandyProviderConfig } from "../_shared/handy.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const user = await verifyOptionalAuth(req);
    // Verify admin
    if (!user) {
      throw new Error("No autenticado.");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      throw new Error("Se requieren permisos de administrador para ejecutar la conciliación de pagos.");
    }

    const { order_id } = await req.json();
    if (!order_id) {
      throw new Error("Debe proporcionar order_id para conciliar.");
    }

    // Fetch order
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*, payment_attempts(*)")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      throw new Error(`Orden no encontrada: ${order_id}`);
    }

    const provider = LOWER(order.payment_provider || order.payment_method || "");
    let externalStatus = "unknown";
    let externalStatusDetail = "";
    let rawApiResponse: any = {};
    let normalizedStatus = order.payment_status || "unknown_legacy";

    if (provider === "mercadopago") {
      const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
      const paymentId = order.payment_id;

      if (mpToken && paymentId && !paymentId.includes("MOCK") && !mpToken.includes("mock")) {
        try {
          const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${mpToken}` },
          });
          if (resp.ok) {
            rawApiResponse = await resp.json();
            externalStatus = rawApiResponse.status || "unknown";
            externalStatusDetail = rawApiResponse.status_detail || "";

            const { data: norm } = await supabaseAdmin.rpc("normalize_payment_status", {
              p_provider: "mercadopago",
              p_provider_status: externalStatus,
              p_status_detail: externalStatusDetail,
            });
            normalizedStatus = norm || externalStatus;
          }
        } catch (err: any) {
          console.error("[Reconciliation] Mercado Pago API error:", err);
        }
      }
    } else if (provider === "handy") {
      try {
        const handyConfig = await getHandyProviderConfig(supabaseAdmin);
        // Handy reconciliation query if merchant API exists or fallback to database session status
        const { data: py } = await supabaseAdmin
          .from("payments")
          .select("*")
          .eq("order_id", order_id)
          .eq("provider", "handy")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (py) {
          externalStatus = py.status || "redirected";
          rawApiResponse = py.raw_request || {};
          const { data: norm } = await supabaseAdmin.rpc("normalize_payment_status", {
            p_provider: "handy",
            p_provider_status: externalStatus,
          });
          normalizedStatus = norm || externalStatus;
        }
      } catch (err: any) {
        console.error("[Reconciliation] Handy query error:", err);
      }
    }

    function LOWER(s: string) {
      return (s || "").toLowerCase();
    }

    const nowStr = new Date().toISOString();

    // Update existing or latest attempt
    let attemptId: string | null = null;
    const attempts = order.payment_attempts || [];
    attempts.sort((a: any, b: any) => b.attempt_number - a.attempt_number);
    const latestAttempt = attempts[0];

    if (latestAttempt) {
      attemptId = latestAttempt.id;
      await supabaseAdmin
        .from("payment_attempts")
        .update({
          normalized_status: normalizedStatus,
          provider_status: externalStatus,
          provider_status_detail: externalStatusDetail,
          last_checked_at: nowStr,
          updated_at: nowStr,
          metadata: {
            ...latestAttempt.metadata,
            last_reconciliation: {
              reconciled_at: nowStr,
              reconciled_by: user.id,
              raw_response: rawApiResponse,
            },
          },
        })
        .eq("id", attemptId);
    } else {
      // Create attempt
      const { data: newAttempt } = await supabaseAdmin
        .from("payment_attempts")
        .insert({
          order_id: order.id,
          user_id: order.customer_id,
          provider: provider || "unknown",
          attempt_number: 1,
          amount: order.total_amount,
          currency: order.currency || "UYU",
          normalized_status: normalizedStatus,
          provider_status: externalStatus,
          initiated_at: order.created_at,
          last_checked_at: nowStr,
          metadata: {
            reconciled_at: nowStr,
            reconciled_by: user.id,
            raw_response: rawApiResponse,
          },
        })
        .select()
        .single();

      if (newAttempt) attemptId = newAttempt.id;
    }

    // Insert reconciliation event
    await supabaseAdmin.from("payment_events").insert({
      order_id: order.id,
      payment_attempt_id: attemptId,
      provider: provider || "unknown",
      event_type: "gateway_reconciliation",
      normalized_status: normalizedStatus,
      provider_status: externalStatus,
      source: "reconciliation",
      payload_sanitized: {
        reconciled_by: user.id,
        external_status: externalStatus,
        external_status_detail: externalStatusDetail,
      },
      processing_result: `Conciliación ejecutada. Estado normalizado: ${normalizedStatus}`,
      occurred_at: nowStr,
    });

    // Update order status
    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: normalizedStatus,
        status: normalizedStatus === "approved" ? "paid" : order.status,
        last_reconciled_at: nowStr,
        reconciliation_status: "reconciled",
        last_payment_attempt_id: attemptId,
        updated_at: nowStr,
      })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        normalized_status: normalizedStatus,
        provider_status: externalStatus,
        last_reconciled_at: nowStr,
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[Reconciliation Error]", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
