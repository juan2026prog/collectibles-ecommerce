import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

const ALLOWED_DOMAINS = [
  'amazon.com',
  'media-amazon.com',
  'ssl-images-amazon.com',
  'images-amazon.com',
  'ebayimg.com',
  'walmartimages.com',
  'cobtsgkwcftvexaarwmo.supabase.co',
  'http2.mlstatic.com',
  'mlstatic.com',
  'collectibles.uy'
];

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  if (h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  return false;
}

function isDomainAllowed(hostname: string): boolean {
  if (isPrivateOrLoopbackHost(hostname)) return false;
  const lower = hostname.toLowerCase();
  return ALLOWED_DOMAINS.some(allowed => lower === allowed || lower.endsWith('.' + allowed));
}

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url);
    const targetUrlRaw = url.searchParams.get('url');

    if (!targetUrlRaw) {
      return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let targetUrl: string;
    try {
      targetUrl = decodeURIComponent(targetUrlRaw);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid 'url' encoding" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let parsedTarget: URL;
    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Enforce HTTPS protocol
    if (parsedTarget.protocol !== 'https:') {
      return new Response(JSON.stringify({ error: "Only HTTPS targets are allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!isDomainAllowed(parsedTarget.hostname)) {
      return new Response(JSON.stringify({ error: `Domain '${parsedTarget.hostname}' not allowed for proxy` }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const imageRes = await fetch(parsedTarget.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Collectibles-MediaProxy/1.0',
        'Accept': 'image/webp,image/avif,image/png,image/jpeg,image/*;q=0.8'
      }
    });
    clearTimeout(timeoutId);

    if (!imageRes.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch image upstream (HTTP ${imageRes.status})` }), {
        status: imageRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const contentType = imageRes.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return new Response(JSON.stringify({ error: `Upstream returned non-image content-type: ${contentType}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Cache the image for 1 year
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(imageRes.body, {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error("media-proxy error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
