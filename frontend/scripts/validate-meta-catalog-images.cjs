const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const https = require('https');
const fs = require('fs');

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseKey);
const BASE_SITE_URL = 'https://collectibles.uy';

function resolveImageUrl(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return '';
  const trimmed = imgUrl.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('https://collectibles.uy/catalog-images/')) {
    return trimmed;
  }

  if (trimmed.includes('cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/')) {
    const pathPart = trimmed.split('/storage/v1/object/public/')[1];
    return `${BASE_SITE_URL}/catalog-images/${pathPart}`;
  }

  if (trimmed.includes('http2.mlstatic.com/')) {
    const pathPart = trimmed.split('http2.mlstatic.com/')[1];
    return `${BASE_SITE_URL}/catalog-images/external/http2.mlstatic.com/${pathPart}`;
  }

  if (/^(https?:\/\/)/.test(trimmed)) {
    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    return `${BASE_SITE_URL}/catalog-images/external/${withoutProtocol}`;
  }

  if (/^[a-f0-9-]{36}$/i.test(trimmed)) {
    return `${BASE_SITE_URL}/catalog-images/product-images/${trimmed}`;
  }

  if (trimmed.startsWith('/')) {
    return `${BASE_SITE_URL}/catalog-images/product-images${trimmed}`;
  }

  return `${BASE_SITE_URL}/catalog-images/product-images/${trimmed}`;
}

// Convert proxied catalog-images URL back to direct target URL for local testing before deployment
function getDirectTargetUrl(proxiedUrl) {
  if (!proxiedUrl.startsWith('https://collectibles.uy/catalog-images/')) return proxiedUrl;
  const pathPart = proxiedUrl.substring('https://collectibles.uy/catalog-images/'.length);

  if (pathPart.startsWith('external/')) {
    return 'https://' + pathPart.substring('external/'.length);
  }
  if (pathPart.startsWith('http2.mlstatic.com/')) {
    return 'https://' + pathPart;
  }
  return `https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/${pathPart}`;
}

async function checkTargetImageHttp(url) {
  const directUrl = getDirectTargetUrl(url);

  return new Promise((resolve) => {
    try {
      const client = directUrl.startsWith('https') ? https : http;
      const req = client.request(directUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
        }
      }, (res) => {
        const statusCode = res.statusCode || 0;
        const contentType = res.headers['content-type'] || '';
        const isHttpOk = statusCode >= 200 && statusCode < 300;
        const isImage = contentType.includes('image/');

        // Destroy request stream early once headers are received
        req.destroy();

        if (!isHttpOk) {
          resolve({ ok: false, reason: `HTTP status ${statusCode}`, statusCode, contentType });
        } else if (!isImage) {
          resolve({ ok: false, reason: `Content-Type is ${contentType}`, statusCode, contentType });
        } else {
          resolve({ ok: true, statusCode, contentType });
        }
      });

      req.on('error', (e) => resolve({ ok: false, reason: `Network error: ${e.message}` }));
      req.setTimeout(8000, () => {
        req.destroy();
        resolve({ ok: false, reason: 'Timeout (8s)' });
      });
      req.end();
    } catch (err) {
      resolve({ ok: false, reason: `Exception: ${err.message}` });
    }
  });
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}

