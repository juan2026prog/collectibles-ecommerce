import fs from 'fs';

async function auditLegacyUrls() {
  const target = 'https://collectibles.uy';
  
  console.log('================================================================');
  console.log('AUDITORÍA LIVE PRODUCCIÓN DE RESOLUCIÓN DE URLs LEGACY /p/');
  console.log('================================================================\n');

  let markdownReport = `# AUDITORÍA DE RESOLUCIÓN DE URLs LEGACY /p/ Y DESTELLOS CANÓNICOS\n\n`;
  markdownReport += `**Fecha:** ${new Date().toISOString()}\n`;
  markdownReport += `**Dominio Live:** ${target}\n\n`;
  markdownReport += `| Tipo de Prueba | URL Solicitada | HTTP Status | Header Location / Redirect Target | Destino Status | Resultado |\n`;
  markdownReport += `|---|---|---|---|---|---|\n`;

  let totalPass = 0;
  let totalTests = 0;

  // 1. Test Mercado Libre MLU Legacy URLs
  const mluTests = [
    { url: '/p/mercadolibre-MLU1044226594', expectedCanonical: '/producto/neca-body-knocker-solar-power-marvel-dr-strange' },
    { url: '/p/mercadolibre-MLU978019978', expectedCanonical: '/producto/funko-pop-spiderman-symbiote-suite' },
    { url: '/p/mercadolibre-MLU615896308', expectedCanonical: '/producto/marvel-legends-thor-love-and-thunder-groot' },
    { url: '/p/mercadolibre-MLU651358264', expectedCanonical: '/producto/funko-pop-the-eternals-ikaris' },
    { url: '/p/mercadolibre-MLU655247339', expectedCanonical: '/producto/funko-pop-street-sharks-ripster' },
    { url: '/p/mercadolibre-MLU655443047', expectedCanonical: '/producto/funko-pop-kpop-demon-hunters-rumi' },
    { url: '/p/mercadolibre-MLU623057633', expectedCanonical: '/producto/funko-pop-doctor-strange-in-the-multiverse-rintrah' },
    { url: '/p/mercadolibre-MLU655337083', expectedCanonical: '/producto/funko-pop-biker-mars-from-mice-vinnie' },
    { url: '/p/mercadolibre-MLU639385900', expectedCanonical: '/producto/funko-peluche-de-lucha-libre-la-estrella-cosmica-amarillo' },
    { url: '/p/mercadolibre-MLU629964263', expectedCanonical: '/producto/funko-plushies-avenger-infinity-war-hulkbuster' }
  ];

  console.log('--- TEST GROUP 1: MERCADO LIBRE LEGACY MLU URLs ---');
  for (const t of mluTests) {
    totalTests++;
    const res = await fetch(target + t.url, { redirect: 'manual' });
    const loc = res.headers.get('location') || '';
    let destStatus = 'N/A';
    let isPass = false;

    if (res.status === 301 && loc.endsWith(t.expectedCanonical)) {
      const destRes = await fetch(loc);
      destStatus = String(destRes.status);
      if (destRes.status === 200) {
        isPass = true;
      }
    }

    if (isPass) totalPass++;
    console.log(`[MLU] ${t.url} -> Status: ${res.status} | Location: ${loc} | Dest Status: ${destStatus} | ${isPass ? 'PASS ✅' : 'FAIL ❌'}`);
    markdownReport += `| Mercado Libre MLU | \`${t.url}\` | ${res.status} | \`${loc}\` | ${destStatus} | ${isPass ? 'PASS ✅' : 'FAIL ❌'} |\n`;
  }

  // 2. Test Normal Legacy /p/ URLs
  const normalTests = [
    '/p/laurie-strode-ultimate-halloween--2018--neca-2383',
    '/p/figura-de-acci-n-glamrock-fred-security-breach-47490-de-funko-4336',
    '/p/figura-chucky---tiffany-pack-doble-bride-of-chucky-neca-6773',
    '/p/peluche-gashouse-pat-ootie-coral-claro',
    '/p/chucky-tv-series-ultimate-neca-4996',
    '/p/figura-neca-ultimate---chucky-tv-series-3029',
    '/p/boar-ultimate-predator-2-depredador-neca-7057',
    '/p/funko-pop-marvel-eternals-gilgamesh',
    '/p/feral-ultimate-predator-depredador-prey-neca-dmg-box-5406',
    '/p/fifa-world-cup-2026-mascota-de-ee-uu-clutch-25cm'
  ];

  console.log('\n--- TEST GROUP 2: NORMAL LEGACY /p/ URLs ---');
  for (const urlPath of normalTests) {
    totalTests++;
    const res = await fetch(target + urlPath, { redirect: 'manual' });
    const loc = res.headers.get('location') || '';
    const expectedCanonical = urlPath.replace('/p/', '/producto/');
    let destStatus = 'N/A';
    let isPass = false;

    if (res.status === 301 && loc.endsWith(expectedCanonical)) {
      const destRes = await fetch(loc);
      destStatus = String(destRes.status);
      if (destRes.status === 200) {
        isPass = true;
      }
    }

    if (isPass) totalPass++;
    console.log(`[NORMAL] ${urlPath} -> Status: ${res.status} | Location: ${loc} | Dest Status: ${destStatus} | ${isPass ? 'PASS ✅' : 'FAIL ❌'}`);
    markdownReport += `| Legacy Normal | \`${urlPath}\` | ${res.status} | \`${loc}\` | ${destStatus} | ${isPass ? 'PASS ✅' : 'FAIL ❌'} |\n`;
  }

  // 3. Test Non-existent Legacy /p/ URLs
  const nonExistentTests = [
    '/p/producto-inexistente-1',
    '/p/mercadolibre-MLU99999999999',
    '/p/categoria-falsa-xyz',
    '/p/p-no-existe-3',
    '/p/random-slug-invalid-987'
  ];

  console.log('\n--- TEST GROUP 3: NON-EXISTENT LEGACY /p/ URLs ---');
  for (const urlPath of nonExistentTests) {
    totalTests++;
    const res = await fetch(target + urlPath, { redirect: 'manual' });
    const loc = res.headers.get('location') || 'Ninguno (HTTP 404 Directo)';
    const body = await res.text();
    const isPass = res.status === 404 && body.includes('Página No Encontrada') && !loc.includes('http');

    if (isPass) totalPass++;
    console.log(`[404 REAL] ${urlPath} -> Status: ${res.status} | Location: ${loc} | ${isPass ? 'PASS ✅' : 'FAIL ❌'}`);
    markdownReport += `| Inexistente | \`${urlPath}\` | ${res.status} | ${loc} | N/A (404 Directo) | ${isPass ? 'PASS ✅' : 'FAIL ❌'} |\n`;
  }

  markdownReport += `\n## RESUMEN DE CERTIFICACIÓN\n\n`;
  markdownReport += `- **Total Pruebas:** ${totalTests}\n`;
  markdownReport += `- **Pruebas Pasadas:** ${totalPass}\n`;
  markdownReport += `- **Tasa de Éxito:** ${(totalPass / totalTests * 100).toFixed(2)}%\n`;
  markdownReport += `- **Estado Final:** ${totalPass === totalTests ? 'CERTIFICADO 100% PASS ✅' : 'RECHAZADO ❌'}\n`;

  fs.mkdirSync('qa', { recursive: true });
  fs.writeFileSync('qa/LEGACY_PRODUCT_URL_RESOLUTION_AUDIT.md', markdownReport, 'utf8');
  console.log('\nqa/LEGACY_PRODUCT_URL_RESOLUTION_AUDIT.md generado exitosamente.');
}

auditLegacyUrls();
