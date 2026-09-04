// supabase/functions/_shared/zinc/webhooks.ts
// Centralized Webhook HMAC-SHA256 signature verification, deduplication, and status mapping

/**
 * Computes HMAC-SHA256 hex digest of raw request body using the signing secret.
 */
export async function computeHmacSha256Hex(secret: string, rawBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret.trim());
  const bodyData = encoder.encode(rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, bodyData);
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes SHA-256 hash of raw body for unique delivery deduplication.
 */
export async function computeSha256Hex(rawBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawBody);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies webhook signature using timing-safe comparison.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined
): Promise<boolean> {
  if (!signatureHeader || !secret || !rawBody) {
    return false;
  }

  const expectedHex = await computeHmacSha256Hex(secret, rawBody);
  const receivedHex = signatureHeader.trim().toLowerCase();

  if (expectedHex.length !== receivedHex.length) {
    return false;
  }

  const encoder = new TextEncoder();
  const a = encoder.encode(expectedHex);
  const b = encoder.encode(receivedHex);

  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

/**
 * Idempotent and monotonic internal status mapper for international orders.
 */
export function mapZincEventToInternalStatus(eventType: string, zincStatus?: string): {
  purchase_status: string;
  order_status?: string;
  is_terminal?: boolean;
} {
  const evt = (eventType || "").trim().toLowerCase();
  const st = (zincStatus || "").trim().toLowerCase();

  switch (evt) {
    case "order.started":
      return { purchase_status: "zinc_processing" };

    case "order.placed":
      return { purchase_status: "purchased" };

    case "order.tracking_received":
    case "order.tracking":
    case "order.shipped":
      return { purchase_status: "shipped_to_courier" };

    case "order.estimated_delivery_updated":
      // Non-degrading progress update
      return { purchase_status: "shipped_to_courier" };

    case "order.delivered":
      return { purchase_status: "delivered_to_courier" };

    case "order.cancelled":
      return { purchase_status: "zinc_failed", order_status: "manual_review", is_terminal: true };

    case "order.failed":
      return { purchase_status: "zinc_failed", order_status: "manual_review", is_terminal: true };

    // Return events from API Reference & Changelog: persisted durable in DB without breaking order status
    case "return.created":
    case "return.approved":
    case "return.denied":
    case "return.credited":
    case "return.label_uploaded":
      return { purchase_status: "delivered_to_courier" };

    default:
      if (st === "failed") {
        return { purchase_status: "zinc_failed", order_status: "manual_review", is_terminal: true };
      }
      return { purchase_status: "zinc_processing" };
  }
}
