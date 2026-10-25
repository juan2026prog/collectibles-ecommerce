// Allowed origins for CORS. Add your production domain here.
const ALLOWED_ORIGINS = [
  'https://collectibles-ecommerce.vercel.app',
  'https://collectibles.uy',
  'https://www.collectibles.uy',
  'http://localhost:5173',
  'http://localhost:3000',
];

export function getCorsOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  if (!origin) return ALLOWED_ORIGINS[0];

  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    const protocol = parsed.protocol;

    if (protocol === 'https:') {
      if (host === 'collectibles.uy' || host === 'www.collectibles.uy') return origin;
      if (host === 'collectibles-ecommerce.vercel.app') return origin;
      if (host.endsWith('-collectibles-ecommerce.vercel.app')) return origin;
    }

    if (protocol === 'http:' || protocol === 'https:') {
      if (host === 'localhost' || host === '127.0.0.1') return origin;
    }
  } catch (_e) {
    // Malformed origin URL
    return ALLOWED_ORIGINS[0];
  }

  return ALLOWED_ORIGINS[0]; // Default to production
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0], // Default to production domain — use getCorsHeaders(req) for dynamic per-request origin
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Returns CORS headers with the origin dynamically set.
 * Use this instead of the static corsHeaders for responses.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}
