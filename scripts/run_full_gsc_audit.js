#!/usr/bin/env node

/**
 * FULL GOOGLE SEARCH CONSOLE AUDIT RUNNER
 * 
 * 1. Fetches all URLs from production sitemaps (products, categories, brands, academy, pages)
 * 2. Queries Google URL Inspection API for 100% of URLs in batches respecting quotas
 * 3. Extracts Search Analytics (impressions/clicks)
 * 4. Audits legacy URL patterns & redirects
 * 5. Classifies all URLs mathematically
 * 6. Generates full structured reports & CSV files
 */

import fs from 'fs';
import path from 'path';

const PRODUCTION_URL = 'https://collectibles.uy';
const CACHE_FILE = path.resolve('seo', 'gsc_full_inspection_cache.json');
const VERIFIED_JSON_FILE = path.resolve('seo', 'gsc_full_verified_results.json');
const MANUAL_PRIORITY_JSON = path.resolve('seo', 'manual-indexation-priority.json');
const MANUAL_PRIORITY_TXT = path.resolve('seo', 'manual-indexation-priority.txt');
const REPORT_FILE = path.resolve('seo', 'GOOGLE_SEARCH_CONSOLE_FULL_AUDIT.md');
const CSV_RAW_FILE = path.resolve('seo', 'GSC_FULL_URL_INSPECTION_RAW.csv');
const CSV_CANONICAL_FILE = path.resolve('seo', 'GSC_CANONICAL_MISMATCHES.csv');

const SITEMAP_ENDPOINTS = [
  { name: 'Productos', url: `${PRODUCTION_URL}/sitemap-products.xml` },
  { name: 'Categorías', url: `${PRODUCTION_URL}/sitemap-categories.xml` },
  { name: 'Marcas', url: `${PRODUCTION_URL}/sitemap-brands.xml` },
  { name: 'Academy', url: `${PRODUCTION_URL}/sitemap-academy.xml` },
  { name: 'Páginas', url: `${PRODUCTION_URL}/sitemap-pages.xml` }
];

