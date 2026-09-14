// Complete Live Validation Audit against https://collectibles.uy
import fs from 'fs';

const BASE = 'https://collectibles.uy';

async function fetchManual(url, headers = {}) {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cache-Control': 'no-cache, no-store',
        ...headers
      }
    });
    const location = res.headers.get('location') || '';
    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();
    return { status: res.status, location, contentType, body, headers: Object.fromEntries(res.headers.entries()) };
  } catch (e) {
    return { status: 0, location: '', contentType: '', body: '', error: e.message };
  }
}

async function fetchFollow(url, headers = {}) {
  try {
    let currentUrl = url;
    let hops = 0;
    const history = [];

    while (hops < 5) {
      const res = await fetch(currentUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Cache-Control': 'no-cache, no-store',
          ...headers
        }
      });
      const loc = res.headers.get('location');
      history.push({ url: currentUrl, status: res.status, location: loc });

      if (res.status >= 300 && res.status < 400 && loc) {
        currentUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).href;
        hops++;
      } else {
        const body = await res.text();
        return { finalUrl: currentUrl, status: res.status, hops, history, body };
      }
    }
    return { finalUrl: currentUrl, status: 0, hops, history, error: 'Too many redirects' };
  } catch (e) {
    return { finalUrl: url, status: 0, hops: 0, history: [], error: e.message };
  }
}

function extractMeta(html, name) {
  const p1 = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
  const p2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i');
  const m = html.match(p1) || html.match(p2);
  return m ? m[1].trim() : '(no configurado)';
}

function extractCanonical(html) {
  const p1 = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i;
  const p2 = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i;
  const m = html.match(p1) || html.match(p2);
  return m ? m[1].trim() : '(no encontrado)';
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '(sin título)';
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '(H1 en DOM)';
}

function extractJsonLd(html) {
  const schemas = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      schemas.push(JSON.parse(m[1]));
    } catch (e) {}
  }
  return schemas;
}

async function getSitemapLocs(url) {
  const res = await fetchManual(url);
  if (res.status !== 200) return [];
  const locs = [];
  const re = /<loc>(.*?)<\/loc>/gi;
  let m;
  while ((m = re.exec(res.body)) !== null) {
    locs.push(m[1].trim());
  }
  return locs;
}

