import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { timingSafeEqual } from "../_shared/order-token.ts";
import { enqueueMlSyncEvent } from "../_shared/mercadolibre.ts";
import { triggerZincVerificationIfNeeded } from "../_shared/order-payments.ts";

const responseHeaders = { "Content-Type": "application/json" };

async function createSignature(secretKey: string, xLogin: string, xDate: string, rawBody: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const payload = `${xLogin}${xDate}${rawBody}`;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const bytes = new Uint8Array(signature);
  const binary = Array.from(bytes).map((byte) => String.fromCharCode(byte)).join("");
  return `V2-HMAC-SHA256, Signature: ${btoa(binary)}`;
}

serve(async (req) => {
  try {
    const rawBody = await req.text();
    const dlocalData = JSON.parse(rawBody || "{}");
    const { order_id, status, id: paymentId } = dlocalData;
    if (!order_id) throw new Error("Missing order_id");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: settings } = await supabase.from("site_settings").select("key, value");
    const config = Object.fromEntries((settings || []).map((item: any) => [item.key, item.value]));
    const xLogin = (Deno.env.get("DLOCALGO_X_LOGIN") || config.payments_dlocal_go_x_login || config.payments_dlocal_go_api_key || "").trim();
    const secretKey = (Deno.env.get("DLOCALGO_SECRET_KEY") || config.payments_dlocal_go_secret_key || "").trim();
    const xDate = (req.headers.get("X-Date") || "").trim();
    const authorization = (req.headers.get("Authorization") || "").trim();

    // Mandatory cryptographic signature validation in ALL environments (sandbox & production)
    if (!xLogin || !secretKey) {
      console.error("dLocal webhook signature credentials missing");
      return new Response(JSON.stringify({ error: "Webhook signature credentials are missing" }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    if (!xDate || !authorization) {
      return new Response(JSON.stringify({ error: "Missing webhook authentication headers" }), {
        status: 401,
        headers: responseHeaders,
      });
    }

    const expectedSignature = await createSignature(secretKey, xLogin, xDate, rawBody);
    if (!timingSafeEqual(authorization, expectedSignature)) {
      console.error("Invalid dLocal signature", { xDate });
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: responseHeaders,
      });
    }

    let dbStatus = "pending";
    if (status === "PAID" || status === "APPROVED") dbStatus = "paid";
    if (status === "REJECTED" || status === "CANCELLED") dbStatus = "cancelled";
    if (status === "REFUNDED") dbStatus = "refunded";
    if (status === "CHARGEBACK") dbStatus = "chargeback";

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("status, payment_processed_at")
      .eq("id", order_id)
      .single();

    if (existingOrder?.payment_processed_at && dbStatus === "paid") {
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        headers: responseHeaders,
      });
    }

    if (dbStatus === "refunded") {
      // Revert status and stock
      await supabase
        .from("orders")
        .update({
          status: "cancelada",
          payment_status: "refunded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order_id);

      await supabase
        .from("order_suborders")
        .update({
          status: "refunded",
          liquidation_status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("parent_order_id", order_id)
        .neq("liquidation_status", "paid");

      const { data: dbPayment } = await supabase
        .from("payments")
        .select("id, amount")
        .eq("order_id", order_id)
        .eq("provider", "dlocalgo")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const paymentUuid = dbPayment?.id || null;
      const paymentAmount = dbPayment?.amount || 0;

      if (paymentUuid) {
        await supabase
          .from("payments")
          .update({
            status: "refunded",
            refund_amount: paymentAmount,
            refund_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentUuid);
      }

      // Create refunds record if not exists
      const { data: existingRefund } = await supabase
        .from("refunds")
        .select("id")
        .eq("order_id", order_id)
        .eq("status", "completed")
        .maybeSingle();

      if (!existingRefund) {
        await supabase.from("refunds").insert({
          order_id: order_id,
          payment_id: paymentUuid,
          provider: "dlocalgo",
          amount: paymentAmount,
          reason: "Reembolso notificado por webhook de dLocal Go",
          status: "completed",
          processed_at: new Date().toISOString(),
          api_response: dlocalData
        });
      }

      return new Response(JSON.stringify({ received: true, mappedStatus: dbStatus }), {
        headers: responseHeaders,
      });
    }

    if (dbStatus === "chargeback") {
      await supabase
        .from("orders")
        .update({
          payment_status: "charged_back",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order_id);

      await supabase
        .from("order_suborders")
        .update({
          status: "claim_open",
          updated_at: new Date().toISOString(),
        })
        .eq("parent_order_id", order_id);

      const { data: dbPayment } = await supabase
        .from("payments")
        .select("id, amount")
        .eq("order_id", order_id)
        .eq("provider", "dlocalgo")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const paymentUuid = dbPayment?.id || null;
      const paymentAmount = dbPayment?.amount || 0;

      if (paymentUuid) {
        await supabase
          .from("payments")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentUuid);
      }

      // Create dispute record
      await supabase.from("payment_disputes").insert({
        provider: "dlocalgo",
        payment_id: paymentUuid,
        order_id: order_id,
        dispute_reason: "charged_back",
        status: "open",
        amount: paymentAmount
      });

      return new Response(JSON.stringify({ received: true, mappedStatus: dbStatus }), {
        headers: responseHeaders,
      });
    }

    const updateData: Record<string, any> = {
      status: dbStatus,
      payment_status: dbStatus === "paid" ? "approved" : dbStatus === "cancelled" ? "cancelled" : "pending_payment",
      payment_id: paymentId?.toString() || null,
      updated_at: new Date().toISOString(),
    };
    if (dbStatus === "paid") {
      updateData.payment_processed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", order_id);

    if (error) throw error;

    if (dbStatus === "paid") {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", order_id);

      if (orderItems) {
        for (const item of orderItems) {
          if (item.variant_id) {
            const { error: invErr } = await supabase.rpc("decrement_inventory", {
              p_variant_id: item.variant_id,
              p_quantity: item.quantity,
            });
            if (invErr) {
              console.error("Inventory error:", invErr);
            } else {
              // Enqueue ML stock sync event
              await enqueueMlSyncEvent(supabase, item.variant_id);
            }
          }
        }
      }

      const functionHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      };

      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/calculate-commissions`, {
        method: "POST",
        headers: functionHeaders,
        body: JSON.stringify({ order_id }),
      }).catch((err) => console.error("Error triggering commissions:", err));

      const { data: order } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order_id)
        .single();

      if (order) {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/transactional-emails`, {
          method: "POST",
          headers: functionHeaders,
          body: JSON.stringify({
            type: "UPDATE",
            table: "orders",
            record: order,
            old_record: { ...order, status: "pending" },
          }),
        }).catch((err) => console.error("Error triggering email:", err));

        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/soydelivery-sync`, {
          method: "POST",
          headers: functionHeaders,
          body: JSON.stringify({ order_id }),
        }).catch((err) => console.error("Error triggering SoyDelivery:", err));

        await triggerZincVerificationIfNeeded(
          supabase,
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          order_id
        );
      }
    }

    return new Response(JSON.stringify({ received: true, mappedStatus: dbStatus }), {
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("dLocal Webhook Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