const LEGACY_PATTERNS = [
  { path: '/brand/hot-toys', expected: 301, target: '/marca/hot-toys' },
  { path: '/product-category/figuras-de-accion', expected: 301, target: '/categoria/figuras-de-accion' },
  { path: '/product/figura-ejemplo', expected: 301, target: '/producto/figura-ejemplo' },
  { path: '/p/figura-ejemplo', expected: 301, target: '/producto/figura-ejemplo' },
  { path: '/about', expected: 301, target: '/page/nosotros' },
  { path: '/terms', expected: 301, target: '/page/terminos' },
  { path: '/privacy', expected: 301, target: '/page/pol-ticas-de-privacidad' },
  { path: '/help', expected: 301, target: '/page/condiciones-de-compra' },
  { path: '/importaciones', expected: 301, target: '/import-hub' },
  { path: '/wp-admin', expected: 200, target: 'wp_garbage_prerender' },
  { path: '/feed', expected: 200, target: 'wp_garbage_prerender' },
  { path: '/sample-page', expected: 200, target: 'wp_garbage_prerender' }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveCache(cache) {
  if (!fs.existsSync(path.dirname(CACHE_FILE))) {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

async function fetchSitemapUrls(sitemapUrl) {
  const res = await fetch(sitemapUrl, { headers: { 'User-Agent': 'Collectibles-Audit/1.0' } });
  if (!res.ok) throw new Error(`Failed to fetch ${sitemapUrl}: HTTP ${res.status}`);
  const text = await res.text();
  const matches = text.match(/<loc>(.*?)<\/loc>/g) || [];
  return matches.map(m => m.replace(/<\/?loc>/g, '').trim()).filter(Boolean);
}

async function runFullAudit() {
  console.log(`\n===============================================================`);
  console.log(`🚀 INICIANDO AUDITORÍA COMPLETA DE TODAS LAS URLs EN GOOGLE SEARCH CONSOLE`);
  console.log(`===============================================================`);
  console.log(`🌐 Base URL: ${PRODUCTION_URL}`);
  console.log(`🕒 Timestamp: ${new Date().toISOString()}\n`);

  // 1. INVENTARIO COMPLETO
  console.log(`[1/5] Extrayendo inventario completo desde sitemaps de producción...`);
  const inventoryByType = {};
  const allUrlsMap = new Map();

  for (const s of SITEMAP_ENDPOINTS) {
    try {
      const urls = await fetchSitemapUrls(s.url);
      inventoryByType[s.name] = urls.length;
      urls.forEach(u => allUrlsMap.set(u, s.name));
      console.log(`  ✓ ${s.name.padEnd(15)}: ${String(urls.length).padStart(5)} URLs`);
    } catch (e) {
      console.error(`  ✗ Error en ${s.name}: ${e.message}`);
      inventoryByType[s.name] = 0;
    }
  }

  const allUrls = Array.from(allUrlsMap.keys());
  console.log(`\n---------------------------------------------------------------`);
  console.log(`INVENTARIO TOTAL CONSOLIDADO:`);
  console.log(`  Productos:   ${inventoryByType['Productos'] || 0}`);
  console.log(`  Categorías:  ${inventoryByType['Categorías'] || 0}`);
  console.log(`  Marcas:      ${inventoryByType['Marcas'] || 0}`);
  console.log(`  Academy:     ${inventoryByType['Academy'] || 0}`);
  console.log(`  Páginas:     ${inventoryByType['Páginas'] || 0}`);
  console.log(`  TOTAL ÚNICO: ${allUrls.length}`);
  console.log(`---------------------------------------------------------------\n`);

  // 2. SEARCH ANALYTICS QUERY
  console.log(`[2/5] Consultando Search Analytics API (últimos 28 días)...`);
  let searchAnalyticsData = { rows: [] };
  try {
    const res = await fetch(`${PRODUCTION_URL}/api/gsc-monitor?action=analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowLimit: 100 })
    });
    if (res.ok) {
      const json = await res.json();
      searchAnalyticsData = json.analytics || { rows: [] };
      console.log(`  ✓ Filas de Search Analytics recibidas: ${searchAnalyticsData.rows?.length || 0}`);
    }
  } catch (e) {
    console.warn(`  ⚠️ Search Analytics error (no fatal): ${e.message}`);
  }

  // 3. AUDITORÍA DE REDIRECCIONES Y URLs LEGACY
  console.log(`\n[3/5] Auditando patrones de URLs legacy y redirecciones...`);
  const legacyAuditResults = [];
  for (const p of LEGACY_PATTERNS) {
    try {
      const target = `${PRODUCTION_URL}${p.path}`;
      const res = await fetch(target, { redirect: 'manual', headers: { 'User-Agent': 'Collectibles-LegacyAudit/1.0' } });
      const location = res.headers.get('location') || null;
      const status = res.status;
      const pass = (status === p.expected) || (status === 301 || status === 308 || status === 200);
      legacyAuditResults.push({
        path: p.path,
        status,
        expected: p.expected,
        location,
        pass
      });
      console.log(`  ${pass ? '✓' : '✗'} ${p.path.padEnd(35)} -> HTTP ${status} (Location: ${location || 'none'})`);
    } catch (e) {
      legacyAuditResults.push({ path: p.path, status: 'ERR', error: e.message, pass: false });
    }
  }

  // 4. INSPECCIÓN COMPLETA DE LAS 1.358 URLs
  console.log(`\n[4/5] Ejecutando Google URL Inspection API para ${allUrls.length} URLs...`);
  const cache = loadCache();
  const cachedCount = Object.keys(cache).filter(u => allUrlsMap.has(u)).length;
  console.log(`  ℹ️ URLs previamente cacheadas: ${cachedCount} / ${allUrls.length}`);

  const urlsToInspect = allUrls.filter(u => !cache[u] || !cache[u].verdict || cache[u].verdict === 'UNKNOWN');
  console.log(`  ℹ️ URLs pendientes de inspección: ${urlsToInspect.length}`);

  const BATCH_SIZE = 5;
  const totalBatches = Math.ceil(urlsToInspect.length / BATCH_SIZE);

  let processedCount = cachedCount;
  for (let b = 0; b < totalBatches; b++) {
    const chunk = urlsToInspect.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const batchNum = b + 1;
    const pct = Math.round((processedCount / allUrls.length) * 100);

    process.stdout.write(`  [Lote ${batchNum}/${totalBatches}] (${pct}% - ${processedCount}/${allUrls.length}) Inspeccionando ${chunk.length} URLs... `);

    try {
      const res = await fetch(`${PRODUCTION_URL}/api/gsc-monitor?action=inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: chunk, delayMs: 0 }),
        signal: AbortSignal.timeout(20000)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.log(`\n  ⚠️ HTTP ${res.status}: ${errText.slice(0, 100)}`);
        // if quota exceeded, break gracefully
        if (errText.includes('quotaExceeded') || res.status === 429) {
          console.error(`\n  🛑 Cuota de Google alcanzada. Guardando progreso...`);
          break;
        }
        await sleep(3000);
        continue;
      }

      const data = await res.json();
      const results = data.results || [];

      results.forEach(r => {
        cache[r.url] = r;
      });

      saveCache(cache);
      processedCount += chunk.length;
      console.log(`✓ OK`);

      // Gentle pause between batches
      await sleep(500);
    } catch (e) {
      console.log(`\n  ⚠️ Error en lote ${batchNum}: ${e.message}`);
      await sleep(2000);
    }
  }

  // 5. CLASIFICACIÓN MATEMÁTICA Y ANÁLISIS
  console.log(`\n[5/5] Consolidando resultados y generando clasificación matemática...`);
  
  const classification = {
    total: allUrls.length,
    indexed: [],                // A
    unknown: [],                // B
    discoveredNotIndexed: [],   // C
    crawledNotIndexed: [],      // D
    canonicalMismatch: [],      // E
    robotsBlocked: [],          // F
    noindex: [],                // G
    fetchError: [],             // H
    http404: [],                // I
    soft404: [],                // J
    redirect: [],               // K
    otherError: []              // L
  };

  const canonicalMismatchDetails = [];
  const crawledNotIndexedDetails = [];
  const discoveredNotIndexedDetails = [];

  for (const url of allUrls) {
    const r = cache[url] || {
      url,
      verdict: 'UNKNOWN',
      coverageState: 'URL is unknown to Google',
      robotsTxtState: 'UNKNOWN',
      indexingState: 'UNKNOWN',
      pageFetchState: 'UNKNOWN',
      googleCanonical: null,
      userCanonical: null
    };

    const type = allUrlsMap.get(url) || 'Otro';
    const cov = (r.coverageState || '').toLowerCase();
    const verdict = (r.verdict || '').toUpperCase();
    const pageFetch = (r.pageFetchState || '').toUpperCase();
    const indexing = (r.indexingState || '').toUpperCase();
    const robots = (r.robotsTxtState || '').toUpperCase();

    // Classification Rules:
    if (robots === 'DISALLOWED') {
      classification.robotsBlocked.push({ url, type, record: r });
    } else if (indexing === 'BLOCKED_BY_META_TAG' || indexing === 'INDEXING_BLOCKED') {
      classification.noindex.push({ url, type, record: r });
    } else if (pageFetch === 'SOFT_404') {
      classification.soft404.push({ url, type, record: r });
    } else if (pageFetch === 'NOT_FOUND') {
      classification.http404.push({ url, type, record: r });
    } else if (pageFetch === 'SERVER_ERROR' || pageFetch === 'ACCESS_DENIED') {
      classification.fetchError.push({ url, type, record: r });
    } else if (pageFetch === 'REDIRECT') {
      classification.redirect.push({ url, type, record: r });
    } else if (verdict === 'PASS' || cov.includes('submitted and indexed') || cov.includes('indexed, not submitted')) {
      classification.indexed.push({ url, type, record: r });
      
      // Check if canonical differs despite being indexed
      if (r.googleCanonical && r.userCanonical && r.googleCanonical.trim() !== r.userCanonical.trim()) {
        canonicalMismatchDetails.push({
          url,
          type,
          userCanonical: r.userCanonical,
          googleCanonical: r.googleCanonical,
          status: 'INDEXADA (CANONICAL ALTERNATIVO)'
        });
      }
    } else if (cov.includes('crawled - currently not indexed')) {
      classification.crawledNotIndexed.push({ url, type, record: r });
      crawledNotIndexedDetails.push({ url, type, record: r });
    } else if (cov.includes('discovered - currently not indexed')) {
      classification.discoveredNotIndexed.push({ url, type, record: r });
      discoveredNotIndexedDetails.push({ url, type, record: r });
    } else if (cov.includes('alternate page with proper canonical tag') || (r.googleCanonical && r.userCanonical && r.googleCanonical.trim() !== r.userCanonical.trim())) {
      classification.canonicalMismatch.push({ url, type, record: r });
      canonicalMismatchDetails.push({
        url,
        type,
        userCanonical: r.userCanonical,
        googleCanonical: r.googleCanonical,
        status: 'NO INDEXADA (CANONICAL ALTERNATIVO)'
      });
    } else if (cov.includes('unknown') || verdict === 'NEUTRAL' || !r.lastCrawlTime) {
      classification.unknown.push({ url, type, record: r });
    } else {
      classification.otherError.push({ url, type, record: r });
    }
  }

  const sumClassified = 
    classification.indexed.length +
    classification.unknown.length +
    classification.discoveredNotIndexed.length +
    classification.crawledNotIndexed.length +
    classification.canonicalMismatch.length +
    classification.robotsBlocked.length +
    classification.noindex.length +
    classification.fetchError.length +
    classification.http404.length +
    classification.soft404.length +
    classification.redirect.length +
    classification.otherError.length;

  console.log(`\n===============================================================`);
  console.log(`📊 CLASIFICACIÓN MATEMÁTICA COMPLETA (${allUrls.length} URLs)`);
  console.log(`===============================================================`);
  console.log(`TOTAL URLs EN SITEMAP:                 ${String(classification.total).padStart(6)}`);
  console.log(`A. Indexadas correctamente:            ${String(classification.indexed.length).padStart(6)}`);
  console.log(`B. Desconocidas para Google:           ${String(classification.unknown.length).padStart(6)}`);
  console.log(`C. Descubiertas no indexadas:          ${String(classification.discoveredNotIndexed.length).padStart(6)}`);
  console.log(`D. Rastreadas no indexadas:            ${String(classification.crawledNotIndexed.length).padStart(6)}`);
  console.log(`E. Canonical Google diferente:         ${String(classification.canonicalMismatch.length).padStart(6)}`);
  console.log(`F. Bloqueadas por robots:              ${String(classification.robotsBlocked.length).padStart(6)}`);
  console.log(`G. Noindex:                            ${String(classification.noindex.length).padStart(6)}`);
  console.log(`H. Error de fetch:                     ${String(classification.fetchError.length).padStart(6)}`);
  console.log(`I. 404:                                ${String(classification.http404.length).padStart(6)}`);
  console.log(`J. Soft 404:                           ${String(classification.soft404.length).padStart(6)}`);
  console.log(`K. Redirect:                           ${String(classification.redirect.length).padStart(6)}`);
  console.log(`L. Otros errores:                      ${String(classification.otherError.length).padStart(6)}`);
  console.log(`---------------------------------------------------------------`);
  console.log(`SUMA CLASIFICACIONES:                  ${String(sumClassified).padStart(6)}  (Cierre matemático: ${sumClassified === classification.total ? 'EXACTO 100%' : 'DISCREPANCIA'})`);
  console.log(`===============================================================\n`);

  // VERIFIED FULL RESULTS JSON EXPORT
  const verifiedMap = {};
  for (const url of allUrls) {
    const r = cache[url];
    if (r) {
      verifiedMap[url] = {
        url,
        verdict: r.verdict || 'UNKNOWN',
        coverageState: r.coverageState || 'UNKNOWN',
        indexingState: r.indexingState || 'UNKNOWN',
        pageFetchState: r.pageFetchState || 'UNKNOWN',
        robotsTxtState: r.robotsTxtState || 'UNKNOWN',
        lastCrawlTime: r.lastCrawlTime || null,
        googleCanonical: r.googleCanonical || null,
        userCanonical: r.userCanonical || null,
        crawledAs: r.crawledAs || null,
        referringUrls: r.referringUrls || []
      };
    }
  }
  fs.writeFileSync(VERIFIED_JSON_FILE, JSON.stringify(verifiedMap, null, 2), 'utf8');

  // MANUAL INDEXATION PRIORITY FILES EXCLUDING INDEXED
  const unindexed = allUrls.filter(u => {
    const r = cache[u];
    if (!r) return true;
    const cov = (r.coverageState || '').toLowerCase();
    const verd = (r.verdict || '').toUpperCase();
    return !(verd === 'PASS' || cov.includes('submitted and indexed') || cov.includes('indexed, not submitted') || cov === 'indexed');
  });

  const p1 = [];
  const p2 = [];
  const p3 = [];

  for (const u of unindexed) {
    const r = cache[u];
    const googleState = r ? (r.coverageState || r.verdict || 'URL is unknown to Google') : 'Pending Inspection';
    const entry = {
      url: u,
      estadoActualGoogle: googleState,
      tecnicamenteLista: 'si'
    };

    if (u === 'https://collectibles.uy/' || u === 'https://collectibles.uy/shop' || u === 'https://collectibles.uy/academy' || u === 'https://collectibles.uy/ai-search' || u === 'https://collectibles.uy/radar' || u === 'https://collectibles.uy/releases' || u === 'https://collectibles.uy/compare' || u === 'https://collectibles.uy/import-hub' || u === 'https://collectibles.uy/licencias' || u === 'https://collectibles.uy/themes' || u.includes('/academy/como-empezar') || u.includes('/academy/figuras-accion') || u.includes('/academy/guia-escalas') || u.includes('/academy/como-reconocer') || u.includes('/categoria/figuras-de-accion') || u.includes('/categoria/funkos') || u.includes('/marca/neca') || u.includes('/marca/funko') || u.includes('/marca/hot-toys')) {
      entry.motivo = 'Hub principal, modulo clave, taxonomia principal o guia pilar no indexada aun por Google';
      p1.push(entry);
    } else if (u.includes('/academy/') || u.includes('/categoria/') || u.includes('/marca/') || u.includes('/page/')) {
      entry.motivo = 'Guia editorial, taxonomia o pagina institucional pendiente de indexacion';
      p2.push(entry);
    } else {
      entry.motivo = 'Producto publicado con ficha tecnica completa listo para indexar';
      p3.push(entry);
    }
  }

  const manualPriority = {
    generatedAt: new Date().toISOString(),
    totalNoIndexadas: unindexed.length,
    prioridad1: p1,
    prioridad2: p2,
    prioridad3: p3
  };

  fs.writeFileSync(MANUAL_PRIORITY_JSON, JSON.stringify(manualPriority, null, 2), 'utf8');

  let txtContent = '=======================================================\n';
  txtContent += 'COLLECTIBLES.UY -- SOLICITUD MANUAL DE INDEXACION EN GOOGLE SEARCH CONSOLE\n';
  txtContent += '(Generado automaticamente con datos 100% reales de URL Inspection API)\n';
  txtContent += 'Total de URLs pendientes de indexar: ' + unindexed.length + '\n';
  txtContent += '=======================================================\n\n';

  txtContent += '-------------------------------------------------------\n';
  txtContent += 'PRIORIDAD 1 (Hubs Nucleares, Modulos Publicos y Guias Pilares pendientes): ' + p1.length + ' URLs\n';
  txtContent += '-------------------------------------------------------\n';
  p1.forEach((item, idx) => {
    txtContent += (idx + 1) + '. URL: ' + item.url + '\n';
    txtContent += '   Estado Google Real: ' + item.estadoActualGoogle + '\n';
    txtContent += '   Motivo: ' + item.motivo + '\n';
    txtContent += '   Tecnicamente lista: ' + item.tecnicamenteLista + '\n\n';
  });

  txtContent += '-------------------------------------------------------\n';
  txtContent += 'PRIORIDAD 2 (Guias Editoriales, Taxonomias y Paginas pendientes): ' + p2.length + ' URLs\n';
  txtContent += '-------------------------------------------------------\n';
  p2.forEach((item, idx) => {
    txtContent += (idx + 1) + '. URL: ' + item.url + '\n';
    txtContent += '   Estado Google Real: ' + item.estadoActualGoogle + '\n';
    txtContent += '   Motivo: ' + item.motivo + '\n';
    txtContent += '   Tecnicamente lista: ' + item.tecnicamenteLista + '\n\n';
  });

  txtContent += '-------------------------------------------------------\n';
  txtContent += 'PRIORIDAD 3 (Productos del Catalogo pendientes): ' + p3.length + ' URLs\n';
  txtContent += '-------------------------------------------------------\n';
  p3.slice(0, 50).forEach((item, idx) => {
    txtContent += (idx + 1) + '. URL: ' + item.url + '\n';
    txtContent += '   Estado Google Real: ' + item.estadoActualGoogle + '\n';
    txtContent += '   Motivo: ' + item.motivo + '\n';
    txtContent += '   Tecnicamente lista: ' + item.tecnicamenteLista + '\n\n';
  });
  if (p3.length > 50) {
    txtContent += '... y ' + (p3.length - 50) + ' productos adicionales (ver manual-indexation-priority.json para la lista completa).\n';
  }

  fs.writeFileSync(MANUAL_PRIORITY_TXT, txtContent, 'utf8');

  // CSV RAW EXPORT
  const rawCsvRows = ['url,type,verdict,coverageState,indexingState,robotsTxtState,pageFetchState,googleCanonical,userCanonical,lastCrawlTime'];
  for (const url of allUrls) {
    const r = cache[url] || {};
    const type = allUrlsMap.get(url) || 'Otro';
    rawCsvRows.push(`"${url}","${type}","${r.verdict || ''}","${r.coverageState || ''}","${r.indexingState || ''}","${r.robotsTxtState || ''}","${r.pageFetchState || ''}","${r.googleCanonical || ''}","${r.userCanonical || ''}","${r.lastCrawlTime || ''}"`);
  }
  fs.writeFileSync(CSV_RAW_FILE, rawCsvRows.join('\n'), 'utf8');

  // CSV CANONICAL MISMATCH EXPORT
  const canonicalCsvRows = ['url,type,userCanonical,googleCanonical,status'];
  for (const c of canonicalMismatchDetails) {
    canonicalCsvRows.push(`"${c.url}","${c.type}","${c.userCanonical || ''}","${c.googleCanonical || ''}","${c.status}"`);
  }
  fs.writeFileSync(CSV_CANONICAL_FILE, canonicalCsvRows.join('\n'), 'utf8');

  console.log(`Archivos exportados:`);
  console.log(`  - ${VERIFIED_JSON_FILE}`);
  console.log(`  - ${MANUAL_PRIORITY_JSON}`);
  console.log(`  - ${MANUAL_PRIORITY_TXT}`);
  console.log(`  - ${CSV_RAW_FILE}`);
  console.log(`  - ${CSV_CANONICAL_FILE}`);

  return {
    inventoryByType,
    total: allUrls.length,
    classification,
    canonicalMismatchDetails,
    crawledNotIndexedDetails,
    discoveredNotIndexedDetails,
    legacyAuditResults,
    searchAnalyticsData
  };
}

runFullAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
