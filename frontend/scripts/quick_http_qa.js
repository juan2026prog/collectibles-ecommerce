import https from 'https';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runQA() {
  console.log("--- LIVE QA ON REAL DOMAIN https://collectibles.uy ---");
  
  const root = await fetchUrl('https://collectibles.uy');
  console.log(`GET / -> Status: ${root.statusCode}`);
  const hasIndexJs = root.body.includes('/assets/index-C64EXPZb.js');
  console.log(`Latest Production JS Bundle Served: ${hasIndexJs ? 'YES (index-C64EXPZb.js)' : 'NO'}`);

  const licenciasPage = await fetchUrl('https://collectibles.uy/licencias');
  console.log(`GET /licencias -> Status: ${licenciasPage.statusCode}`);

  const marvelPage = await fetchUrl('https://collectibles.uy/licencias/marvel');
  console.log(`GET /licencias/marvel -> Status: ${marvelPage.statusCode}`);

  const themesPage = await fetchUrl('https://collectibles.uy/themes');
  console.log(`GET /themes -> Status: ${themesPage.statusCode}`);
}

runQA();
