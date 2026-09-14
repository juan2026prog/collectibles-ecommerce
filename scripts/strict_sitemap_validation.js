// Strict Validation Script for Collectibles.uy Sitemaps and Robots
// Executes all verification steps directly against production

const BASE = 'https://collectibles.uy';

async function fetchRaw(url, options = {}) {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cache-Control': 'no-cache, no-store',
        ...options.headers
      }
    });
    const ct = res.headers.get('content-type') || '';
    const loc = res.headers.get('location') || '';
    const ver = res.headers.get('x-seo-version') || '';
    const text = await res.text();
    return { status: res.status, contentType: ct, location: loc, version: ver, body: text };
  } catch (e) {
    return { status: 0, contentType: '', location: '', version: '', body: '', error: e.message };
  }
}

function parseLocs(xml) {
  const locs = [];
  const re = /<loc>(.*?)<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1].trim());
  }
  return locs;
}

function isHtml(body) {
  return /<html|<div id="root"|<!doctype html/i.test(body);
}

function isWellFormedXml(body, rootTag) {
  if (!body.startsWith('<?xml')) return false;
  if (!body.includes(`<${rootTag}`)) return false;
  if (!body.includes(`</${rootTag}>`)) return false;
  return true;
}

async function run() {
  console.log('=== REAL PRODUCTION VALIDATION FOR SITEMAPS AND ROBOTS ===\n');

  const sitemapsToTest = [
    { url: `${BASE}/sitemap.xml`, expectedType: 'sitemapindex', name: '/sitemap.xml' },
    { url: `${BASE}/sitemap_index.xml`, expectedType: 'sitemapindex', name: '/sitemap_index.xml' },
    { url: `${BASE}/sitemap-products.xml`, expectedType: 'urlset', name: '/sitemap-products.xml' },
    { url: `${BASE}/sitemap-categories.xml`, expectedType: 'urlset', name: '/sitemap-categories.xml' },
    { url: `${BASE}/sitemap-brands.xml`, expectedType: 'urlset', name: '/sitemap-brands.xml' },
    { url: `${BASE}/sitemap-academy.xml`, expectedType: 'urlset', name: '/sitemap-academy.xml' },
    { url: `${BASE}/sitemap-pages.xml`, expectedType: 'urlset', name: '/sitemap-pages.xml' },
  ];

  const results = {};
  const allSubSitemapUrls = [];
  const countPerType = {
    products: 0,
    categories: 0,
    brands: 0,
    academy: 0,
    pages: 0
  };

  let allPass = true;

  for (const item of sitemapsToTest) {
    const res = await fetchRaw(item.url);
    const hasHtmlFallback = isHtml(res.body);
    const validXml = isWellFormedXml(res.body, item.expectedType);
    const locs = parseLocs(res.body);

    const isOk = res.status === 200 && res.contentType.includes('xml') && !hasHtmlFallback && validXml;
    if (!isOk) allPass = false;

    results[item.name] = {
      status: res.status,
      contentType: res.contentType,
      version: res.version,
      hasHtmlFallback,
      validXml,
      type: item.expectedType === 'sitemapindex' ? 'SitemapIndex' : 'UrlSet',
      count: locs.length,
      locs: locs
    };

    if (item.name === '/sitemap-products.xml') countPerType.products = locs.length;
    if (item.name === '/sitemap-categories.xml') countPerType.categories = locs.length;
    if (item.name === '/sitemap-brands.xml') countPerType.brands = locs.length;
    if (item.name === '/sitemap-academy.xml') countPerType.academy = locs.length;
    if (item.name === '/sitemap-pages.xml') countPerType.pages = locs.length;

    if (item.expectedType === 'urlset') {
      allSubSitemapUrls.push(...locs);
    }
  }

  // Fallback test: /sitemap-cualquiercosa.xml
  const fallbackRes = await fetchRaw(`${BASE}/sitemap-cualquiercosa.xml`);
  const fallbackHasHtml = isHtml(fallbackRes.body);
  const fallbackIs404 = fallbackRes.status === 404 && !fallbackHasHtml;

  // Duplicate analysis
  const uniqueUrls = new Set(allSubSitemapUrls);
  const duplicatesCount = allSubSitemapUrls.length - uniqueUrls.size;
  const sumOfParts = countPerType.products + countPerType.categories + countPerType.brands + countPerType.academy + countPerType.pages;

  // URL Health validation (sample from each)
  const sampleUrls = [
    ...results['/sitemap-pages.xml'].locs.slice(0, 5),
    ...results['/sitemap-academy.xml'].locs.slice(0, 5),
    ...results['/sitemap-brands.xml'].locs.slice(0, 5),
    ...results['/sitemap-categories.xml'].locs.slice(0, 5),
    ...results['/sitemap-products.xml'].locs.slice(0, 10),
  ];

  let redirectCount = 0;
  let notFoundCount = 0;
  let goneCount = 0;
  let noindexCount = 0;
  let queryParamCount = 0;
  let canonicalMismatchCount = 0;

  for (const u of sampleUrls) {
    if (u.includes('?')) queryParamCount++;
    const r = await fetchRaw(u);
    if (r.status >= 300 && r.status < 400) redirectCount++;
    if (r.status === 404) notFoundCount++;
    if (r.status === 410) goneCount++;
    if (r.body.toLowerCase().includes('name="robots" content="noindex')) noindexCount++;
    
    // Canonical match
    const canMatch = r.body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    const canUrl = canMatch ? canMatch[1].trim() : '';
    if (canUrl && canUrl.replace(/\/$/, '') !== u.replace(/\/$/, '')) {
      canonicalMismatchCount++;
    }
  }

  // Robots.txt verification
  const robotsRes = await fetchRaw(`${BASE}/robots.txt`);

  console.log(JSON.stringify({
    allPass,
    results,
    fallbackTest: {
      status: fallbackRes.status,
      hasHtml: fallbackHasHtml,
      is404: fallbackIs404
    },
    counts: {
      ...countPerType,
      sum: sumOfParts,
      totalUrls: allSubSitemapUrls.length,
      uniqueUrls: uniqueUrls.size,
      duplicates: duplicatesCount
    },
    health: {
      tested: sampleUrls.length,
      redirects: redirectCount,
      notFound: notFoundCount,
      gone: goneCount,
      noindex: noindexCount,
      queryParams: queryParamCount,
      canonicalMismatch: canonicalMismatchCount
    },
    robots: robotsRes.body
  }, null, 2));
}

run().catch(console.error);
