// Constant-time string comparison and guest order token management
// Compatible with both Deno Edge Runtime and Node.js / Vite test environment

declare const Deno: any;

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
 * Derives or retrieves the dedicated guest token secret.
 * Priority:
 * 1. PAYMENT_GUEST_TOKEN_SECRET environment variable
 * 2. HMAC derived from SUPABASE_SERVICE_ROLE_KEY using an internal domain separation key.
 * Never directly exposes or uses the raw Service Role Key.
 */
export async function getGuestTokenSecret(fallbackServiceKey: string): Promise<string> {
  const explicitSecret = typeof Deno !== "undefined" && Deno.env ? Deno.env.get("PAYMENT_GUEST_TOKEN_SECRET") : (typeof process !== "undefined" && process.env ? process.env.PAYMENT_GUEST_TOKEN_SECRET : undefined);
  if (explicitSecret && explicitSecret.trim().length >= 16) {
    return explicitSecret.trim();
  }

  // Derive domain-separated key from fallback service key
  const encoder = new TextEncoder();
  const rootKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(fallbackServiceKey || "collectibles_secure_payment_salt_default_2026"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const derived = await crypto.subtle.sign(
    "HMAC",
    rootKey,
    encoder.encode("domain_separation:guest_order_access_token_v1")
  );
  return Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates an HMAC-SHA256 order verification token.
 * This proves legitimate ownership of the guest order session.
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
    encoder.encode(`guest_order_access:${orderId}`)
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
