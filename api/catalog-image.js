import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';

const SUPABASE_STORAGE_HOST = 'cobtsgkwcftvexaarwmo.supabase.co';

// Exact first-party hosts (NO subdomain wildcards)
const EXACT_ALLOWED_HOSTS = new Set([
  SUPABASE_STORAGE_HOST,
  'collectibles.com.uy',
  'www.collectibles.com.uy',
  'http2.mlstatic.com',
]);

// Bounded external image CDN domains (exact or strict *.domain boundary)
const SUBDOMAIN_CDN_ALLOWLIST = [
  'mlstatic.com',
  'media-amazon.com',
  'ssl-images-amazon.com',
  'images-amazon.com',
  'ebayimg.com',
  'walmartimages.com',
];

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB hard cap

export function isPrivateOrReservedIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const clean = ip.trim().toLowerCase();

  // Unwrap IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
  if (clean.startsWith('::ffff:')) {
    const mappedV4 = clean.slice('::ffff:'.length);
    if (net.isIPv4(mappedV4)) {
      return isPrivateOrReservedIp(mappedV4);
    }
  }

  const version = net.isIP(clean);
  if (version === 4) {
    const parts = clean.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Link-local / cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && parts[2] === 100))) return true;
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  if (version === 6) {
    if (clean === '::' || clean === '::1') return true;
    if (clean.startsWith('fc') || clean.startsWith('fd')) return true; // Unique local fc00::/7
    if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) return true; // Link-local fe80::/10
    if (clean.startsWith('ff')) return true; // Multicast
    if (clean.startsWith('2001:db8:')) return true; // Documentation
    return false;
  }

  return true;
}

export function isTargetUrlAllowed(parsedUrl) {
  if (!parsedUrl || parsedUrl.protocol !== 'https:') return false;
  if (parsedUrl.username || parsedUrl.password) return false;
  if (parsedUrl.port && parsedUrl.port !== '443') return false;

  const lower = parsedUrl.hostname.toLowerCase().replace(/\.$/, '');
  if (!lower) return false;

  // Explicitly block legacy untrusted domain and all its subdomains
  if (lower === 'collectibles.uy' || lower.endsWith('.collectibles.uy')) {
    return false;
  }

  // Reject raw IP literals as hostnames
  if (net.isIP(lower) !== 0) {
    return false;
  }

  if (lower.endsWith('.local') || lower.endsWith('.internal') || lower === 'localhost') {
    return false;
  }

  // Restrict Supabase host strictly to public object storage paths
  if (lower === SUPABASE_STORAGE_HOST) {
    return parsedUrl.pathname.startsWith('/storage/v1/object/public/') && !parsedUrl.pathname.includes('..');
  }

  // Prevent recursive proxy loops on collectibles.com.uy
  if (lower === 'collectibles.com.uy' || lower === 'www.collectibles.com.uy') {
    if (parsedUrl.pathname.startsWith('/catalog-images') || parsedUrl.pathname.startsWith('/api/')) {
      return false;
    }
    return true;
  }

  if (EXACT_ALLOWED_HOSTS.has(lower)) {
    return true;
  }

  return SUBDOMAIN_CDN_ALLOWLIST.some((cdn) => lower === cdn || lower.endsWith('.' + cdn));
}

async function resolveSafeHostAddress(hostname, resolver = dns.lookup) {
  const records = await resolver(hostname, { all: true, verbatim: true });
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('DNS_EMPTY');
  }
  for (const rec of records) {
    if (!rec?.address || isPrivateOrReservedIp(rec.address)) {
      throw new Error('DNS_PRIVATE_OR_RESERVED_IP');
    }
  }
  return records[0];
}

