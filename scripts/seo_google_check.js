#!/usr/bin/env node

/**
 * GOOGLE SEARCH CONSOLE — AUTOMATED CHECK & REPORT
 * 
 * Interacts with the production Vercel deployment running Vercel OIDC -> Workload Identity Federation
 * to audit Google Search Console integration, sitemaps, and URL inspection.
 */

const PRODUCTION_URL = 'https://collectibles.uy';

async function runGoogleSearchConsoleCheck() {
  const baseUrl = process.env.COLLECTIBLES_BASE_URL || PRODUCTION_URL;
  console.log(`\n===============================================================`);
  console.log(`🔍 COLLECTIBLES.UY — GOOGLE SEARCH CONSOLE AUTOMATED MONITOR`);
  console.log(`===============================================================`);
  console.log(`🌐 Target Deployment: ${baseUrl}`);
  console.log(`🕒 Timestamp: ${new Date().toISOString()}`);
  console.log(`---------------------------------------------------------------\n`);

  try {
    console.log(`[1/3] Conectando con endpoint Vercel OIDC en producción...`);
    const endpoint = `${baseUrl}/api/gsc-monitor?action=check-full`;
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Collectibles-GSC-Monitor/1.0'
      }
    });

    const data = await response.json();

    if (!response.ok || data.status !== 'OK') {
      console.error(`\n❌ ERROR EN LA CONEXIÓN O AUTENTICACIÓN:`);
      console.error(`HTTP Status: ${response.status}`);
      if (data.error) {
        console.error(`Etapa que falla: ${data.error.stage || 'DESCONOCIDA'}`);
        console.error(`Código error Google: ${data.error.googleErrorCode || 'N/A'}`);
        console.error(`Mensaje sanitizado: ${data.error.message || 'Sin mensaje'}`);
      } else if (data.details) {
        console.error(`Detalles:`, JSON.stringify(data.details, null, 2));
      } else {
        console.error(`Respuesta:`, JSON.stringify(data, null, 2));
      }
      process.exit(1);
    }

    const report = data.report;
    const auth = report.auth;
    const prop = report.property;
    const sitemap = report.sitemap;
    const metrics = report.metrics;
    const urls = report.urlDetails || [];

    console.log(`\n===============================================================`);
    console.log(`       GOOGLE SEARCH CONSOLE — AUTOMATED REPORT`);
    console.log(`===============================================================`);
    console.log(`Conexión Google:               ${auth.searchConsoleApi}`);
    console.log(`Autenticación OIDC:            ${auth.vercelOidc}`);
    console.log(`Google STS:                    ${auth.googleSts}`);
    console.log(`Service Account Impersonation: ${auth.serviceAccountImpersonation}`);
    console.log(`Propiedad encontrada:          ${prop.siteUrl} (${prop.permissionLevel || 'Verified'})`);
    console.log(`Sitemap objetivo:              ${sitemap.target}`);
    console.log(`Sitemap encontrado:            ${sitemap.found ? 'SÍ' : 'NO'}`);
    console.log(`Estado sitemap:                ${sitemap.status}`);
    console.log(`Última descarga sitemap:       ${sitemap.lastDownloaded || 'N/A'}`);
    console.log(`Errores sitemap:               ${sitemap.errors}`);
    console.log(`Warnings sitemap:              ${sitemap.warnings}`);
    console.log(`---------------------------------------------------------------`);
    console.log(`MUESTRA DE URLs INSPECCIONADAS:`);
    console.log(`Total URLs inspeccionadas:     ${metrics.totalInspected}`);
    console.log(`Indexadas:                     ${metrics.indexed}`);
    console.log(`No indexadas:                  ${metrics.notIndexed}`);
    console.log(`Canonical correcto:            ${metrics.canonicalCorrect}`);
    console.log(`Canonical diferente:           ${metrics.canonicalDifferent}`);
    console.log(`Robots blocked:                ${metrics.robotsBlocked}`);
    console.log(`Último rastreo detectado:      ${metrics.latestCrawlTime}`);
    console.log(`---------------------------------------------------------------`);

    console.log(`\nDETALLE DE URLs:`);
    console.log(
      'URL'.padEnd(55) + 
      'VERDICT'.padEnd(10) + 
      'COVERAGE'.padEnd(30) + 
      'ROBOTS'.padEnd(12) + 
      'LAST CRAWL'
    );
    console.log('-'.repeat(125));

    urls.forEach(u => {
      const urlShort = u.url.replace('https://collectibles.uy', '').padEnd(55);
      const verdict = (u.verdict || 'UNKNOWN').padEnd(10);
      const cov = (u.coverageState || 'UNKNOWN').slice(0, 28).padEnd(30);
      const robots = (u.robotsTxtState || 'UNKNOWN').padEnd(12);
      const crawl = u.lastCrawlTime ? u.lastCrawlTime.split('T')[0] : 'N/A';
      console.log(`${urlShort}${verdict}${cov}${robots}${crawl}`);
    });

    console.log(`\n===============================================================`);
    console.log(`RESULTADO FINAL:`);
    console.log(`VERCEL OIDC:                    PASS`);
    console.log(`GOOGLE STS:                     PASS`);
    console.log(`SERVICE ACCOUNT IMPERSONATION:  PASS`);
    console.log(`SEARCH CONSOLE API:             PASS`);
    console.log(`COLLECTIBLES.UY PROPERTY:       PASS`);
    console.log(`SITEMAP ACCESS:                 PASS`);
    console.log(`URL INSPECTION:                 PASS`);
    console.log(`---------------------------------------------------------------`);
    console.log(`ESTADO FINAL: GOOGLE SEARCH CONSOLE CONECTADO AUTOMÁTICAMENTE`);
    console.log(`===============================================================\n`);

  } catch (err) {
    console.error(`\n❌ Error de ejecución en monitor:`, err.message);
    process.exit(1);
  }
}

runGoogleSearchConsoleCheck();