async function runAudit() {
  console.log('>>> FETCHING SITEMAPS...');
  const indexLocs = await getSitemapLocs(`${BASE}/sitemap.xml`);
  console.log('SitemapIndex locs:', indexLocs);

  const productLocs = await getSitemapLocs(`${BASE}/sitemap-products.xml`);
  const categoryLocs = await getSitemapLocs(`${BASE}/sitemap-categories.xml`);
  const brandLocs = await getSitemapLocs(`${BASE}/sitemap-brands.xml`);
  const academyLocs = await getSitemapLocs(`${BASE}/sitemap-academy.xml`);
  const pageLocs = await getSitemapLocs(`${BASE}/sitemap-pages.xml`);

  const allLocs = [...productLocs, ...categoryLocs, ...brandLocs, ...academyLocs, ...pageLocs];
  const allLocsSet = new Set(allLocs);

  console.log(`Counts -> Products: ${productLocs.length}, Categories: ${categoryLocs.length}, Brands: ${brandLocs.length}, Academy: ${academyLocs.length}, Pages: ${pageLocs.length}`);
  console.log(`Sum: ${allLocs.length}, Unique: ${allLocsSet.size}, Duplicates: ${allLocs.length - allLocsSet.size}`);

  // 1. PROBAR URLS NUEVAS
  console.log('\n>>> 1. PROBANDO URLS NUEVAS (10 productos, 5 marcas, 5 categorías, /academy, /shop, /)...');
  const sampleProducts = productLocs.slice(0, 10);
  const sampleBrands = brandLocs.slice(0, 5);
  const sampleCategories = categoryLocs.filter(u => u.includes('/categoria/')).slice(0, 5);
  const corePages = [`${BASE}/academy`, `${BASE}/shop`, `${BASE}/`];

  const section1Urls = [...sampleProducts, ...sampleBrands, ...sampleCategories, ...corePages];
  const section1 = [];

  for (const u of section1Urls) {
    const res = await fetchManual(u);
    const title = extractTitle(res.body);
    const canonical = extractCanonical(res.body);
    const robots = extractMeta(res.body, 'robots');
    const h1 = extractH1(res.body);
    const inSM = allLocsSet.has(u) || (u === `${BASE}/` && allLocsSet.has(BASE)) ? 'sí' : 'no';

    section1.push({
      url: u,
      status: res.status,
      canonical,
      robots: robots === '(no configurado)' ? 'index, follow (default)' : robots,
      title,
      h1,
      inSitemap: inSM
    });
  }

  // 2. PROBAR URLS ANTIGUAS
  console.log('\n>>> 2. PROBANDO URLS ANTIGUAS (Migraciones 301/308)...');
  const legacyUrls = [
    `${BASE}/product/neca-ultimate-chucky`,
    `${BASE}/product/figura-chucky-neca`,
    `${BASE}/p/peluche-gashouse-pat-ootie`,
    `${BASE}/p/chucky-tv-series-neca`,
    `${BASE}/brand/neca`,
    `${BASE}/brand/hasbro`,
    `${BASE}/brand/funko`,
    `${BASE}/product-category/figuras-de-accion`,
    `${BASE}/product-category/llaveros`,
    `${BASE}/product-category/tcg`,
    `${BASE}/temas/terror`,
    `${BASE}/about`,
    `${BASE}/terms`,
    `${BASE}/privacy`,
    `${BASE}/importaciones`,
    `${BASE}/franquicias`
  ];

  const section2 = [];
  for (const u of legacyUrls) {
    const trace = await fetchFollow(u);
    section2.push({
      oldUrl: u,
      status: trace.history[0]?.status || 0,
      location: trace.history[0]?.location || '(none)',
      finalUrl: trace.finalUrl,
      hops: trace.hops
    });
  }

  // 3. PROBAR 404 Y 410
  console.log('\n>>> 3. PROBANDO 404 Y 410...');
  const errorUrls = [
    { url: `${BASE}/producto/producto-inexistente-9999999`, expected: '404' },
    { url: `${BASE}/marca/marca-que-no-existe-xyz`, expected: '404' },
    { url: `${BASE}/categoria/categoria-inventada-xyz`, expected: '404' },
    { url: `${BASE}/page/pagina-que-no-existe-999`, expected: '404' },
    { url: `${BASE}/ruta-completamente-inventada-123456`, expected: '404' },
    { url: `${BASE}/sample-page`, expected: '410' },
    { url: `${BASE}/wp-login.php`, expected: '410' },
    { url: `${BASE}/wp-admin/`, expected: '410' },
    { url: `${BASE}/feed`, expected: '410' },
    { url: `${BASE}/author/admin`, expected: '410' },
    { url: `${BASE}/2024/01/post-viejo`, expected: '410' }
  ];

  const section3 = [];
  for (const item of errorUrls) {
    const res = await fetchManual(item.url);
    const robots = extractMeta(res.body, 'robots');
    section3.push({
      url: item.url,
      status: res.status,
      expected: item.expected,
      robots: robots
    });
  }

  // 4. VERIFICAR PARÁMETROS
  console.log('\n>>> 4. VERIFICANDO PARÁMETROS DE QUERY...');
  const paramUrls = [
    `${BASE}/shop?orderby=price`,
    `${BASE}/shop?category-view-mode=grid`,
    `${BASE}/shop?product_col_large=4`,
    `${BASE}/shop?add-to-cart=12345`,
    `${BASE}/?add-to-cart=99`
  ];

  const section4 = [];
  for (const u of paramUrls) {
    const res = await fetchManual(u);
    const canonical = extractCanonical(res.body);
    const robots = extractMeta(res.body, 'robots');
    section4.push({
      url: u,
      status: res.status,
      canonical,
      robots
    });
  }

  // 5. BASURA JS
  console.log('\n>>> 5. BUSCANDO BASURA JS...');
  const homeRes = await fetchManual(`${BASE}/`);
  const jsGarbageMatches = homeRes.body.match(/assets\/[a-zA-Z0-9_-]+\.js:\d+:\d+/g) || [];

  // 7. ROBOTS.TXT
  console.log('\n>>> 7. OBTENIENDO ROBOTS.TXT...');
  const robotsRes = await fetchManual(`${BASE}/robots.txt`);

  // 9. ENLACES INTERNOS (Crawl desde home)
  console.log('\n>>> 9. AUDITANDO ENLACES INTERNOS EN HOME...');
  const hrefs = [];
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let hm;
  while ((hm = hrefRegex.exec(homeRes.body)) !== null) {
    hrefs.push(hm[1]);
  }

  const legacyInternalHrefs = {
    product: hrefs.filter(h => h.includes('/product/')),
    p: hrefs.filter(h => h.includes('/p/')),
    brand: hrefs.filter(h => h.includes('/brand/')),
    productCategory: hrefs.filter(h => h.includes('/product-category/')),
    addToCart: hrefs.filter(h => h.includes('add-to-cart='))
  };

  // 10. RENDERIZADO SEO (HTML inicial)
  console.log('\n>>> 10. VERIFICANDO RENDERIZADO SEO...');
  const ssrTestUrls = [
    `${BASE}/`,
    sampleProducts[0],
    sampleBrands[0],
    sampleCategories[0],
    `${BASE}/academy`
  ];
  const section10 = [];
  for (const u of ssrTestUrls) {
    const res = await fetchManual(u);
    const title = extractTitle(res.body);
    const desc = extractMeta(res.body, 'description');
    const can = extractCanonical(res.body);
    const rob = extractMeta(res.body, 'robots');
    const h1 = extractH1(res.body);
    const schemas = extractJsonLd(res.body);
    section10.push({
      url: u,
      title,
      description: desc,
      canonical: can,
      robots: rob,
      h1,
      hasJsonLd: schemas.length > 0,
      jsonLdTypes: schemas.map(s => s['@type'] || (Array.isArray(s) ? s.map(x => x['@type']) : 'unknown'))
    });
  }

  // 11. PRODUCT SCHEMA (10 productos)
  console.log('\n>>> 11. VERIFICANDO PRODUCT SCHEMA EN 10 PRODUCTOS...');
  const section11 = [];
  for (const u of sampleProducts) {
    const res = await fetchManual(u);
    const schemas = extractJsonLd(res.body);
    const prodSchema = schemas.find(s => s['@type'] === 'Product' || (Array.isArray(s) && s.find(x => x['@type'] === 'Product')));
    section11.push({
      url: u,
      hasProductSchema: Boolean(prodSchema),
      schema: prodSchema || null
    });
  }

  // 14. WWW Y HTTP CANONICALIZATION
  console.log('\n>>> 14. COMPROBANDO WWW Y HTTP...');
  const domainTests = [
    'http://collectibles.uy',
    'http://www.collectibles.uy',
    'https://www.collectibles.uy'
  ];
  const section14 = [];
  for (const d of domainTests) {
    const trace = await fetchFollow(d);
    section14.push({
      input: d,
      initialStatus: trace.history[0]?.status,
      initialLocation: trace.history[0]?.location,
      finalUrl: trace.finalUrl,
      hops: trace.hops
    });
  }

  const finalOutput = {
    section1,
    section2,
    section3,
    section4,
    section5: { jsGarbageMatchesCount: jsGarbageMatches.length },
    section6: {
      sitemaps: {
        index: indexLocs.length,
        products: productLocs.length,
        categories: categoryLocs.length,
        brands: brandLocs.length,
        academy: academyLocs.length,
        pages: pageLocs.length,
        total: allLocs.length,
        unique: allLocsSet.size,
        duplicates: allLocs.length - allLocsSet.size
      }
    },
    section7: { robotsTxt: robotsRes.body },
    section9: legacyInternalHrefs,
    section10,
    section11,
    section14
  };

  fs.writeFileSync('scripts/final_audit_results.json', JSON.stringify(finalOutput, null, 2));
  console.log('\n>>> AUDIT COMPLETED SUCCESSFULLY. Results written to scripts/final_audit_results.json');
}

runAudit().catch(console.error);
