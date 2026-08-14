const https = require('https');
const http = require('http');

async function proxyHandler(imgUrl) {
  return new Promise((resolve) => {
    https.get(imgUrl, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'] || 'image/jpeg',
          body: buffer
        });
      });
    }).on('error', err => {
      resolve({ statusCode: 500, error: err.message });
    });
  });
}

async function test() {
  const sampleSupabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/ml-sync/5d7a7570-8749-4ecd-ab44-f5c28872f56a-0-1776872291176.jpg';
  console.log('Fetching sample Supabase image via proxy simulation...');
  const res = await proxyHandler(sampleSupabaseUrl);

  console.log('Proxy Status:', res.statusCode);
  console.log('Proxy Content-Type:', res.contentType);
  console.log('Proxy Body Length:', res.body?.length);
}

test();
