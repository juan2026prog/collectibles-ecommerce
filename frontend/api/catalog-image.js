import https from 'https';
import http from 'http';

const ALLOWED_HOSTS = [
  'cobtsgkwcftvexaarwmo.supabase.co',
  'http2.mlstatic.com',
  'mlstatic.com',
  'collectibles.uy',
  'amazon.com',
  'media-amazon.com',
  'ssl-images-amazon.com',
  'images-amazon.com',
  'ebayimg.com',
  'walmartimages.com'
];

function isHostAllowed(hostname) {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();

  // Block local / private IPs
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower.startsWith('10.') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('169.254.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower) ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return false;
  }

  return ALLOWED_HOSTS.some(allowed => lower === allowed || lower.endsWith('.' + allowed));
}

function fetchImageWithRedirects(targetUrl, res, redirectCount = 0) {
  if (redirectCount > 5) {
    return res.status(508).json({ error: 'Too many redirects in image proxy' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid target URL format' });
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return res.status(403).json({ error: 'Invalid protocol' });
  }

  if (!isHostAllowed(parsedUrl.hostname)) {
    return res.status(403).json({ error: `Host '${parsedUrl.hostname}' is not in allowlist` });
  }

  const client = targetUrl.startsWith('https') ? https : http;

  client.get(targetUrl, {
    headers: {
      'User-Agent': 'Googlebot-Image/1.0',
      'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }
  }, (proxyRes) => {
    const statusCode = proxyRes.statusCode || 500;

    // Follow HTTP 301, 302, 307, 308 redirects automatically
    if ([301, 302, 307, 308].includes(statusCode) && proxyRes.headers.location) {
      let redirectUrl = proxyRes.headers.location;
      if (redirectUrl.startsWith('/')) {
        redirectUrl = `${parsedUrl.origin}${redirectUrl}`;
      }
      return fetchImageWithRedirects(redirectUrl, res, redirectCount + 1);
    }

    if (statusCode < 200 || statusCode >= 300) {
      return res.status(statusCode).json({ error: `Target URL returned HTTP ${statusCode}` });
    }

    const contentType = proxyRes.headers['content-type'] || 'image/jpeg';
    if (!contentType.includes('image/')) {
      return res.status(400).json({ error: `Target URL returned non-image Content-Type: ${contentType}` });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Robots-Tag', 'all, index, follow');

    proxyRes.pipe(res);
  }).on('error', (err) => {
    console.error('Catalog image proxy connection error:', err);
    res.status(500).json({ error: 'Proxy connection failed' });
  });
}

export default async function handler(req, res) {
  try {
    const pathParam = req.query.path || '';
    if (!pathParam) {
      return res.status(400).json({ error: 'Missing image path parameter' });
    }

    let targetUrl = '';
    if (pathParam.startsWith('http://') || pathParam.startsWith('https://')) {
      targetUrl = pathParam;
    } else if (pathParam.startsWith('external/')) {
      targetUrl = 'https://' + pathParam.substring('external/'.length);
    } else if (pathParam.startsWith('http2.mlstatic.com/')) {
      targetUrl = 'https://' + pathParam;
    } else if (pathParam.startsWith('storage/v1/object/public/')) {
      targetUrl = `https://${ALLOWED_HOSTS[0]}/${pathParam}`;
    } else if (pathParam.startsWith('/')) {
      targetUrl = `https://${ALLOWED_HOSTS[0]}/storage/v1/object/public${pathParam}`;
    } else {
      targetUrl = `https://${ALLOWED_HOSTS[0]}/storage/v1/object/public/${pathParam}`;
    }

    fetchImageWithRedirects(targetUrl, res);
  } catch (err) {
    console.error('Catalog image handler error:', err);
    res.status(500).json({ error: 'Internal server error in catalog image handler' });
  }
}
