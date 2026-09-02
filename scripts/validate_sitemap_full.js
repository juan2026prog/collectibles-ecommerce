const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '../frontend/.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const k = parts[0].trim();
      const v = parts.slice(1).join('=').trim();
      if (k && !process.env[k]) {
        process.env[k] = v;
      }
    }
  });
}

function simulateReq(query) {
  const req = { query };
  let statusCode = 200;
  let headers = {};
  let body = '';

  const res = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    status: (code) => { statusCode = code; return res; },
    send: (content) => { body = content; return res; },
    json: (obj) => { body = JSON.stringify(obj); return res; }
  };

  return { req, res, getResult: () => ({ statusCode, headers, body }) };
}

(async () => {
  console.log('Iniciando validación masiva concurrente del sitemap...');

  const seoModule = await import('file:///c:/Projects/Collectibles2026/api/seo-prerender.js');
  const sitemapModule = await import('file:///c:/Projects/Collectibles2026/api/sitemap.js');

  const seoPrerenderHandler = seoModule.default;
  const sitemapHandler = sitemapModule.default;

  const { req, res, getResult } = simulateReq({});
  await sitemapHandler(req, res);
  const sitemapRes = getResult();

  const xml = sitemapRes.body;
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);

  console.log(`Total URLs encontradas en sitemap: ${locs.length}`);

  const rows = [];
  rows.push('url,type,http_status,redirects,title_ok,canonical_ok,robots_ok,h1_ok,schema_ok,breadcrumb_ok,result,error');

  let passCount = 0;
  let failCount = 0;

  async function validateUrl(url) {
    let type = 'home';
    let queryParams = { type: 'home' };

    if (url.endsWith('collectibles.uy') || url.endsWith('collectibles.uy/')) {
      type = 'home';
      queryParams = { type: 'home' };
    } else if (url.includes('/shop')) {
      type = 'shop';
      queryParams = { type: 'shop' };
    } else if (url.includes('/categoria/')) {
      type = 'categoria';
      const slug = url.split('/categoria/')[1];
      queryParams = { type: 'categoria', slug };
    } else if (url.includes('/marca/')) {
      type = 'marca';
      const slug = url.split('/marca/')[1];
      queryParams = { type: 'marca', slug };
    } else if (url.includes('/producto/')) {
      type = 'producto';
      const slug = url.split('/producto/')[1];
      queryParams = { type: 'producto', slug };
    } else if (url.includes('/page/')) {
      type = 'page';
      const slug = url.split('/page/')[1];
      queryParams = { type: 'page', slug };
    } else if (url.includes('/contact')) {
      type = 'page';
      queryParams = { type: 'page', slug: 'contact' };
    }

    const { req: pReq, res: pRes, getResult: pGetResult } = simulateReq(queryParams);
    await seoPrerenderHandler(pReq, pRes);
    const pageRes = pGetResult();

    const status = pageRes.statusCode;
    const body = pageRes.body;

    const titleMatch = body.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : '';
    const titleOk = Boolean(title && title.length > 5 && !title.toLowerCase().includes('undefined'));

    const canonicalMatch = body.match(/<link[^>]*rel="canonical"[^>]*href="(.*?)"/i);
    const canonical = canonicalMatch ? canonicalMatch[1] : '';
    const canonicalOk = Boolean(canonical === url || canonical === url.replace(/\/$/, '') || (url.endsWith('/') && canonical === url.slice(0, -1)));

    const robotsOk = Boolean(body.includes('index, follow') && !body.includes('noindex'));
    const h1Ok = Boolean(body.match(/<h1[^>]*>(.*?)<\/h1>/i));

    let schemaOk = true;
    let breadcrumbOk = true;
    let errorMsg = '';

    if (type === 'producto') {
      schemaOk = Boolean(body.includes('application/ld+json') && body.includes('"Product"'));
    }

    if (body.includes('"BreadcrumbList"')) {
      try {
        const jsonLdMatches = [...body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
        for (const m of jsonLdMatches) {
          const parsed = JSON.parse(m[1]);
          if (parsed['@type'] === 'BreadcrumbList' && Array.isArray(parsed.itemListElement)) {
            parsed.itemListElement.forEach((item, idx) => {
              if (idx > 0 && !item.item && idx < parsed.itemListElement.length - 1) {
                breadcrumbOk = false;
                errorMsg += `Breadcrumb item position ${item.position} missing item property; `;
              }
            });
          }
        }
      } catch (err) {
        breadcrumbOk = false;
        errorMsg += `JSON-LD parse error: ${err.message}; `;
      }
    }

    const isPass = status === 200 && titleOk && canonicalOk && robotsOk && h1Ok && schemaOk && breadcrumbOk;
    const result = isPass ? 'PASS' : 'FAIL';

    if (!isPass && !errorMsg) {
      if (!titleOk) errorMsg += 'Title invalid; ';
      if (!canonicalOk) errorMsg += `Canonical mismatch (expected ${url}, got ${canonical}); `;
      if (!robotsOk) errorMsg += 'Meta robots noindex; ';
      if (!h1Ok) errorMsg += 'Missing H1; ';
      if (!schemaOk) errorMsg += 'Missing Product schema; ';
    }

    return {
      row: `"${url}",${type},${status},0,${titleOk},${canonicalOk},${robotsOk},${h1Ok},${schemaOk},${breadcrumbOk},${result},"${errorMsg.trim()}"`,
      isPass
    };
  }

  // Process in concurrent batches of 40
  const batchSize = 40;
  for (let i = 0; i < locs.length; i += batchSize) {
    const batch = locs.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(validateUrl));
    results.forEach(res => {
      rows.push(res.row);
      if (res.isPass) passCount++;
      else failCount++;
    });
    console.log(`Procesadas ${Math.min(i + batchSize, locs.length)}/${locs.length} URLs... (${passCount} PASS, ${failCount} FAIL)`);
  }

  const seoDir = path.join(__dirname, '../seo');
  if (!fs.existsSync(seoDir)) fs.mkdirSync(seoDir, { recursive: true });

  fs.writeFileSync(path.join(seoDir, 'FULL_SITEMAP_VALIDATION.csv'), rows.join('\n'));
  console.log(`Validación sitemap completa guardada en seo/FULL_SITEMAP_VALIDATION.csv. Total: ${locs.length}, PASS: ${passCount}, FAIL: ${failCount}`);
})();
