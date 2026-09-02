const https = require('https');

function getHeaders(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        resolve({
          url,
          statusCode: res.statusCode,
          headers: res.headers,
          bodySnippet: body.slice(0, 300)
        });
      });
    }).on('error', err => resolve({ url, error: err.message }));
  });
}

(async () => {
  console.log('--- INSPECCIÓN DE HEADERS EN PRODUCCIÓN LIVE ---');
  const h1 = await getHeaders('https://collectibles.uy/');
  console.log('\nURL: https://collectibles.uy/');
  console.log('Status:', h1.statusCode);
  console.log('x-vercel-id:', h1.headers['x-vercel-id']);
  console.log('x-vercel-cache:', h1.headers['x-vercel-cache']);
  console.log('etag:', h1.headers['etag']);
  console.log('last-modified:', h1.headers['last-modified']);

  const h2 = await getHeaders('https://collectibles.uy/marca/funko');
  console.log('\nURL: https://collectibles.uy/marca/funko');
  console.log('Status:', h2.statusCode);
  console.log('x-vercel-id:', h2.headers['x-vercel-id']);
  console.log('x-vercel-cache:', h2.headers['x-vercel-cache']);
  console.log('content-disposition:', h2.headers['content-disposition']);
  console.log('etag:', h2.headers['etag']);

  const h3 = await getHeaders('https://collectibles.uy/api/seo-prerender');
  console.log('\nURL: https://collectibles.uy/api/seo-prerender');
  console.log('Status:', h3.statusCode);
  console.log('x-vercel-id:', h3.headers['x-vercel-id']);
  console.log('x-vercel-cache:', h3.headers['x-vercel-cache']);
  console.log('content-disposition:', h3.headers['content-disposition']);

  const h4 = await getHeaders('https://collectibles.uy/sitemap.xml');
  console.log('\nURL: https://collectibles.uy/sitemap.xml');
  console.log('Status:', h4.statusCode);
  console.log('x-vercel-id:', h4.headers['x-vercel-id']);
  console.log('content-type:', h4.headers['content-type']);
})();
