const https = require('https');
const fs = require('fs');

const urls = [
  { name: 'Blanka', url: 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/ml-sync/5d7a7570-8749-4ecd-ab44-f5c28872f56a-0-1776872291176.jpg' },
  { name: 'Ken', url: 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/ml-sync/acfac5ce-4360-4f8a-982e-9db411b11c9a-0-1776872277210.jpg' },
  { name: 'Amy', url: 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/ml-sync/b9fed99b-020d-4e0f-9aff-ec123921a957-0-1776872283528.jpg' },
  { name: 'Guile', url: 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/ml-sync/c3e7daaa-73a8-459b-9ade-25a75aac881a-0-1776872276790.jpg' },
  { name: 'Honda', url: 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/ml-sync/99b81b61-4c00-4ba7-88f8-6b3a792cd355-0-1776872297227.jpg' }
];

async function downloadImage(item) {
  return new Promise((resolve) => {
    https.get(item.url, { headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' } }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.log(`[${item.name}] Status: ${res.statusCode}, Headers: ${JSON.stringify(res.headers)}, Bytes: ${buffer.length}`);
        
        // Save to file for inspection
        const filename = `scripts/${item.name.toLowerCase()}_test.jpg`;
        fs.writeFileSync(filename, buffer);
        console.log(` Saved to ${filename}`);
        resolve();
      });
    }).on('error', e => {
      console.error(`[${item.name}] Download error:`, e.message);
      resolve();
    });
  });
}

async function run() {
  console.log('=== DOWNLOADING IMAGES FOR BLANKA, KEN, AMY, GUILE, HONDA ===\n');
  for (const u of urls) {
    await downloadImage(u);
  }
}

run();
