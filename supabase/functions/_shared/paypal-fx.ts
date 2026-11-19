// supabase/functions/_shared/paypal-fx.ts
// Authoritative PayPal currency conversion & FX traceability helper.
// Eliminates hardcoded division (amount / 42) and enforces fail-closed FX validation.

export interface ExchangeRateRow {
  base_currency: string;
  quote_currency: string;
  rate: number | string;
  status: string;
  is_active: boolean;
  is_manual_override?: boolean | null;
  source_name?: string | null;
  provider?: string | null;
  effective_at?: string | null;
  expires_at?: string | null;
  override_expires_at?: string | null;
}

export interface PayPalChargeResolution {
  originalAmount: number;
  originalCurrency: string;
  paypalCurrency: "USD";
  paypalAmount: string;
  paypalAmountNumeric: number;
  fxRate: number;
  fxRateSource: string;
  fxRateEffectiveAt: string;
}

export function resolvePayPalChargeFromRate(
  originalAmount: number,
  originalCurrencyRaw: string,
  rateRow: ExchangeRateRow | null,
  nowMs: number = Date.now(),
): PayPalChargeResolution {
  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    throw new Error("PAYPAL_INVALID_AMOUNT: El importe de la orden debe ser mayor a cero.");
  }

  const originalCurrency = (originalCurrencyRaw || "UYU").toUpperCase().trim();

  // USD -> USD: pass-through without reconversion
  if (originalCurrency === "USD") {
    const rounded = Number(originalAmount.toFixed(2));
    return {
      originalAmount,
      originalCurrency: "USD",
      paypalCurrency: "USD",
      paypalAmount: rounded.toFixed(2),
      paypalAmountNumeric: rounded,
      fxRate: 1,
      fxRateSource: "NATIVE_USD",
      fxRateEffectiveAt: new Date(nowMs).toISOString(),
    };
  }

  if (originalCurrency !== "UYU") {
    throw new Error(`PAYPAL_UNSUPPORTED_CURRENCY: Moneda de origen '${originalCurrency}' no soportada para PayPal.`);
  }

  if (!rateRow) {
    throw new Error("PAYPAL_FX_MISSING: No existe una cotización USD/UYU configurada en currency_exchange_rates.");
  }

  if (!rateRow.is_active) {
    throw new Error("PAYPAL_FX_INACTIVE: La cotización USD/UYU no se encuentra activa para cobros.");
  }

  const allowedStatuses = new Set(["VERIFIED", "MANUAL_OVERRIDE"]);
  if (!allowedStatuses.has(String(rateRow.status || "").toUpperCase())) {
    throw new Error(`PAYPAL_FX_UNVERIFIED: La cotización USD/UYU tiene estado '${rateRow.status}' no aprobado para cobros.`);
  }

  const numericRate = Number(rateRow.rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    throw new Error("PAYPAL_FX_INVALID_RATE: La tasa USD/UYU es inválida.");
  }

  // Enforce expiration check:
  // - For non-manual rates: expires_at must not be in the past.
  // - For manual overrides: if override_expires_at is set, it must not be in the past.
  const isManual = rateRow.is_manual_override === true || String(rateRow.status).toUpperCase() === "MANUAL_OVERRIDE";
  const expiryToCheck = isManual ? rateRow.override_expires_at : rateRow.expires_at;
  if (expiryToCheck) {
    const expiryMs = Date.parse(expiryToCheck);
    if (Number.isFinite(expiryMs) && expiryMs < nowMs) {
      throw new Error(`PAYPAL_FX_EXPIRED: La cotización USD/UYU venció el ${expiryToCheck}.`);
    }
  }

  const converted = Number((originalAmount / numericRate).toFixed(2));
  if (!Number.isFinite(converted) || converted <= 0) {
    throw new Error("PAYPAL_CONVERTED_AMOUNT_INVALID: El monto convertido a USD debe ser mayor a 0.00.");
  }

  const sourceLabel = [rateRow.provider, rateRow.source_name].filter(Boolean).join(":") || "currency_exchange_rates";

  return {
    originalAmount,
    originalCurrency: "UYU",
    paypalCurrency: "USD",
    paypalAmount: converted.toFixed(2),
    paypalAmountNumeric: converted,
    fxRate: numericRate,
    fxRateSource: sourceLabel,
    fxRateEffectiveAt: rateRow.effective_at || new Date(nowMs).toISOString(),
  };
}

export interface PayPalCaptureVerificationInput {
  expectedPaymentCurrency?: string | null;
  expectedPaymentTotal?: number | string | null;
  captureData: any;
}

/**
 * Verifies that the PayPal capture response matches the authoritative
 * payment_currency and payment_total persisted during create-payment.
 * Backward-compatible: only enforces when expectedPaymentTotal > 0 and expectedPaymentCurrency is set.
 */
export function verifyPayPalCaptureReconciliation(input: PayPalCaptureVerificationInput): {
  verified: boolean;
  capturedCurrency: string | null;
  capturedAmount: number | null;
} {
  const captureUnit = input.captureData?.purchase_units?.[0]?.payments?.captures?.[0];
  const capturedCurrency = captureUnit?.amount?.currency_code
    ? String(captureUnit.amount.currency_code).toUpperCase().trim()
    : null;
  const capturedAmount = captureUnit?.amount?.value !== undefined
    ? Number(captureUnit.amount.value)
    : null;

  const expectedCurrency = input.expectedPaymentCurrency
    ? String(input.expectedPaymentCurrency).toUpperCase().trim()
    : null;
  const expectedAmount = input.expectedPaymentTotal !== undefined && input.expectedPaymentTotal !== null
    ? Number(input.expectedPaymentTotal)
    : null;

  if (expectedCurrency && expectedAmount !== null && Number.isFinite(expectedAmount) && expectedAmount > 0) {
    if (!capturedCurrency || capturedAmount === null || !Number.isFinite(capturedAmount)) {
      throw new Error("PAYPAL_CAPTURE_AMOUNT_MISSING: PayPal no devolvió importe o moneda capturada para reconciliación.");
    }
    if (capturedCurrency !== expectedCurrency) {
      throw new Error(`PAYPAL_CURRENCY_MISMATCH: Esperado ${expectedCurrency}, capturado ${capturedCurrency}.`);
    }
    if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
      throw new Error(`PAYPAL_AMOUNT_MISMATCH: Esperado ${expectedAmount.toFixed(2)} ${expectedCurrency}, capturado ${capturedAmount.toFixed(2)} ${capturedCurrency}.`);
    }
    return { verified: true, capturedCurrency, capturedAmount };
  }

  return { verified: false, capturedCurrency, capturedAmount };
}
