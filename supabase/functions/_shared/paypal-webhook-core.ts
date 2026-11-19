// supabase/functions/_shared/paypal-webhook-core.ts
// Pure, deterministic PayPal asynchronous webhook parser, state machine,
// merchant/environment guard, and FX/amount reconciliation engine.

export type PayPalWebhookAction =
  | "CAPTURE_AND_FINALIZE"
  | "VERIFY_CAPTURE_AND_FINALIZE"
  | "RECORD_REFUND"
  | "RECORD_DISPUTE_OR_REVERSAL"
  | "RECORD_STATUS_ONLY"
  | "MANUAL_VERIFICATION_REQUIRED"
  | "IGNORE_ALREADY_FINALIZED"
  | "IGNORE_OUT_OF_ORDER"
  | "IGNORE_UNSUPPORTED_EVENT"
  | "DEAD_LETTER";

export interface ParsedPayPalWebhookEvent {
  eventId: string;
  eventType: string;
  createTime: string | null;
  resourceType: string | null;
  resource: Record<string, any>;
  paypalOrderId: string | null;
  captureId: string | null;
  orderIdReference: string | null;
  merchantId: string | null;
  capturedAmount: number | null;
  capturedCurrency: string | null;
}

export interface OrderSnapshotForWebhook {
  id: string;
  status: string;
  payment_status?: string | null;
  payment_processed_at?: string | null;
  total_amount: number | string;
  currency: string;
  payment_total?: number | string | null;
  payment_currency?: string | null;
  payment_id?: string | null;
}

export interface PayPalWebhookDecision {
  action: PayPalWebhookAction;
  effectiveNormalizedStatus: string;
  reason: string;
  shouldDeadLetter: boolean;
  httpStatus: 200 | 400 | 401 | 500;
}

const SUPPORTED_EVENTS = new Set([
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
]);

export function parsePayPalWebhookEvent(body: any): ParsedPayPalWebhookEvent {
  if (!body || typeof body !== "object") {
    throw new Error("PAYPAL_WEBHOOK_INVALID_BODY: Payload vacío o inválido.");
  }
  const eventId = typeof body.id === "string" ? body.id.trim() : "";
  const eventType = typeof body.event_type === "string" ? body.event_type.trim().toUpperCase() : "";
  const resource = body.resource && typeof body.resource === "object" ? body.resource : null;

  if (!eventId || !eventType || !resource) {
    throw new Error("PAYPAL_WEBHOOK_MISSING_FIELDS: Faltan id, event_type o resource.");
  }

  const isOrderEvent = eventType.startsWith("CHECKOUT.ORDER.");
  const relatedOrderId = resource?.supplementary_data?.related_ids?.order_id || null;
  const paypalOrderId = isOrderEvent
    ? (typeof resource.id === "string" ? resource.id : null)
    : (typeof relatedOrderId === "string" ? relatedOrderId : null);

  const captureId = !isOrderEvent && typeof resource.id === "string" ? resource.id : null;

  const firstUnit = Array.isArray(resource.purchase_units) ? resource.purchase_units[0] : null;
  const orderIdReference =
    (typeof resource.custom_id === "string" && resource.custom_id.trim()) ||
    (typeof firstUnit?.reference_id === "string" && firstUnit.reference_id.trim()) ||
    (typeof resource.invoice_id === "string" && resource.invoice_id.trim()) ||
    null;

  const merchantId =
    (typeof resource?.payee?.merchant_id === "string" && resource.payee.merchant_id.trim()) ||
    (typeof firstUnit?.payee?.merchant_id === "string" && firstUnit.payee.merchant_id.trim()) ||
    null;

  const amountObj = resource.amount || firstUnit?.amount || null;
  const capturedAmount = amountObj?.value !== undefined ? Number(amountObj.value) : null;
  const capturedCurrency = amountObj?.currency_code
    ? String(amountObj.currency_code).toUpperCase().trim()
    : null;

  return {
    eventId,
    eventType,
    createTime: typeof body.create_time === "string" ? body.create_time : null,
    resourceType: typeof body.resource_type === "string" ? body.resource_type : null,
    resource,
    paypalOrderId,
    captureId,
    orderIdReference,
    merchantId,
    capturedAmount: capturedAmount !== null && Number.isFinite(capturedAmount) ? capturedAmount : null,
    capturedCurrency,
  };
}

