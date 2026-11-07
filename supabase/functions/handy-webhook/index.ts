import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractHandyWebhookData, getFirstValue } from "../_shared/handy.ts";
import { finalizeOrderIfNeeded } from "../_shared/order-payments.ts";

const responseHeaders = {
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: responseHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Webhook processing without undocumented auth headers or token query params.
    // As per Handy Botón de Pago v2.0 Manual, the callback is a server-to-server POST JSON payload.
    // No HMAC signature is provided by Handy. Authentication & security invariants rely on:
    // a) Verification of existing pending transaction initiated from our system (TransactionExternalId).
    // b) Strict Financial Integrity (Amount and Currency match order record).
    // c) Idempotency and anti-tampering verification.


    const rawBody = await req.text();
    let payload: Record<string, any>;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = { raw: rawBody };
    }

    const webhookData = extractHandyWebhookData(payload);
    if (!webhookData.transactionExternalId) {
      console.warn("[Handy Webhook] Missing TransactionExternalId", payload);
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, order_id, status, amount, currency, transaction_external_id")
      .eq("provider", "handy")
      .eq("transaction_external_id", webhookData.transactionExternalId)
      .single();

    if (paymentError || !payment) {
      console.warn("[Handy Webhook] Payment not found", webhookData.transactionExternalId);
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    // Idempotency: If payment was already approved, do not revert to pending/rejected from a stale/out-of-order notification
    if (payment.status === "approved") {
      if (webhookData.mappedStatus === "approved") {
        console.log(`[Handy Webhook] Payment ${payment.id} already approved. Skipping redundant finalization.`);
        return new Response(JSON.stringify({ received: true, already_processed: true }), {
          status: 200,
          headers: responseHeaders,
        });
      } else if (webhookData.mappedStatus !== "refunded") {
        console.warn(`[Handy Webhook] Payment ${payment.id} is already APPROVED. Ignoring stale status '${webhookData.mappedStatus}'.`);
        return new Response(JSON.stringify({ received: true, ignored_stale_status: true }), {
          status: 200,
          headers: responseHeaders,
        });
      }
    }

    // STRICT FINANCIAL INTEGRITY VALIDATION:
    // When Handy reports approved status, require valid PurchaseData.TotalAmount and PurchaseData.Currency.
    // Zero fallbacks to order amounts or default currencies.
    // Compare in minor units (cents / integer comparison) with math rounding.
    let financialValidationPassed = false;
    let financialValidationError: string | null = null;

    if (webhookData.mappedStatus === "approved") {
      const { data: orderRecord } = await supabaseAdmin
        .from("orders")
        .select("total_amount, currency, status, payment_processed_at")
        .eq("id", payment.order_id)
        .single();

      if (!orderRecord) {
        console.error(`🚨 [Handy Webhook] Order ${payment.order_id} not found in database.`);
        return new Response(JSON.stringify({ received: true, error: "Order not found" }), {
          status: 200,
          headers: responseHeaders,
        });
      }

      const receivedAmount = webhookData.totalAmount;
      const receivedCurrency = webhookData.currency;

      if (!Number.isFinite(receivedAmount) || receivedAmount <= 0) {
        financialValidationError = "Missing or invalid PurchaseData.TotalAmount";
        console.error(`🚨 [Handy Webhook] INVALID_AMOUNT for order ${payment.order_id}: received ${receivedAmount}`);
      } else if (!Number.isFinite(receivedCurrency) || (receivedCurrency !== 858 && receivedCurrency !== 840)) {
        financialValidationError = "Missing or invalid PurchaseData.Currency";
        console.error(`🚨 [Handy Webhook] INVALID_CURRENCY for order ${payment.order_id}: received ${receivedCurrency}`);
      } else {
        const expectedCurrency = String(orderRecord.currency || "UYU").toUpperCase();
        const expectedHandyCurrencyCode = expectedCurrency === "USD" ? 840 : 858;

        if (receivedCurrency !== expectedHandyCurrencyCode) {
          financialValidationError = `Currency mismatch: expected ${expectedHandyCurrencyCode}, received ${receivedCurrency}`;
          console.error(`🚨 [Handy Webhook] CURRENCY_MISMATCH for order ${payment.order_id}: ${financialValidationError}`);
        } else {
          // Compare amounts using minor currency units (cents) to avoid IEEE 754 precision issues
          const receivedCents = Math.round(receivedAmount * 100);
          const orderCents = Math.round(Number(orderRecord.total_amount || 0) * 100);

          if (receivedCents !== orderCents) {
            financialValidationError = `Amount mismatch: expected ${orderCents} cents, received ${receivedCents} cents`;
            console.error(`🚨 [Handy Webhook] AMOUNT_MISMATCH for order ${payment.order_id}: ${financialValidationError}`);
          } else {
            financialValidationPassed = true;
          }
        }
      }
    }

    // Check if auto-confirmation is allowed.
    // SECURITY GATE: In Handy Botón de Pago v2.0, Handy does NOT provide an HMAC signature or transaction status query API.
    // Automated auto-confirmation is ONLY permitted if explicit env flag HANDY_AUTO_CONFIRM_ENABLED is set to 'true'.
    // Otherwise, all valid approved notifications are securely registered with reconciliation_status = 'pending_reconciliation'
    // and payment_attempts normalized_status = 'manual_verification_required', requiring administrative verification.
    const autoConfirmEnabled = (Deno.env.get("HANDY_AUTO_CONFIRM_ENABLED") || "false").trim().toLowerCase() === "true";
    const canAutoConfirm = autoConfirmEnabled && financialValidationPassed && webhookData.mappedStatus === "approved";

    // Determine normalized status to persist
    let normalizedAttemptStatus = webhookData.mappedStatus;
    if (webhookData.mappedStatus === "approved") {
      if (!financialValidationPassed) {
        normalizedAttemptStatus = "manual_verification_required";
      } else if (!canAutoConfirm) {
        normalizedAttemptStatus = "manual_verification_required";
      }
    }

    const paymentUpdate: Record<string, any> = {
      status: canAutoConfirm ? "approved" : (webhookData.mappedStatus === "approved" ? "pending" : webhookData.mappedStatus),
      raw_webhook: payload,
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from("payments")
      .update(paymentUpdate)
      .eq("id", payment.id);

    const nowStr = new Date().toISOString();
    const providerEventId = webhookData.providerTransactionId || webhookData.transactionExternalId || `handy-wh-${Date.now()}`;
    const externalPaymentId = (webhookData.instrumentData?.Name && webhookData.instrumentData?.IssuerName)
      ? `${webhookData.instrumentData.IssuerName} ${webhookData.instrumentData.Name}`
      : (webhookData.providerTransactionId || payment.transaction_external_id);

    // Update payment_attempts
    const { data: attempt } = await supabaseAdmin
      .from("payment_attempts")
      .select("id, metadata")
      .eq("order_id", payment.order_id)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attempt) {
      const mergedMetadata = {
        ...(attempt.metadata || {}),
        purchase_data: webhookData.purchaseData,
        instrument_data: webhookData.instrumentData,
        handy_created: webhookData.created,
        financial_validation_passed: financialValidationPassed,
        financial_validation_error: financialValidationError,
        auto_confirm_applied: canAutoConfirm,
      };

      await supabaseAdmin
        .from("payment_attempts")
        .update({
          normalized_status: normalizedAttemptStatus,
          provider_status: webhookData.rawStatus || webhookData.mappedStatus,
          external_payment_id: externalPaymentId,
          metadata: mergedMetadata,
          approved_at: canAutoConfirm ? nowStr : undefined,
          rejected_at: (webhookData.mappedStatus === "rejected" || webhookData.mappedStatus === "failed") ? nowStr : undefined,
          cancelled_at: webhookData.mappedStatus === "cancelled" ? nowStr : undefined,
          expired_at: webhookData.mappedStatus === "expired" ? nowStr : undefined,
          updated_at: nowStr,
        })
        .eq("id", attempt.id);
    }

    // Insert payment_events (Append-Only) with idempotency on provider_event_id + occurred_at
    const { error: eventInsertError } = await supabaseAdmin.from("payment_events").insert({
      order_id: payment.order_id,
      payment_attempt_id: attempt?.id,
      provider: "handy",
      event_type: `webhook_${webhookData.mappedStatus}`,
      normalized_status: normalizedAttemptStatus,
      provider_status: webhookData.rawStatus || webhookData.mappedStatus,
      provider_event_id: providerEventId,
      source: "webhook",
      payload_sanitized: payload,
      processing_result: canAutoConfirm
        ? `Webhook de Handy procesado y aprobado automáticamente.`
        : (financialValidationPassed
            ? `Webhook de Handy recibido. Pendiente de verificación administrativa (confirmación automática inactiva).`
            : `Webhook de Handy rechazado por validación financiera: ${financialValidationError}`),
      occurred_at: nowStr,
    });
    if (eventInsertError) {
      console.warn("[Handy Webhook] Note on payment_event insert:", eventInsertError.message);
    }

    if (canAutoConfirm) {
      await finalizeOrderIfNeeded(
        supabaseAdmin,
        supabaseUrl,
        supabaseServiceKey,
        payment.order_id,
        webhookData.providerTransactionId || webhookData.transactionExternalId,
      );
    } else if (webhookData.mappedStatus === "approved") {
      // Order remains awaiting confirmation / pending_reconciliation
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "pending",
          reconciliation_status: "pending_reconciliation",
          updated_at: nowStr,
        })
        .eq("id", payment.order_id);
    } else if (webhookData.mappedStatus === "refunded") {
      await supabaseAdmin
        .from("orders")
        .update({
          status: "cancelada",
          payment_status: "refunded",
          updated_at: nowStr,
        })
        .eq("id", payment.order_id);

      await supabaseAdmin
        .from("order_suborders")
        .update({
          status: "refunded",
          liquidation_status: "cancelled",
          updated_at: nowStr,
        })
        .eq("parent_order_id", payment.order_id)
        .neq("liquidation_status", "paid");

      // Register refund in refunds if not exists
      const { data: existingRefund } = await supabaseAdmin
        .from("refunds")
        .select("id")
        .eq("order_id", payment.order_id)
        .eq("status", "completed")
        .maybeSingle();

      if (!existingRefund) {
        await supabaseAdmin.from("refunds").insert({
          order_id: payment.order_id,
          payment_id: payment.id,
          provider: "handy",
          amount: payment.amount || 0,
          reason: "Reembolso notificado por webhook de Handy",
          status: "completed",
          processed_at: nowStr,
          api_response: payload
        });
      }
    } else {
      let orderPaymentStatus = webhookData.mappedStatus;
      let orderStatus = "awaiting_payment";

      if (webhookData.mappedStatus === "pending") {
        orderPaymentStatus = "pending";
        orderStatus = "awaiting_payment";
      } else if (webhookData.mappedStatus === "cancelled") {
        orderPaymentStatus = "cancelled";
        orderStatus = "cancelled";
      } else if (webhookData.mappedStatus === "rejected" || webhookData.mappedStatus === "failed") {
        orderPaymentStatus = "rejected";
        orderStatus = "awaiting_payment"; // allow retry
      }

      await supabaseAdmin
        .from("orders")
        .update({
          status: orderStatus,
          payment_status: orderPaymentStatus,
          updated_at: nowStr,
        })
        .eq("id", payment.order_id);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("handy-webhook error:", error);
    return new Response(JSON.stringify({ received: false, error: error?.message || "Internal webhook error" }), {
      status: 500,
      headers: responseHeaders,
    });
  }
});
