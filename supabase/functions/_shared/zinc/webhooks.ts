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
 * Status precedence hierarchy for international order items.
 * Higher rank means further progressed along the fulfillment pipeline.
 */
export const PURCHASE_STATUS_RANKS: Record<string, number> = {
  pending_purchase: 0,
  zinc_order_created: 10,
  zinc_processing: 10,
  purchased: 20,
  shipped_to_courier: 30,
  delivered_to_courier: 40,
};

/**
 * Checks whether transitioning from currentStatus to targetStatus is valid and monotonic.
 * 
 * Strict Monotonic Rules:
 * - delivered_to_courier cannot transition to shipped, purchased, processing, or created.
 * - shipped_to_courier cannot transition to purchased, processing, or created.
 * - purchased cannot transition to processing or created.
 * - Terminal failure states (zinc_failed, manual_review) are accepted unless already delivered_to_courier.
 */
export function shouldTransitionPurchaseStatus(
  currentStatus: string | null | undefined,
  targetStatus: string
): boolean {
  const curr = (currentStatus || "").trim().toLowerCase();
  const target = targetStatus.trim().toLowerCase();

  // If already delivered, no event (except explicit re-delivery confirmation) can alter the delivered status
  if (curr === "delivered_to_courier") {
    return target === "delivered_to_courier";
  }

  // Terminal failures are accepted if order hasn't arrived at courier yet
  if (target === "zinc_failed" || target === "manual_review") {
    return curr !== "delivered_to_courier";
  }

  const currRank = PURCHASE_STATUS_RANKS[curr] ?? 0;
  const targetRank = PURCHASE_STATUS_RANKS[target] ?? 0;

  // Strict monotonicity: target rank must be strictly greater than current rank
  // (or equal if reinforcing the same progressive state)
  return targetRank >= currRank;
}

export interface ZincMappedEventResult {
  purchase_status?: string;
  order_status?: string;
  is_terminal?: boolean;
  is_unknown?: boolean;
  is_return_event?: boolean;
  is_eta_update?: boolean;
}

/**
 * Idempotent and monotonic internal status mapper for Zinc V2 webhook events.
 */
export function mapZincEventToInternalStatus(
  eventType: string,
  zincStatus?: string
): ZincMappedEventResult {
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
      // Updates ETA metadata only; does NOT advance order to shipped or delivered
      return { is_eta_update: true };

    case "order.delivered":
      return { purchase_status: "delivered_to_courier" };

    case "order.cancelled":
    case "order.failed":
      return { 
        purchase_status: "zinc_failed", 
        order_status: "manual_review", 
        is_terminal: true 
      };

    // Return events: persisted durable in DB without mutating international purchase status
    case "return.created":
    case "return.approved":
    case "return.denied":
    case "return.credited":
    case "return.label_uploaded":
      return { is_return_event: true };

    default:
      if (st === "failed") {
        return { 
          purchase_status: "zinc_failed", 
          order_status: "manual_review", 
          is_terminal: true 
        };
      }
      // Unknown event: do NOT mutate purchase_status
      return { is_unknown: true };
  }
}