export function evaluatePayPalWebhookTransition(params: {
  event: ParsedPayPalWebhookEvent;
  order: OrderSnapshotForWebhook | null;
  expectedMerchantId?: string | null;
}): PayPalWebhookDecision {
  const { event, order, expectedMerchantId } = params;

  if (!SUPPORTED_EVENTS.has(event.eventType)) {
    return {
      action: "IGNORE_UNSUPPORTED_EVENT",
      effectiveNormalizedStatus: "ignored",
      reason: `Evento PayPal no suscrito operativamente: ${event.eventType}`,
      shouldDeadLetter: false,
      httpStatus: 200,
    };
  }

  // Merchant isolation check: reject events belonging to a different PayPal account
  if (expectedMerchantId && event.merchantId && event.merchantId !== expectedMerchantId.trim()) {
    return {
      action: "DEAD_LETTER",
      effectiveNormalizedStatus: "manual_verification_required",
      reason: `PAYPAL_MERCHANT_MISMATCH: esperado=${expectedMerchantId}, recibido=${event.merchantId}`,
      shouldDeadLetter: true,
      httpStatus: 200,
    };
  }

  if (!order) {
    return {
      action: "DEAD_LETTER",
      effectiveNormalizedStatus: "orphan_event",
      reason: `PAYPAL_ORDER_NOT_FOUND: no se encontró orden para ref=${event.orderIdReference || event.paypalOrderId || "unknown"}`,
      shouldDeadLetter: true,
      httpStatus: 200,
    };
  }

  const orderStatus = String(order.status || "").toLowerCase();
  const isAlreadyFinalized = Boolean(order.payment_processed_at) || ["paid", "confirmed"].includes(orderStatus);
  const isCancelledOrExpired = ["expired", "cancelled", "cancelada"].includes(orderStatus);

  // Refunds and reversals are valid even after order is finalized
  if (event.eventType === "PAYMENT.CAPTURE.REFUNDED") {
    return {
      action: "RECORD_REFUND",
      effectiveNormalizedStatus: "refunded",
      reason: "Reembolso confirmado por PayPal.",
      shouldDeadLetter: false,
      httpStatus: 200,
    };
  }

  if (event.eventType === "PAYMENT.CAPTURE.REVERSED") {
    return {
      action: "RECORD_DISPUTE_OR_REVERSAL",
      effectiveNormalizedStatus: "disputed",
      reason: "Reversión / contracargo reportado por PayPal.",
      shouldDeadLetter: false,
      httpStatus: 200,
    };
  }

  // Out-of-order protection: never downgrade an already paid/confirmed order
  if (isAlreadyFinalized) {
    if (event.eventType === "PAYMENT.CAPTURE.DENIED" || event.eventType === "PAYMENT.CAPTURE.PENDING") {
      return {
        action: "IGNORE_OUT_OF_ORDER",
        effectiveNormalizedStatus: "approved",
        reason: `Evento fuera de orden (${event.eventType}) ignorado sobre orden ya finalizada (${order.status}).`,
        shouldDeadLetter: false,
        httpStatus: 200,
      };
    }
    return {
      action: "IGNORE_ALREADY_FINALIZED",
      effectiveNormalizedStatus: "approved",
      reason: "Orden ya procesada y confirmada previamente (idempotente).",
      shouldDeadLetter: false,
      httpStatus: 200,
    };
  }

  // Financial amount & currency validation for approval/completion events
  if (event.eventType === "PAYMENT.CAPTURE.COMPLETED" || event.eventType === "CHECKOUT.ORDER.APPROVED") {
    if (isCancelledOrExpired) {
      return {
        action: "MANUAL_VERIFICATION_REQUIRED",
        effectiveNormalizedStatus: "manual_verification_required",
        reason: `Aprobación tardía de PayPal sobre orden en estado '${order.status}'. Requiere revisión manual.`,
        shouldDeadLetter: true,
        httpStatus: 200,
      };
    }

    const expectedCurrency = String(order.payment_currency || order.currency || "USD").toUpperCase().trim();
    const expectedAmount = Number(
      order.payment_total !== null && order.payment_total !== undefined && Number(order.payment_total) > 0
        ? order.payment_total
        : order.total_amount
    );

    if (event.capturedCurrency && event.capturedCurrency !== expectedCurrency) {
      return {
        action: "MANUAL_VERIFICATION_REQUIRED",
        effectiveNormalizedStatus: "manual_verification_required",
        reason: `PAYPAL_CURRENCY_MISMATCH: esperado=${expectedCurrency}, recibido=${event.capturedCurrency}`,
        shouldDeadLetter: true,
        httpStatus: 200,
      };
    }

    if (
      event.capturedAmount !== null &&
      Number.isFinite(expectedAmount) &&
      expectedAmount > 0 &&
      Math.abs(event.capturedAmount - expectedAmount) > 0.01
    ) {
      return {
        action: "MANUAL_VERIFICATION_REQUIRED",
        effectiveNormalizedStatus: "manual_verification_required",
        reason: `PAYPAL_AMOUNT_MISMATCH: esperado=${expectedAmount.toFixed(2)}, recibido=${event.capturedAmount.toFixed(2)}`,
        shouldDeadLetter: true,
        httpStatus: 200,
      };
    }

    if (event.eventType === "CHECKOUT.ORDER.APPROVED") {
      return {
        action: "CAPTURE_AND_FINALIZE",
        effectiveNormalizedStatus: "approved",
        reason: "Orden aprobada en PayPal (recuperación asíncrona independiente del navegador).",
        shouldDeadLetter: false,
        httpStatus: 200,
      };
    }

    return {
      action: "VERIFY_CAPTURE_AND_FINALIZE",
      effectiveNormalizedStatus: "approved",
      reason: "Captura PayPal recibida; requiere verificación autoritativa contra API PayPal antes de confirmar.",
      shouldDeadLetter: false,
      httpStatus: 200,
    };
  }

  if (event.eventType === "PAYMENT.CAPTURE.DENIED") {
    return {
      action: "RECORD_STATUS_ONLY",
      effectiveNormalizedStatus: "rejected",
      reason: "Captura denegada por PayPal.",
      shouldDeadLetter: false,
      httpStatus: 200,
    };
  }

  return {
    action: "RECORD_STATUS_ONLY",
    effectiveNormalizedStatus: "pending",
    reason: "Captura pendiente en PayPal.",
    shouldDeadLetter: false,
    httpStatus: 200,
  };
}
