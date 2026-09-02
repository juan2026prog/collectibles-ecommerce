const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

// Load env
const envPath = path.join(__dirname, '../frontend/.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
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

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function checkUrlHttp(targetUrl) {
  return new Promise((resolve) => {
    if (!targetUrl || !targetUrl.startsWith('http')) {
      return resolve({ status: 0, contentType: 'N/A' });
    }

    let urlToFetch = String(targetUrl).trim();
    if (urlToFetch.startsWith('//')) urlToFetch = 'https:' + urlToFetch;

    try {
      const client = urlToFetch.startsWith('https') ? https : http;
      const req = client.request(urlToFetch, { method: 'HEAD', timeout: 3000 }, (res) => {
        resolve({
          status: res.statusCode || 0,
          contentType: res.headers['content-type'] || 'unknown'
        });
      });

      req.on('error', () => {
        const getReq = client.get(urlToFetch, { timeout: 3000 }, (res) => {
          resolve({
            status: res.statusCode || 0,
            contentType: res.headers['content-type'] || 'unknown'
          });
          res.destroy();
        });
        getReq.on('error', () => resolve({ status: 0, contentType: 'N/A' }));
        getReq.end();
      });

      req.end();
    } catch (err) {
      resolve({ status: 0, contentType: 'N/A' });
    }
  });
}

(async () => {
  console.log('Diagnosticando 282 imágenes rotas del catálogo...');

  // 1. Read FULL_CATALOG_IMAGE_AUDIT.csv
  const csvPath = path.join(__dirname, '../seo/FULL_CATALOG_IMAGE_AUDIT.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('No existe FULL_CATALOG_IMAGE_AUDIT.csv');
    return;
  }

  const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
  const header = lines[0].split(',');

  const brokenRows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV row robustly
    const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
    if (!matches) continue;
    
    const cleanFields = matches.map(m => m.replace(/^"|"$/g, ''));
    const imageStatus = cleanFields[11];
    
    if (imageStatus === 'IMAGE_BROKEN' || cleanFields[7] === '404' || cleanFields[7] === '0') {
      brokenRows.push({
        id: cleanFields[0],
        sku: cleanFields[1],
        title: cleanFields[2],
        isActive: cleanFields[3] === 'true',
        isPublished: cleanFields[4] === 'true',
        imageUrl: cleanFields[5],
        imageSource: cleanFields[6],
        httpStatus: cleanFields[7]
      });
    }
  }

  console.log(`Encontradas ${brokenRows.length} imágenes con estado BROKEN / HTTP error.`);

  let mlCount = 0;
  let supabaseCount = 0;
  let otherExternalCount = 0;
  let unknownCount = 0;

  let publishedBrokenCount = 0;

  for (const r of brokenRows) {
    if (r.isPublished && r.isActive) publishedBrokenCount++;

    const url = r.imageUrl.toLowerCase();
    if (url.includes('mlstatic.com') || url.includes('mercadolibre')) {
      mlCount++;
    } else if (url.includes('cobtsgkwcftvexaarwmo.supabase.co')) {
      supabaseCount++;
    } else if (url.startsWith('http')) {
      otherExternalCount++;
    } else {
      unknownCount++;
    }
  }

  console.log('--- DESGLOSE ORIGEN DE IMÁGENES ROTAS ---');
  console.log(`TOTAL BROKEN:                ${brokenRows.length}`);
  console.log(`PUBLICADOS CON BROKEN:       ${publishedBrokenCount}`);
  console.log(`ORIGEN MERCADO LIBRE:        ${mlCount}`);
  console.log(`ORIGEN SUPABASE STORAGE:     ${supabaseCount}`);
  console.log(`ORIGEN OTRAS EXTERNAS:       ${otherExternalCount}`);
  console.log(`ORIGEN DESCONOCIDO/SIN URL:  ${unknownCount}`);

  // Test transformation sample for ML broken URLs
  console.log('\n--- PROBANDO TRANSFORMACIONES DE URL PARA MERCADO LIBRE ---');
  let recoveredMl = 0;
  const sampleMl = brokenRows.filter(r => r.imageUrl.toLowerCase().includes('mlstatic.com')).slice(0, 15);

  for (const r of sampleMl) {
    let testUrl = r.imageUrl;
    if (testUrl.startsWith('http:')) testUrl = testUrl.replace('http:', 'https:');
    
    // Test high-res transformations
    const highResUrl = testUrl.replace(/-[I|S|V|F]\.jpg/gi, '-O.jpg').replace(/-[I|S|V|F]\.webp/gi, '-O.webp');
    const check1 = await checkUrlHttp(testUrl);
    const check2 = await checkUrlHttp(highResUrl);

    console.log(`\nProducto: ${r.title.substring(0, 40)}`);
    console.log(`  Original: ${r.imageUrl} -> HTTP ${check1.status}`);
    console.log(`  Transformada: ${highResUrl} -> HTTP ${check2.status}`);

    if (check2.status === 200) recoveredMl++;
  }

  console.log(`\nMuestra de 15 probadas: ${recoveredMl} recuperadas exitosamente mediante HTTPS / -O.jpg high-res.`);
})();
