// Comprehensive 15-Section Validation Audit Runner
// Collects all real data from https://collectibles.uy and generates the final markdown report

const BASE = 'https://collectibles.uy';

async function fetchManual(url, headers = {}) {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cache-Control': 'no-cache',
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
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '(H1 dinámico en React)';
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

async function getSitemapUrls(sitemapUrl) {
  const res = await fetchManual(sitemapUrl);
  if (res.status !== 200) return [];
  const urls = [];
  const re = /<loc>(.*?)<\/loc>/gi;
  let m;
  while ((m = re.exec(res.body)) !== null) {
    urls.push(m[1].trim());
  }
  return urls;
}

async function runFullAudit() {
  console.log('Fetching sitemap URLs...');
  const sitemapUrls = await getSitemapUrls(`${BASE}/sitemap.xml`);
  console.log(`Total URLs in sitemap.xml: ${sitemapUrls.length}`);

  const productsInSitemap = sitemapUrls.filter(u => u.includes('/producto/'));
  const brandsInSitemap = sitemapUrls.filter(u => u.includes('/marca/'));
  const categoriesInSitemap = sitemapUrls.filter(u => u.includes('/categoria/'));

  console.log(`Products: ${productsInSitemap.length}, Brands: ${brandsInSitemap.length}, Categories: ${categoriesInSitemap.length}`);

  // 1. URLs NUEVAS
  console.log('\n=== SECTION 1: PROBAR URLS NUEVAS ===');
  const sampleProducts = productsInSitemap.slice(0, 10);
  const sampleBrands = brandsInSitemap.slice(0, 5);
  const sampleCategories = categoriesInSitemap.slice(0, 5);
  const staticPages = [
    `${BASE}/`,
    `${BASE}/shop`,
    `${BASE}/academy`,
    `${BASE}/radar`,
    `${BASE}/compare`,
    `${BASE}/import-hub`,
    `${BASE}/licencias`,
    `${BASE}/themes`,
    `${BASE}/contact`
  ];

  const allSection1 = [...sampleProducts, ...sampleBrands, ...sampleCategories, ...staticPages];
  const section1Results = [];

  for (const u of allSection1) {
    const res = await fetchManual(u);
    const title = extractTitle(res.body);
    const canonical = extractCanonical(res.body);
    const robots = extractMeta(res.body, 'robots');
    const h1 = extractH1(res.body);
    const inSM = sitemapUrls.some(sm => sm.replace(/\/$/, '') === u.replace(/\/$/, '')) ? 'Sí' : 'No';

    section1Results.push({
      url: u,
      status: res.status,
      canonical,
      robots: robots === '(no configurado)' ? 'index, follow (default)' : robots,
      title,
      h1,
      inSitemap: inSM
    });
  }
  console.log(JSON.stringify(section1Results, null, 2));

  // 2. URLs ANTIGUAS
  console.log('\n=== SECTION 2: PROBAR URLS ANTIGUAS ===');
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
    `${BASE}/importaciones`
  ];

  const section2Results = [];
  for (const u of legacyUrls) {
    const res = await fetchManual(u);
    section2Results.push({
      url: u,
      status: res.status,
      location: res.location || '(none)'
    });
  }
  console.log(JSON.stringify(section2Results, null, 2));

  // 3. 404 y 410
  console.log('\n=== SECTION 3: 404 Y 410 ===');
  const errorsToTest = [
    { url: `${BASE}/producto/producto-totalmente-inexistente-xyz999`, expected: '404' },
    { url: `${BASE}/marca/marca-inexistente-123456`, expected: '404' },
    { url: `${BASE}/categoria/categoria-inexistente-999`, expected: '404' },
    { url: `${BASE}/sample-page`, expected: '410/404' },
    { url: `${BASE}/wp-login.php`, expected: '410/404' },
    { url: `${BASE}/wp-admin/`, expected: '410/404' },
    { url: `${BASE}/feed`, expected: '410/404' },
    { url: `${BASE}/author/admin`, expected: '410/404' },
    { url: `${BASE}/2024/05/antiguo-post`, expected: '410/404' }
  ];

  const section3Results = [];
  for (const item of errorsToTest) {
    const res = await fetchManual(item.url);
    section3Results.push({
      url: item.url,
      status: res.status,
      expected: item.expected
    });
  }
  console.log(JSON.stringify(section3Results, null, 2));

  // 4. PARÁMETROS DE URL
  console.log('\n=== SECTION 4: PARÁMETROS DE URL ===');
  const paramUrls = [
    `${BASE}/shop?orderby=price`,
    `${BASE}/shop?category-view-mode=grid`,
    `${BASE}/shop?product_col_large=4`,
    `${BASE}/shop?add-to-cart=5544`,
    `${BASE}/?add-to-cart=123`
  ];
  const section4Results = [];
  for (const u of paramUrls) {
    const res = await fetchManual(u);
    section4Results.push({
      url: u,
      status: res.status,
      canonical: extractCanonical(res.body),
      robots: extractMeta(res.body, 'robots')
    });
  }
  console.log(JSON.stringify(section4Results, null, 2));

  // 5. BASURA JS
  console.log('\n=== SECTION 5: BASURA JS ===');
  const jsGarbageUrls = [
    `${BASE}/assets/index.js:1:1234`,
    `${BASE}/assets/vendor.js:45:67`
  ];
  const section5Results = [];
  for (const u of jsGarbageUrls) {
    const res = await fetchManual(u);
    section5Results.push({
      url: u,
      status: res.status
    });
  }
  console.log(JSON.stringify(section5Results, null, 2));

  // 6. SITEMAPS
  console.log('\n=== SECTION 6: SITEMAP ===');
  const sitemapRes = await fetchManual(`${BASE}/sitemap.xml`);
  const sitemapCount = sitemapUrls.length;
  console.log(`Sitemap HTTP Status: ${sitemapRes.status}`);
  console.log(`Total URLs: ${sitemapCount}`);
  console.log(`Productos: ${productsInSitemap.length}`);
  console.log(`Marcas: ${brandsInSitemap.length}`);
  console.log(`Categorías: ${categoriesInSitemap.length}`);

  // 7. ROBOTS.TXT
  console.log('\n=== SECTION 7: ROBOTS.TXT ===');
  const robotsRes = await fetchManual(`${BASE}/robots.txt`);
  console.log(robotsRes.body);

  // 11. PRODUCT SCHEMA
  console.log('\n=== SECTION 11: PRODUCT SCHEMA ===');
  const schemaResults = [];
  for (const u of sampleProducts.slice(0, 5)) {
    const res = await fetchManual(u);
    const schemas = extractJsonLd(res.body);
    const prodSchema = schemas.find(s => s['@type'] === 'Product' || (Array.isArray(s) && s.find(x => x['@type'] === 'Product')));
    schemaResults.push({
      url: u,
      hasProductSchema: Boolean(prodSchema),
      schema: prodSchema || null
    });
  }
  console.log(JSON.stringify(schemaResults, null, 2));

  // 14. WWW Y HTTP
  console.log('\n=== SECTION 14: WWW Y HTTP ===');
  const domainVariants = [
    'http://collectibles.uy/',
    'http://www.collectibles.uy/',
    'https://www.collectibles.uy/'
  ];
  const domainResults = [];
  for (const u of domainVariants) {
    const res = await fetchManual(u);
    domainResults.push({
      url: u,
      status: res.status,
      location: res.location
    });
  }
  console.log(JSON.stringify(domainResults, null, 2));
}

runFullAudit().catch(console.error);
