import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyOptionalAuth } from "../_shared/auth.ts";
import { getHandyProviderConfig } from "../_shared/handy.ts";
import { finalizeOrderIfNeeded } from "../_shared/order-payments.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const user = await verifyOptionalAuth(req);
    if (!user) {
      throw new Error("No autenticado.");
    }

    // Verify admin via profile or user_roles
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    let isAdmin = Boolean(profile?.is_admin);
    if (!isAdmin) {
      const { data: userRole } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["god_admin", "admin", "super_admin"])
        .maybeSingle();
      if (userRole) isAdmin = true;
    }

    if (!isAdmin) {
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

    const provider = String(order.payment_provider || order.payment_method || "").toLowerCase().trim();
    let externalStatus = "unknown";
    let externalStatusDetail = "";
    let rawApiResponse: any = {};
    let normalizedStatus = order.payment_status || "unknown_legacy";
    let confirmedPaymentId: string | undefined = undefined;

    if (provider === "mercadopago") {
      let mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
      if (!mpToken) {
        const { data: settings } = await supabaseAdmin.from("site_settings").select("key, value");
        const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));
        mpToken = config.payments_mercadopago_access_token;
      }

      if (mpToken && !mpToken.includes("mock")) {
        let paymentFound = false;

        // 1. Try by direct payment ID if numeric
        const paymentId = order.payment_id;
        if (paymentId && /^\d+$/.test(paymentId)) {
          try {
            const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
              headers: { Authorization: `Bearer ${mpToken}` },
            });
            if (resp.ok) {
              rawApiResponse = await resp.json();
              externalStatus = rawApiResponse.status || "unknown";
              externalStatusDetail = rawApiResponse.status_detail || "";
              confirmedPaymentId = String(rawApiResponse.id || paymentId);
              paymentFound = true;
            }
          } catch (err: any) {
            console.error("[Reconciliation] MP direct payment lookup error:", err);
          }
        }

        // 2. Try by external_reference search if not found
        if (!paymentFound) {
          try {
            const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${order_id}&sort=date_created&criteria=desc`;
            const searchRes = await fetch(searchUrl, {
              headers: { Authorization: `Bearer ${mpToken}` },
            });
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              if (searchData.results && searchData.results.length > 0) {
                rawApiResponse = searchData.results[0];
                externalStatus = rawApiResponse.status || "unknown";
                externalStatusDetail = rawApiResponse.status_detail || "";
                confirmedPaymentId = String(rawApiResponse.id);
                paymentFound = true;
              }
            }
          } catch (err: any) {
            console.error("[Reconciliation] MP search payment error:", err);
          }
        }

        if (paymentFound) {
          const { data: norm } = await supabaseAdmin.rpc("normalize_payment_status", {
            p_provider: "mercadopago",
            p_provider_status: externalStatus,
            p_status_detail: externalStatusDetail,
          });
          normalizedStatus = norm || externalStatus;
        }
      }
    } else if (provider === "handy") {
      try {
        const { data: effStatus } = await supabaseAdmin.rpc("get_effective_payment_status", {
          p_order_id: order_id,
        });

        if (effStatus) {
          normalizedStatus = effStatus.normalized_status || normalizedStatus;
          externalStatus = effStatus.evidence_source || "reconciliation";
          externalStatusDetail = effStatus.reason || "";
          rawApiResponse = effStatus;
        }
      } catch (err: any) {
        console.error("[Reconciliation] Handy query error:", err);
      }
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
    if (normalizedStatus === "approved") {
      try {
        await finalizeOrderIfNeeded(
          supabaseAdmin,
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
          order.id,
          confirmedPaymentId || order.payment_id
        );
      } catch (finErr: any) {
        console.error("[Reconciliation] finalizeOrderIfNeeded error:", finErr);
      }
    } else {
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: normalizedStatus,
          last_reconciled_at: nowStr,
          reconciliation_status: "reconciled",
          last_payment_attempt_id: attemptId,
          updated_at: nowStr,
        })
        .eq("id", order.id);
    }

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
