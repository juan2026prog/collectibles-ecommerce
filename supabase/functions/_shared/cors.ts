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
  // Allow the origin if it's in our whitelist, a Vercel preview URL, or a local development URL
  if (
    ALLOWED_ORIGINS.includes(origin) || 
    origin.endsWith('.vercel.app') ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  ) {
    return origin;
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
