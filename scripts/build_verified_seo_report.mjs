import fs from 'fs';

const sitemaps = [
  { name: 'Productos', url: 'https://collectibles.uy/sitemap-products.xml' },
  { name: 'Categorías', url: 'https://collectibles.uy/sitemap-categories.xml' },
  { name: 'Marcas', url: 'https://collectibles.uy/sitemap-brands.xml' },
  { name: 'Academy', url: 'https://collectibles.uy/sitemap-academy.xml' },
  { name: 'Páginas', url: 'https://collectibles.uy/sitemap-pages.xml' }
];

async function generate() {
  const urlToType = new Map();
  const allUrls = [];

  for (const s of sitemaps) {
    const res = await fetch(s.url);
    const xml = await res.text();
    const locs = (xml.match(/<loc>(.*?)<\/loc>/g) || []).map(m => m.replace(/<\/?loc>/g, '').trim());
    for (const u of locs) {
      if (!urlToType.has(u)) {
        urlToType.set(u, s.name);
        allUrls.push(u);
      }
    }
  }

  const cache = JSON.parse(fs.readFileSync('seo/gsc_full_inspection_cache.json', 'utf8'));

  const verifiedResults = {};
  const priorityList = [];

  let indexedCount = 0;
  let discoveredCount = 0;
  let crawledCount = 0;
  let unknownCount = 0;
  let pendingQuotaCount = 0;

  for (const url of allUrls) {
    const type = urlToType.get(url);
    const item = cache[url];

    if (!item || item.error || item.httpStatus === 429) {
      pendingQuotaCount++;
      verifiedResults[url] = {
        url,
        tipo: type,
        verdict: 'PENDING_QUOTA',
        coverageState: 'Pending GSC API Quota Reset',
        indexingState: 'UNKNOWN',
        pageFetchState: 'UNKNOWN',
        robotsTxtState: 'UNKNOWN',
        lastCrawlTime: null,
        googleCanonical: null,
        userCanonical: null,
        crawledAs: null,
        referringUrls: [],
        motivo: 'Cuota diaria de Google Search Console URL Inspection API alcanzada (HTTP 429: Quota exceeded)'
      };

      priorityList.push({
        url,
        tipo: type,
        estadoActualGoogle: 'Pending GSC API Quota Reset',
        tecnicamenteLista: 'si'
      });
    } else {
      const verd = (item.verdict || '').toUpperCase();
      const cov = (item.coverageState || '').trim();

      verifiedResults[url] = {
        url,
        tipo: type,
        verdict: item.verdict || 'UNKNOWN',
        coverageState: item.coverageState || 'UNKNOWN',
        indexingState: item.indexingState || 'UNKNOWN',
        pageFetchState: item.pageFetchState || 'UNKNOWN',
        robotsTxtState: item.robotsTxtState || 'UNKNOWN',
        lastCrawlTime: item.lastCrawlTime || null,
        googleCanonical: item.googleCanonical || null,
        userCanonical: item.userCanonical || null,
        crawledAs: item.crawledAs || null,
        referringUrls: item.referringUrls || []
      };

      if (verd === 'PASS' || cov.toLowerCase().includes('submitted and indexed')) {
        indexedCount++;
      } else {
        if (cov === 'Crawled - currently not indexed') crawledCount++;
        else if (cov === 'Discovered - currently not indexed') discoveredCount++;
        else unknownCount++;

        priorityList.push({
          url,
          tipo: type,
          estadoActualGoogle: cov || 'URL is unknown to Google',
          tecnicamenteLista: 'si'
        });
      }
    }
  }

  const p1 = [];
  const p2 = [];
  const p3 = [];

  for (const item of priorityList) {
    if (item.tipo === 'Páginas' || item.tipo === 'Marcas') {
      p1.push({ prioridad: 1, ...item });
    } else if (item.tipo === 'Categorías' || item.tipo === 'Academy') {
      p2.push({ prioridad: 2, ...item });
    } else {
      p3.push({ prioridad: 3, ...item });
    }
  }

  const fullPriority = [...p1, ...p2, ...p3];

  fs.writeFileSync('seo/gsc_full_verified_results.json', JSON.stringify(verifiedResults, null, 2), 'utf8');
  fs.writeFileSync('seo/manual-indexation-priority.json', JSON.stringify(fullPriority, null, 2), 'utf8');
  
  const lines = fullPriority.map(p => `[P${p.prioridad}] ${p.url} (${p.tipo} - Google: ${p.estadoActualGoogle})`);
  fs.writeFileSync('seo/manual-indexation-priority.txt', lines.join('\n'), 'utf8');

  console.log('===============================================================');
  console.log('📊 REPORTE DE INSPECCIÓN GSC CONSOLIDADO Y VERIFICADO');
  console.log('===============================================================');
  console.log('Total URLs en Sitemaps:            ', allUrls.length);
  console.log('URLs Indexadas en Google (PASS):   ', indexedCount);
  console.log('URLs Descubiertas no indexadas:    ', discoveredCount);
  console.log('URLs Rastreadas no indexadas:      ', crawledCount);
  console.log('URLs Desconocidas para Google:     ', unknownCount);
  console.log('Pendientes por Cuota GSC API (429):', pendingQuotaCount);
  console.log('---------------------------------------------------------------');
  console.log('TOTAL VERIFICADO / CLASIFICADO:    ', indexedCount + discoveredCount + crawledCount + unknownCount + pendingQuotaCount);
  console.log('TOTAL A SOLICITAR INDEXACIÓN:      ', fullPriority.length);
  console.log('  - Prioridad 1 (Pages/Marcas):    ', p1.length);
  console.log('  - Prioridad 2 (Academy/Cats):    ', p2.length);
  console.log('  - Prioridad 3 (Productos):       ', p3.length);
  console.log('===============================================================');
}

generate();
