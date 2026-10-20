import fs from 'node:fs';
import { createPublicSupabase } from './_lib/public-supabase.js';

let cachedFeedXml = null;
let cachedAt = 0;
let feedPromise = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes in-memory cache
const DISK_FEED_PATH = '/tmp/collectibles_merchant_feed.xml';

export function resetMerchantFeedCache() {
  cachedFeedXml = null;
  cachedAt = 0;
  feedPromise = null;
  try {
    if (fs.existsSync(DISK_FEED_PATH)) {
      fs.unlinkSync(DISK_FEED_PATH);
    }
  } catch {}
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanText(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function validateGtin(gtin) {
  if (!gtin) return null;
  const str = String(gtin).trim();
  if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(str)) {
    return str;
  }
  return null;
}

function resolveMerchantImageUrl(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return '';
  const trimmed = imgUrl.trim();
  if (!trimmed) return '';

  // 1. Direct stable Supabase Storage URLs (preferred for performance and reliability)
  if (trimmed.includes('cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/')) {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return `https://${trimmed.replace(/^\/+/, '')}`;
  }

  if (trimmed.startsWith('/storage/v1/object/public/')) {
    return `https://cobtsgkwcftvexaarwmo.supabase.co${trimmed}`;
  }

  // 2. MercadoLibre static image URLs (proxied to add headers/extension consistency)
  if (trimmed.includes('http2.mlstatic.com/')) {
    const pathPart = trimmed.split('http2.mlstatic.com/')[1];
    return `https://collectibles.uy/catalog-images/external/http2.mlstatic.com/${pathPart}`;
  }

  // 3. Other external image URLs
  if (/^(https?:\/\/)/.test(trimmed)) {
    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    return `https://collectibles.uy/catalog-images/external/${withoutProtocol}`;
  }

  // 4. Relative paths or product image filenames
  if (trimmed.startsWith('/')) {
    return `https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/product-images${trimmed}`;
  }

  return `https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/product-images/${trimmed}`;
}

async function fetchAllPaged(queryBuilder, pageSize = 1000, maxTotal = 50000) {
  let all = [];
  let page = 0;
  let hasMore = true;
  while (hasMore && all.length < maxTotal) {
    const { data: batch, error } = await queryBuilder(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (batch && batch.length > 0) {
      all = all.concat(batch);
      if (batch.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }
  return all;
}

export async function generateMerchantFeedXml(supabase, baseUrl = 'https://collectibles.uy') {
  // 1. Paginated fetch for ALL published active products
  const allProducts = await fetchAllPaged((from, to) =>
    supabase
      .from('products')
      .select(`
        id,
        title,
        slug,
        description,
        short_description,
        base_price,
        condition,
        brand_id,
        metadata
      `)
      .eq('is_active', true)
      .eq('status', 'published')
      .range(from, to)
  );

  // 2. Paginated fetch for ALL product images
  const allImages = await fetchAllPaged((from, to) =>
    supabase
      .from('product_images')
      .select('product_id, url, is_primary')
      .range(from, to)
  );

  // 3. Paginated fetch for ALL active brands
  const allBrands = await fetchAllPaged((from, to) =>
    supabase
      .from('brands')
      .select('id, name')
      .eq('is_active', true)
      .range(from, to)
  );

  const imageMap = {};
  if (allImages) {
    allImages.forEach(img => {
      if (!imageMap[img.product_id] || img.is_primary) {
        imageMap[img.product_id] = img.url;
      }
    });
  }

  const brandMap = {};
  if (allBrands) {
    allBrands.forEach(b => {
      brandMap[b.id] = b.name;
    });
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n`;
  xml += `  <channel>\n`;
  xml += `    <title>Collectibles Uruguay - Google Merchant Feed</title>\n`;
  xml += `    <link>${baseUrl}</link>\n`;
  xml += `    <description>Feed dinámico oficial de productos de Collectibles Uruguay</description>\n`;

  if (allProducts && allProducts.length > 0) {
    allProducts.forEach(p => {
      // STRICT MERCHANT ELIGIBILITY FILTERS
      if (!p.slug || !p.title) return;

      const priceNum = Number(p.base_price || 0);
      if (isNaN(priceNum) || priceNum <= 0) return;

      const rawImg = imageMap[p.id];
      if (!rawImg) return;

      const link = `${baseUrl}/producto/${p.slug}`;
      const imageLink = resolveMerchantImageUrl(rawImg);
      const rawDesc = p.description || p.short_description || p.title;
      const description = cleanText(rawDesc);
      const brandName = (p.brand_id && brandMap[p.brand_id]) ? brandMap[p.brand_id] : 'Collectibles';

      let condition = 'new';
      if (p.condition) {
        const cLower = String(p.condition).toLowerCase();
        if (cLower.includes('usad') || cLower.includes('used')) {
          condition = 'used';
        }
      }

      const priceFormatted = `${priceNum.toFixed(2)} UYU`;
      const rawGtin = p.metadata?.gtin || p.metadata?.ean || p.gtin || p.ean;
      const validGtin = validateGtin(rawGtin);
      const mpn = p.metadata?.mpn || p.id;

      xml += `    <item>\n`;
      xml += `      <g:id>${escapeXml(p.id)}</g:id>\n`;
      xml += `      <g:title>${escapeXml(p.title)}</g:title>\n`;
      xml += `      <g:description>${escapeXml(description)}</g:description>\n`;
      xml += `      <g:link>${escapeXml(link)}</g:link>\n`;
      xml += `      <g:image_link>${escapeXml(imageLink)}</g:image_link>\n`;
      xml += `      <g:availability>in_stock</g:availability>\n`;
      xml += `      <g:price>${escapeXml(priceFormatted)}</g:price>\n`;
      xml += `      <g:brand>${escapeXml(brandName)}</g:brand>\n`;
      if (validGtin) {
        xml += `      <g:gtin>${escapeXml(validGtin)}</g:gtin>\n`;
      } else {
        xml += `      <g:identifier_exists>no</g:identifier_exists>\n`;
      }
      xml += `      <g:mpn>${escapeXml(mpn)}</g:mpn>\n`;
      xml += `      <g:condition>${escapeXml(condition)}</g:condition>\n`;
      xml += `    </item>\n`;
    });
  }

  xml += `  </channel>\n`;
  xml += `</rss>`;

  return xml;
}

export function createMerchantFeedHandler(clientFactory = createPublicSupabase) {
  let client = null;
  const getClient = () => {
    if (!client) {
      const env = {
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co',
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
      };
      client = clientFactory(env);
    }
    return client;
  };

  return async function handler(req, res) {
    const startedAt = Date.now();
    const isHead = req.method === 'HEAD';

    // Secure cache purging: strictly require authorization secret to prevent anonymous DoS hammering
    const purgeSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const providedSecret = req.headers?.['x-purge-secret'] || req.query?.secret || req.headers?.['authorization']?.replace(/^Bearer\s+/i, '');
    const isAuthorizedPurge = Boolean(purgeSecret && providedSecret && providedSecret === purgeSecret);

    if ((req.query?.purge === 'true' || req.headers?.['x-purge-feed'] === 'true') && isAuthorizedPurge) {
      resetMerchantFeedCache();
    }

    // 1. In-memory cache hit
    if (cachedFeedXml && (Date.now() - cachedAt < CACHE_TTL_MS)) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=14400');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=14400');
      res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=14400');
      res.setHeader('X-Feed-Source', 'memory-cache');
      res.setHeader('X-Feed-Age', String(Math.floor((Date.now() - cachedAt) / 1000)));
      return res.status(200).send(isHead ? '' : cachedFeedXml);
    }

    // 2. In-flight promise deduplication
    if (!feedPromise) {
      feedPromise = (async () => {
        if (process.env.CF_PUBLIC_CATALOG_ENABLED === 'true') {
          try {
            const cfBase = (process.env.CF_CATALOG_WORKER_URL || 'https://collectibles-catalog-api.pixelsncodes-uy.workers.dev').replace(/\/+$/, '');
            const cfRes = await fetch(`${cfBase}/api/v1/feeds/merchant.xml`, {
              method: 'GET',
              headers: { Accept: 'application/xml', 'X-Catalog-Client': 'vercel-merchant-feed' },
              signal: AbortSignal.timeout(5000),
            });
            if (cfRes.ok && cfRes.headers.get('X-Catalog-Kill-Switch') !== 'active') {
              const xmlText = await cfRes.text();
              if (xmlText && xmlText.includes('<rss')) {
                return xmlText;
              }
            }
          } catch (cfErr) {
            console.warn('[merchant-feed] Cloudflare D1 upstream fallback:', cfErr?.message || cfErr);
          }
        }
        const supabase = getClient();
        return await generateMerchantFeedXml(supabase);
      })().then(xml => {
        cachedFeedXml = xml;
        cachedAt = Date.now();
        // Persist to disk for cold-start instance survival in the same microVM
        try {
          fs.promises.writeFile(DISK_FEED_PATH, xml, 'utf8').catch(() => {});
        } catch {}
        return xml;
      }).finally(() => {
        feedPromise = null;
      });
    }

    try {
      const xml = await feedPromise;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=14400');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=14400');
      res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=14400');
      res.setHeader('X-Feed-Source', 'fresh');
      res.setHeader('X-Feed-Generation-Time-Ms', String(Date.now() - startedAt));
      return res.status(200).send(isHead ? '' : xml);
    } catch (error) {
      console.error('[merchant-feed] Generation failed, evaluating fallback:', error?.message || error);

      // Stale RAM cache fallback if previously generated in this container
      if (cachedFeedXml) {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1200');
        res.setHeader('CDN-Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
        res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
        res.setHeader('X-Feed-Source', 'stale-cache-fallback');
        res.setHeader('X-Feed-Age', String(Math.floor((Date.now() - cachedAt) / 1000)));
        return res.status(200).send(isHead ? '' : cachedFeedXml);
      }

      // Stale disk fallback if previously written to /tmp
      try {
        if (fs.existsSync(DISK_FEED_PATH)) {
          const diskXml = fs.readFileSync(DISK_FEED_PATH, 'utf8');
          if (diskXml && diskXml.includes('<rss')) {
            cachedFeedXml = diskXml;
            cachedAt = Date.now();
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1200');
            res.setHeader('CDN-Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
            res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
            res.setHeader('X-Feed-Source', 'disk-cache-fallback');
            return res.status(200).send(isHead ? '' : diskXml);
          }
        }
      } catch {}

      // Cold-start failure with NO prior feed anywhere:
      // Return HTTP 503 Service Unavailable so Google Merchant Center maintains
      // the existing indexed product catalog instead of unindexing everything.
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('CDN-Cache-Control', 'no-store');
      res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
      res.setHeader('Retry-After', '300');
      return res.status(503).send('Merchant feed temporarily unavailable. Upstream database unreachable.');
    }
  };
}

export default createMerchantFeedHandler();
