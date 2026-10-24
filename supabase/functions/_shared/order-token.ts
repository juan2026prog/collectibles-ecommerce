import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Constant-time string comparison to protect against timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Generates an HMAC-SHA256 order verification token.
 * This proves ownership of the order context for guest buyers returning from payment gateways.
 */
export async function generateOrderAccessToken(orderId: string, secret: string): Promise<string> {
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

/**
 * Verifies whether the provided order token matches the expected token in constant time.
 */
export async function verifyOrderAccessToken(
  providedToken: string | undefined | null,
  orderId: string,
  secret: string
): Promise<boolean> {
  if (!providedToken || typeof providedToken !== 'string') return false;
  const expectedToken = await generateOrderAccessToken(orderId, secret);
  return timingSafeEqual(providedToken.trim().toLowerCase(), expectedToken.toLowerCase());
}