async function fetchImageSafe(targetUrl, res, redirectCount = 0, deps = {}) {
  if (redirectCount > MAX_REDIRECTS) {
    return res.status(508).json({ error: 'Too many redirects in image proxy' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid target URL format' });
  }

  if (!isTargetUrlAllowed(parsedUrl)) {
    return res.status(403).json({ error: `Target '${parsedUrl.hostname}' or protocol/path is not allowed` });
  }

  let pinnedRecord;
  try {
    pinnedRecord = await resolveSafeHostAddress(parsedUrl.hostname, deps.lookup || dns.lookup);
  } catch (dnsErr) {
    const status = dnsErr?.message === 'DNS_PRIVATE_OR_RESERVED_IP' ? 403 : 502;
    return res.status(status).json({ error: 'Upstream host validation failed' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    const reqUpstream = https.get(
      parsedUrl.toString(),
      {
        timeout: REQUEST_TIMEOUT_MS,
        servername: parsedUrl.hostname,
        // Pin socket connection to the already-validated IP to prevent DNS rebinding
        lookup: (_host, _opts, cb) => cb(null, pinnedRecord.address, pinnedRecord.family),
        headers: {
          'User-Agent': 'Googlebot-Image/1.0',
          'Accept': 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      },
      (proxyRes) => {
        const statusCode = proxyRes.statusCode || 500;

        if ([301, 302, 303, 307, 308].includes(statusCode) && proxyRes.headers.location) {
          proxyRes.resume();
          let nextUrl;
          try {
            nextUrl = new URL(proxyRes.headers.location, parsedUrl).toString();
          } catch {
            return finish(res.status(400).json({ error: 'Invalid redirect URL from upstream' }));
          }
          return finish(fetchImageSafe(nextUrl, res, redirectCount + 1, deps));
        }

        if (statusCode < 200 || statusCode >= 300) {
          proxyRes.resume();
          return finish(res.status(statusCode).json({ error: `Target URL returned HTTP ${statusCode}` }));
        }

        const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
          proxyRes.resume();
          return finish(res.status(400).json({ error: 'Target URL returned non-image Content-Type' }));
        }

        const declaredLength = Number(proxyRes.headers['content-length'] || 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
          proxyRes.destroy();
          return finish(res.status(413).json({ error: 'Image exceeds maximum allowed size' }));
        }

        res.setHeader('Content-Type', proxyRes.headers['content-type']);
        res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Robots-Tag', 'all, index, follow');

        let bytesStreamed = 0;
        proxyRes.on('data', (chunk) => {
          bytesStreamed += chunk.length;
          if (bytesStreamed > MAX_IMAGE_BYTES) {
            proxyRes.destroy(new Error('IMAGE_SIZE_EXCEEDED'));
            res.destroy?.();
          }
        });

        proxyRes.on('end', () => finish());
        proxyRes.on('error', () => finish());
        proxyRes.pipe(res);
      },
    );

    reqUpstream.on('timeout', () => {
      reqUpstream.destroy(new Error('UPSTREAM_TIMEOUT'));
      if (!res.headersSent) {
        finish(res.status(504).json({ error: 'Image proxy request timed out' }));
      } else {
        finish();
      }
    });

    reqUpstream.on('error', (err) => {
      console.error('Catalog image proxy connection error:', err?.message || err);
      if (!res.headersSent) {
        finish(res.status(502).json({ error: 'Proxy connection failed' }));
      } else {
        finish();
      }
    });
  });
}

export function resolveCatalogImageTarget(pathParam) {
  const raw = String(pathParam || '').trim();
  if (!raw) return null;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  if (raw.startsWith('external/')) {
    return 'https://' + raw.substring('external/'.length);
  }
  if (raw.startsWith('http2.mlstatic.com/')) {
    return 'https://' + raw;
  }
  if (raw.startsWith('storage/v1/object/public/')) {
    return `https://${SUPABASE_STORAGE_HOST}/${raw}`;
  }
  if (raw.startsWith('/')) {
    return `https://${SUPABASE_STORAGE_HOST}/storage/v1/object/public${raw}`;
  }
  return `https://${SUPABASE_STORAGE_HOST}/storage/v1/object/public/${raw}`;
}

export default async function handler(req, res) {
  try {
    const rawPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : (req.query?.path || '');
    const targetUrl = resolveCatalogImageTarget(rawPath);
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing image path parameter' });
    }
    await fetchImageSafe(targetUrl, res);
  } catch (err) {
    console.error('Catalog image handler error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error in catalog image handler' });
    }
  }
}
