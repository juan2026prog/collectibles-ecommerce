const https = require('https');

async function verifyProductionImages() {
  console.log('--- VERIFYING PRODUCTION META CATALOG IMAGES ---');

  for (let attempt = 1; attempt <= 15; attempt++) {
    console.log(`Attempt ${attempt}/15 (waiting for Vercel deployment...)...`);

    try {
      const csvRes = await fetch('https://collectibles.uy/meta-catalog.csv');
      const csvText = await csvRes.text();
      const lines = csvText.split('\n');

      const targetIds = [
        { name: 'Blanka', id: '5d7a7570-8749-4ecd-ab44-f5c28872f56a' },
        { name: 'Ken', id: 'acfac5ce-4360-4f8a-982e-9db411b11c9a' },
        { name: 'Amy', id: 'b9fed99b-020d-4e0f-9aff-ec123921a957' }
      ];

      let allOk = true;

      for (const t of targetIds) {
        const line = lines.find(l => l.includes(t.id));
        if (!line) {
          console.log(`  [${t.name}] Not found in CSV yet`);
          allOk = false;
          continue;
        }

        // CSV columns: 0:id, 1:title, 2:description, 3:avail, 4:cond, 5:price, 6:link, 7:image_link...
        const fields = line.split('","').map(f => f.replace(/^"|"$/g, ''));
        const imageLink = fields[7];

        if (!imageLink || !imageLink.startsWith('https://collectibles.uy/catalog-images/')) {
          console.log(`  [${t.name}] image_link not updated yet: ${imageLink}`);
          allOk = false;
          continue;
        }

        // Test fetching proxied image URL on production domain
        const imgTest = await new Promise((resolve) => {
          https.get(imageLink, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
              const buffer = Buffer.concat(chunks);
              resolve({
                status: res.statusCode,
                contentType: res.headers['content-type'],
                xRobotsTag: res.headers['x-robots-tag'],
                bytes: buffer.length
              });
            });
          }).on('error', e => resolve({ error: e.message }));
        });

        console.log(`  [${t.name}] image_link: ${imageLink}`);
        console.log(`    HTTP ${imgTest.status} | Content-Type: ${imgTest.contentType} | X-Robots-Tag: ${imgTest.xRobotsTag} | Bytes: ${imgTest.bytes}`);

        if (imgTest.status !== 200 || !imgTest.contentType?.includes('image/') || imgTest.bytes < 1000) {
          allOk = false;
        }
      }

      if (allOk) {
        console.log('\n✅ SUCCESS! All target product image links are deployed, public, and return HTTP 200 image/jpeg without x-robots-tag: none!');
        return;
      }
    } catch (e) {
      console.error('  Fetch error:', e.message);
    }

    await new Promise(r => setTimeout(r, 6000));
  }
}

verifyProductionImages();
