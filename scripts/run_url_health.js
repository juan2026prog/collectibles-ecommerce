// URL Health Check Script across all 5 sub-sitemaps
const BASE = 'https://collectibles.uy';

async function fetchLocs(sitemapUrl) {
  const res = await fetch(sitemapUrl, { cache: 'no-store' });
  const text = await res.text();
  const locs = [];
  const re = /<loc>(.*?)<\/loc>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    locs.push(m[1].trim());
  }
  return locs;
}

async function main() {
  const pagesLocs = await fetchLocs(`${BASE}/sitemap-pages.xml`);
  const academyLocs = await fetchLocs(`${BASE}/sitemap-academy.xml`);
  const categoriesLocs = await fetchLocs(`${BASE}/sitemap-categories.xml`);
  const brandsLocs = await fetchLocs(`${BASE}/sitemap-brands.xml`);
  const productsLocs = await fetchLocs(`${BASE}/sitemap-products.xml`);

  console.log('Pages URLs:', pagesLocs.length);
  console.log('Academy URLs:', academyLocs.length);
  console.log('Categories URLs:', categoriesLocs.length);
  console.log('Brands URLs:', brandsLocs.length);
  console.log('Products URLs:', productsLocs.length);

  const sample = [
    ...pagesLocs,
    ...academyLocs,
    ...categoriesLocs.slice(0, 20),
    ...brandsLocs.slice(0, 20),
    ...productsLocs.slice(0, 30)
  ];

  console.log(`\nTesting sample of ${sample.length} live URLs...`);

  let redirects = 0;
  let notFound = 0;
  let gone = 0;
  let noindex = 0;
  let queryParams = 0;
  let canonicalMismatch = 0;

  for (const u of sample) {
    if (u.includes('?')) queryParams++;

    const res = await fetch(u, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cache-Control': 'no-cache, no-store'
      }
    });

    if (res.status >= 300 && res.status < 400) redirects++;
    if (res.status === 404) notFound++;
    if (res.status === 410) gone++;

    const body = await res.text();
    if (body.toLowerCase().includes('name="robots" content="noindex')) noindex++;

    const p1 = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i;
    const p2 = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i;
    const m = body.match(p1) || body.match(p2);
    const can = m ? m[1].trim() : '';

    if (!can || can.replace(/\/$/, '') !== u.replace(/\/$/, '')) {
      console.log(`Canonical mismatch on: ${u} -> Canonical: ${can}`);
      canonicalMismatch++;
    }
  }

  console.log('\n=== HEALTH CHECK RESULTS ===');
  console.log('Tested URLs:', sample.length);
  console.log('Redirects (3xx):', redirects);
  console.log('404 Not Found:', notFound);
  console.log('410 Gone:', gone);
  console.log('Noindex Tags:', noindex);
  console.log('Query Params:', queryParams);
  console.log('Canonical Mismatches:', canonicalMismatch);
}

main().catch(console.error);
