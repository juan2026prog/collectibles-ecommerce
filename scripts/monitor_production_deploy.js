const https = require('https');

function checkProduction() {
  return new Promise((resolve) => {
    https.get('https://collectibles.uy/marca/funko', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const titleMatch = body.match(/<title[^>]*>(.*?)<\/title>/i);
        const canonicalMatch = body.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
        resolve({
          status: res.statusCode,
          title: titleMatch ? titleMatch[1] : 'NONE',
          canonical: canonicalMatch ? canonicalMatch[1] : 'NONE',
          isUpdated: titleMatch && titleMatch[1].includes('Funko en Uruguay')
        });
      });
    }).on('error', () => resolve({ status: 0, title: 'ERROR', canonical: 'ERROR', isUpdated: false }));
  });
}

(async () => {
  console.log('Esperando despliegue de Vercel en Producción (https://collectibles.uy)...');
  let attempts = 0;
  const maxAttempts = 15;

  while (attempts < maxAttempts) {
    attempts++;
    const res = await checkProduction();
    console.log(`[Intento ${attempts}/${maxAttempts}] Status: ${res.status} | Title: "${res.title}" | Canonical: "${res.canonical}"`);

    if (res.isUpdated) {
      console.log('\n¡DESPLIEGUE EN PRODUCCIÓN CONFIRMADO! Vercel ha activado el nuevo código en https://collectibles.uy');
      process.exit(0);
    }

    await new Promise(r => setTimeout(r, 4000));
  }

  console.log('\nEl despliegue aún está procesándose o requiere más tiempo en Vercel.');
})();
