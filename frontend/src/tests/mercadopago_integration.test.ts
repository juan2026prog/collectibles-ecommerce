import { describe, it, expect } from "vitest";

// Replicate constant-time comparison logic
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Replicate signature generator for test assertion
async function computeSignature(manifest: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(manifest));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Replicate order access token generator
async function generateOrderAccessToken(orderId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`order_access:${orderId}`)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// Financial validator matching Edge Function logic
function validateFinancialIntegrity(params: {
  mpStatus: string;
  paidAmount: number;
  orderAmount: number;
  paidCurrency: string;
  expectedCurrency: string;
}): { approved: boolean; reason?: string } {
  // Only approved status is acceptable
  if (params.mpStatus !== "approved") {
    return { approved: false, reason: `Status '${params.mpStatus}' is not approved for finalization` };
  }

  // Currency comparison
  if (params.paidCurrency.toUpperCase() !== params.expectedCurrency.toUpperCase()) {
    return { approved: false, reason: "Currency mismatch" };
  }

  // Amount comparison: zero tolerance cents equality
  const paidCents = Math.round(params.paidAmount * 100);
  const orderCents = Math.round(params.orderAmount * 100);
  if (paidCents !== orderCents) {
    return { approved: false, reason: `Amount mismatch: expected ${orderCents}c, received ${paidCents}c` };
  }

  return { approved: true };
}

describe("Mercado Pago Integration Unit & Logic Tests", () => {
  const SECRET = "93f2469b8fe3f9c64b630e2f5b82e185e7a9b0d1e2f3a4b5c6d7e8f90a1b2c3d";
  const ORDER_ID = "e87f8b2c-47bc-4fa8-bfe2-2435df145455";
  const SERVICE_KEY = "dummy-service-key-for-test";

  it("1. Valida firma criptográfica HMAC-SHA256 con tiempo constante", async () => {
    const dataId = "9988776655";
    const xRequestId = "req-12345-uuid";
    const ts = "1729780000";
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    const validV1 = await computeSignature(manifest, SECRET);

    // Valida coincidencia exacta
    expect(timingSafeEqual(validV1, validV1)).toBe(true);

    // Rechaza firma adulterada o longitud diferente
    const tamperedV1 = validV1.slice(0, -2) + "ff";
    expect(timingSafeEqual(tamperedV1, validV1)).toBe(false);
    expect(timingSafeEqual("invalid_length", validV1)).toBe(false);
  });

  it("2. Integridad Financiera: Sólo acepta 'approved', rechaza 'authorized' y 'pending'", () => {
    const approvedCase = validateFinancialIntegrity({
      mpStatus: "approved",
      paidAmount: 2500.00,
      orderAmount: 2500.00,
      paidCurrency: "UYU",
      expectedCurrency: "UYU",
    });
    expect(approvedCase.approved).toBe(true);

    const authorizedCase = validateFinancialIntegrity({
      mpStatus: "authorized",
      paidAmount: 2500.00,
      orderAmount: 2500.00,
      paidCurrency: "UYU",
      expectedCurrency: "UYU",
    });
    expect(authorizedCase.approved).toBe(false);
    expect(authorizedCase.reason).toContain("not approved");

    const pendingCase = validateFinancialIntegrity({
      mpStatus: "pending",
      paidAmount: 2500.00,
      orderAmount: 2500.00,
      paidCurrency: "UYU",
      expectedCurrency: "UYU",
    });
    expect(pendingCase.approved).toBe(false);
  });

  it("3. Integridad Financiera: Tolerancia cero a discrepancias de monto (rechaza diferencia de 1 peso)", () => {
    const exactCase = validateFinancialIntegrity({
      mpStatus: "approved",
      paidAmount: 1850.50,
      orderAmount: 1850.50,
      paidCurrency: "UYU",
      expectedCurrency: "UYU",
    });
    expect(exactCase.approved).toBe(true);

    // Diferencia de 1 peso (antes permitida por Math.abs > 1.0)
    const oneUnitDiff = validateFinancialIntegrity({
      mpStatus: "approved",
      paidAmount: 1849.50,
      orderAmount: 1850.50,
      paidCurrency: "UYU",
      expectedCurrency: "UYU",
    });
    expect(oneUnitDiff.approved).toBe(false);
    expect(oneUnitDiff.reason).toContain("Amount mismatch");

    // Diferencia de 1 centavo
    const oneCentDiff = validateFinancialIntegrity({
      mpStatus: "approved",
      paidAmount: 1850.51,
      orderAmount: 1850.50,
      paidCurrency: "UYU",
      expectedCurrency: "UYU",
    });
    expect(oneCentDiff.approved).toBe(false);
  });

  it("4. Integridad Financiera: Rechaza cobro en moneda no coincidente", () => {
    const currencyMismatch = validateFinancialIntegrity({
      mpStatus: "approved",
      paidAmount: 2500.00,
      orderAmount: 2500.00,
      paidCurrency: "USD",
      expectedCurrency: "UYU",
    });
    expect(currencyMismatch.approved).toBe(false);
    expect(currencyMismatch.reason).toBe("Currency mismatch");
  });

  it("5. Seguridad de Invitados: Generación y verificación de order_access_token", async () => {
    const token = await generateOrderAccessToken(ORDER_ID, SERVICE_KEY);
    expect(token).toHaveLength(32);

    // Mismo secret y orderId genera el mismo token en tiempo constante
    const token2 = await generateOrderAccessToken(ORDER_ID, SERVICE_KEY);
    expect(timingSafeEqual(token, token2)).toBe(true);

    // Orden diferente o token alterado no pasa verificación
    const tokenOtherOrder = await generateOrderAccessToken("other-uuid", SERVICE_KEY);
    expect(timingSafeEqual(token, tokenOtherOrder)).toBe(false);
  });

  it("6. Manejo de Webhook para pagos 404/ficticios (idempotencia y descarte seguro)", () => {
    // Simula la lógica de respuesta para recursos no existentes en MP
    function handleMpLookupResponse(status: number) {
      if (status === 404) {
        return { httpStatus: 200, action: "ignore_to_prevent_retry_storm", success: true };
      }
      if (status >= 500) {
        return { httpStatus: 500, action: "retry_upstream_error", success: false };
      }
      return { httpStatus: 200, action: "process_payment", success: true };
    }

    const test404 = handleMpLookupResponse(404);
    expect(test404.httpStatus).toBe(200);
    expect(test404.action).toBe("ignore_to_prevent_retry_storm");

    const test503 = handleMpLookupResponse(503);
    expect(test503.httpStatus).toBe(500);
    expect(test503.action).toBe("retry_upstream_error");
  });
});
