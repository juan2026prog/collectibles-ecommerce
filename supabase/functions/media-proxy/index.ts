import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions, isBlockedLegacyHostname } from "../_shared/cors.ts";

declare const Deno: any;

const SUPABASE_STORAGE_HOST = 'cobtsgkwcftvexaarwmo.supabase.co';

const EXACT_ALLOWED_DOMAINS = new Set([
  SUPABASE_STORAGE_HOST,
  'collectibles.com.uy',
  'www.collectibles.com.uy',
  'http2.mlstatic.com',
]);

const SUBDOMAIN_CDN_ALLOWLIST = [
  'amazon.com',
  'media-amazon.com',
  'ssl-images-amazon.com',
  'images-amazon.com',
  'ebayimg.com',
  'walmartimages.com',
  'mlstatic.com',
];

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function isPrivateOrReservedIp(ip: string): boolean {
  const clean = (ip || '').trim().toLowerCase();
  if (!clean) return true;

  if (clean.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(clean.slice('::ffff:'.length));
  }

  // IPv4 check
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts.some((n) => n < 0 || n > 255)) return true;
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }

  // IPv6 check
  if (clean === '::' || clean === '::1') return true;
  if (clean.startsWith('fc') || clean.startsWith('fd')) return true;
  if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) return true;
  if (clean.startsWith('ff') || clean.startsWith('2001:db8:')) return true;
  return false;
}

function isTargetAllowed(parsed: URL): boolean {
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;

  const lower = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!lower || isBlockedLegacyHostname(lower)) return false;
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower) || lower.includes(':')) return false;

  if (lower === SUPABASE_STORAGE_HOST) {
    return parsed.pathname.startsWith('/storage/v1/object/public/') && !parsed.pathname.includes('..');
  }

  if (lower === 'collectibles.com.uy' || lower === 'www.collectibles.com.uy') {
    return !parsed.pathname.startsWith('/catalog-images') && !parsed.pathname.startsWith('/api/');
  }

  if (EXACT_ALLOWED_DOMAINS.has(lower)) return true;
  return SUBDOMAIN_CDN_ALLOWLIST.some((d) => lower === d || lower.endsWith('.' + d));
}

async function assertSafeDns(hostname: string): Promise<void> {
  const [v4, v6] = await Promise.all([
    Deno.resolveDns(hostname, 'A').catch(() => [] as string[]),
    Deno.resolveDns(hostname, 'AAAA').catch(() => [] as string[]),
  ]);
  const ips = [...v4, ...v6];
  if (ips.length === 0) {
    throw new Error('DNS_UNRESOLVED');
  }
  for (const ip of ips) {
    if (isPrivateOrReservedIp(ip)) {
      throw new Error('DNS_PRIVATE_IP_BLOCKED');
    }
  }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let currentUrl = targetUrlRaw.trim();
    try {
      if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
        currentUrl = decodeURIComponent(currentUrl);
      }
    } catch {
      return new Response(JSON.stringify({ error: "Invalid 'url' encoding" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let imageRes: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let parsedTarget: URL;
      try {
        parsedTarget = new URL(currentUrl);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!isTargetAllowed(parsedTarget)) {
        return new Response(JSON.stringify({ error: `Target '${parsedTarget.hostname}' or protocol/path not allowed` }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        await assertSafeDns(parsedTarget.hostname);
      } catch (dnsErr: any) {
        const status = dnsErr?.message === 'DNS_PRIVATE_IP_BLOCKED' ? 403 : 502;
        return new Response(JSON.stringify({ error: 'Upstream DNS validation failed' }), {
          status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const res = await fetch(parsedTarget.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': 'Collectibles-MediaProxy/1.0',
          'Accept': 'image/webp,image/avif,image/png,image/jpeg,image/*;q=0.8',
        },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) {
          return new Response(JSON.stringify({ error: 'Redirect missing Location header' }), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (hop === MAX_REDIRECTS) {
          return new Response(JSON.stringify({ error: 'Too many redirects' }), {
            status: 508,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        currentUrl = new URL(location, parsedTarget).toString();
        continue;
      }

      imageRes = res;
      break;
    }

    if (!imageRes || !imageRes.ok) {
      const status = imageRes?.status || 502;
      return new Response(JSON.stringify({ error: `Failed to fetch image upstream (HTTP ${status})` }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = imageRes.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return new Response(JSON.stringify({ error: `Upstream returned non-image content-type: ${contentType}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const declaredLength = Number(imageRes.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ error: 'Image exceeds maximum allowed size' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const buf = await imageRes.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ error: 'Image exceeds maximum allowed size' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(buf, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('media-proxy error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Media proxy error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