async function runFullAudit() {
  console.log('=== STARTING CATALOG IMAGE VALIDATION (1,478 PRODUCTS) ===\n');

  let allProducts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        title,
        slug,
        base_price,
        status,
        is_active,
        images:product_images(url, is_primary, sort_order)
      `)
      .eq('status', 'published')
      .eq('is_active', true)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Supabase query error:', error);
      process.exit(1);
    }

    if (data && data.length > 0) {
      allProducts = allProducts.concat(data);
      if (data.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`Fetched ${allProducts.length} published products from Supabase DB.\n`);

  let okCount = 0;
  let invalidMainCount = 0;
  let recoveredCount = 0;
  let totalExcludedCount = 0;

  const invalidReport = [];

  const auditResults = await mapConcurrent(allProducts, 25, async (p, idx) => {
    if (idx > 0 && idx % 300 === 0) {
      console.log(`Progress: Validated ${idx}/${allProducts.length} products...`);
    }

    const candidateUrls = [];

    if (Array.isArray(p.images) && p.images.length > 0) {
      const sorted = [...p.images].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      const supabaseCandidates = [];
      const externalCandidates = [];

      sorted.forEach(img => {
        const resolved = resolveImageUrl(img.url);
        if (resolved && resolved.startsWith('https://')) {
          const isSupabase = img.url.includes('supabase.co') || /^[a-f0-9-]{36}$/i.test(img.url) || !img.url.startsWith('http');
          if (isSupabase) {
            if (!supabaseCandidates.includes(resolved)) supabaseCandidates.push(resolved);
          } else {
            if (!externalCandidates.includes(resolved)) externalCandidates.push(resolved);
          }
        }
      });

      [...supabaseCandidates, ...externalCandidates].forEach(url => {
        if (!candidateUrls.includes(url)) candidateUrls.push(url);
      });
    }

    if (candidateUrls.length === 0) {
      invalidMainCount++;
      totalExcludedCount++;
      invalidReport.push({
        id: p.id,
        title: p.title,
        mainUrl: 'NONE',
        reason: 'No image URLs found in DB',
        fallbackUsed: 'NONE',
        action: 'EXCLUDED'
      });
      return { product: p, mainImage: null, excluded: true };
    }

    const mainCandidate = candidateUrls[0];
    const mainCheck = await checkTargetImageHttp(mainCandidate);

    if (mainCheck.ok) {
      okCount++;
      return { product: p, mainImage: mainCandidate, excluded: false };
    }

    // Main image candidate 0 failed HTTP test
    invalidMainCount++;
    let recoveredUrl = null;

    for (let i = 1; i < candidateUrls.length; i++) {
      const check = await checkTargetImageHttp(candidateUrls[i]);
      if (check.ok) {
        recoveredUrl = candidateUrls[i];
        break;
      }
    }

    if (recoveredUrl) {
      recoveredCount++;
      invalidReport.push({
        id: p.id,
        title: p.title,
        mainUrl: mainCandidate,
        reason: mainCheck.reason,
        fallbackUsed: recoveredUrl,
        action: 'RECOVERED_VIA_SECONDARY'
      });
      return { product: p, mainImage: recoveredUrl, excluded: false };
    }

    totalExcludedCount++;
    invalidReport.push({
      id: p.id,
      title: p.title,
      mainUrl: mainCandidate,
      reason: mainCheck.reason,
      fallbackUsed: 'NONE',
      action: 'EXCLUDED'
    });
    return { product: p, mainImage: null, excluded: true };
  });

  console.log('\n================ AUDIT SUMMARY ================');
  console.log(`Productos analizados: ${allProducts.length}`);
  console.log(`Image links OK: ${okCount}`);
  console.log(`Image links inválidos: ${invalidMainCount}`);
  console.log(`Recuperados mediante imagen secundaria: ${recoveredCount}`);
  console.log(`Sin ninguna imagen válida: ${totalExcludedCount}`);
  console.log(`Excluidos del feed Meta: ${totalExcludedCount}`);
  console.log('===============================================\n');

  if (invalidReport.length > 0) {
    console.log('--- SAMPLE EXCLUDED PRODUCTS ---');
    invalidReport.slice(0, 15).forEach((rep, i) => {
      console.log(`${i + 1}. [${rep.action}] ID: ${rep.id} | ${rep.title}`);
      console.log(`   Motivo: ${rep.reason}`);
      console.log(`   Main URL: ${rep.mainUrl}`);
      console.log(`   Fallback: ${rep.fallbackUsed}\n`);
    });
  }

  // Check target products specifically
  const targetIds = [
    { name: 'Blanka', id: '5d7a7570-8749-4ecd-ab44-f5c28872f56a' },
    { name: 'Ken', id: 'acfac5ce-4360-4f8a-982e-9db411b11c9a' },
    { name: 'Amy', id: 'b9fed99b-020d-4e0f-9aff-ec123921a957' }
  ];

  console.log('--- TARGET PRODUCTS RESULT ---');
  targetIds.forEach(t => {
    const found = auditResults.find(r => r.product.id === t.id);
    if (found) {
      console.log(`[${t.name}] Excluded? ${found.excluded} | Exported image_link: ${found.mainImage}`);
    }
  });
}

runFullAudit();
