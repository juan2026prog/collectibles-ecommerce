// Centralized CORS & Trusted Origin Guard for Collectibles Edge Functions.
// Security invariants:
// 1. collectibles.uy and *.collectibles.uy are UNTRUSTED third-party domains and MUST ALWAYS be rejected.
// 2. Arbitrary *.vercel.app origins are rejected; only collectibles-ecommerce(.vercel.app | -*.vercel.app) is allowed.
// 3. Localhost / 127.0.0.1 origins are allowed ONLY outside production runtime.
// 4. Unknown browser Origins receive NO Access-Control-Allow-Origin header and HTTP 403 on OPTIONS preflight.

declare const Deno: any;

export const OFFICIAL_SITE_URL = 'https://collectibles.com.uy';
export const FALLBACK_VERCEL_URL = 'https://collectibles-ecommerce.vercel.app';

const EXACT_PROD_ORIGINS = new Set<string>([
  'https://collectibles.com.uy',
  'https://www.collectibles.com.uy',
  'https://collectibles-ecommerce.vercel.app',
]);

const VERCEL_PREVIEW_HOST_RE = /^collectibles-ecommerce-[a-z0-9-]+\.vercel\.app$/;
const PROD_SUPABASE_REF = 'cobtsgkwcftvexaarwmo';

function getEnv(key: string, envOverride?: Record<string, string | undefined>): string {
  if (envOverride && key in envOverride) {
    return String(envOverride[key] ?? '');
  }
  try {
    if (typeof Deno !== 'undefined' && Deno?.env?.get) {
      return String(Deno.env.get(key) ?? '');
    }
  } catch {
    // ignore
  }
  return '';
}

export function isProductionRuntime(envOverride?: Record<string, string | undefined>): boolean {
  const supabaseUrl = getEnv('SUPABASE_URL', envOverride).toLowerCase();
  const envName = getEnv('ENVIRONMENT', envOverride).toLowerCase();
  if (supabaseUrl.includes(PROD_SUPABASE_REF)) {
    return envName !== 'development';
  }
  return envName === 'production';
}

export function isBlockedLegacyHostname(hostname: string): boolean {
  const h = (hostname || '').trim().toLowerCase().replace(/\.$/, '');
  return h === 'collectibles.uy' || h.endsWith('.collectibles.uy');
}

export function isTrustedBrowserOrigin(
  rawOrigin: string | null | undefined,
  envOverride?: Record<string, string | undefined>,
): boolean {
  if (!rawOrigin || typeof rawOrigin !== 'string') return false;
  const trimmed = rawOrigin.trim();
  if (!trimmed || trimmed === 'null') return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  // Origin header must not include path, query, hash or credentials
  if (parsed.origin !== trimmed || parsed.username || parsed.password) {
    return false;
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (isBlockedLegacyHostname(host)) {
    return false;
  }

  if (parsed.protocol === 'https:') {
    if (EXACT_PROD_ORIGINS.has(parsed.origin.toLowerCase())) {
      return true;
    }
    if (!parsed.port && VERCEL_PREVIEW_HOST_RE.test(host)) {
      return true;
    }
  }

  if (!isProductionRuntime(envOverride) && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }
  }

  return false;
}

/**
 * Resolves the canonical public storefront URL from environment configuration,
 * strictly rejecting untrusted, placeholder, or legacy domains.
 */
export function getOfficialSiteUrl(envOverride?: Record<string, string | undefined>): string {
  const candidates = [
    getEnv('PUBLIC_SITE_URL', envOverride),
    getEnv('SITE_URL', envOverride),
    getEnv('FRONTEND_URL', envOverride),
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const parsed = new URL(raw.trim());
      if (isTrustedBrowserOrigin(parsed.origin, envOverride)) {
        return parsed.origin;
      }
    } catch {
      // ignore invalid env value
    }
  }

  return OFFICIAL_SITE_URL;
}

/**
 * Safely resolves a payment/auth return base URL from a candidate origin or stored config.
 * Never trusts unvalidated Origin/Referer/Host headers or legacy collectibles.uy URLs.
 */
export function resolveTrustedReturnOrigin(
  candidate?: string | null,
  options?: { allowLocalhost?: boolean; envOverride?: Record<string, string | undefined> },
): string {
  const envOverride = options?.envOverride;
  if (candidate && typeof candidate === 'string') {
    try {
      const parsed = new URL(candidate.trim());
      const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
      if (!isBlockedLegacyHostname(host)) {
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        if (isLocal) {
          if (options?.allowLocalhost && !isProductionRuntime(envOverride) && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
            return parsed.origin;
          }
        } else if (isTrustedBrowserOrigin(parsed.origin, envOverride)) {
          return parsed.origin;
        }
      }
    } catch {
      // Fall through to official site URL
    }
  }
  return getOfficialSiteUrl(envOverride);
}

/**
 * Returns the validated origin string if allowed, or null if the origin must be rejected.
 */
export function getCorsOrigin(
  req: Request,
  envOverride?: Record<string, string | undefined>,
): string | null {
  const origin = req.headers.get('origin');
  if (!origin) {
    return OFFICIAL_SITE_URL;
  }
  if (isTrustedBrowserOrigin(origin, envOverride)) {
    return new URL(origin.trim()).origin;
  }
  return null;
}

const DEFAULT_ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type, x-collectibles-cron-secret, x-test-bypass';
const DEFAULT_ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': OFFICIAL_SITE_URL,
  'Access-Control-Allow-Headers': DEFAULT_ALLOW_HEADERS,
  'Access-Control-Allow-Methods': DEFAULT_ALLOW_METHODS,
  'Vary': 'Origin',
};

/**
 * Returns dynamic per-request CORS headers.
 * When an untrusted Origin header is present, Access-Control-Allow-Origin is intentionally omitted.
 */
export function getCorsHeaders(
  req: Request,
  extraHeaders?: string,
  envOverride?: Record<string, string | undefined>,
): Record<string, string> {
  const allowedOrigin = getCorsOrigin(req, envOverride);
  const allowHeaders = extraHeaders
    ? `${DEFAULT_ALLOW_HEADERS}, ${extraHeaders}`
    : DEFAULT_ALLOW_HEADERS;

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Methods': DEFAULT_ALLOW_METHODS,
    'Vary': 'Origin',
  };

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  return headers;
}

export function handleOptions(
  req: Request,
  extraHeaders?: string,
  envOverride?: Record<string, string | undefined>,
): Response | null {
  if (req.method !== 'OPTIONS') {
    return null;
  }

  const origin = req.headers.get('origin');
  if (origin && !isTrustedBrowserOrigin(origin, envOverride)) {
    return new Response(JSON.stringify({ error: 'CORS origin not authorized' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Vary': 'Origin',
      },
    });
  }

  return new Response('ok', {
    status: 200,
    headers: getCorsHeaders(req, extraHeaders, envOverride),
  });
}
