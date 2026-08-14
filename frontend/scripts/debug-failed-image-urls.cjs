const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const https = require('https');

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDetailed(url) {
  return new Promise((resolve) => {
    try {
      const isHttps = url.startsWith('https');
      const client = isHttps ? https : http;
      const req = client.request(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
        }
      }, (res) => {
        let length = 0;
        res.on('data', chunk => length += chunk.length);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            contentType: res.headers['content-type'],
            length,
            location: res.headers['location'],
            xRobotsTag: res.headers['x-robots-tag']
          });
        });
      });
      req.on('error', e => resolve({ error: e.message }));
      req.setTimeout(8000, () => {
        req.destroy();
        resolve({ error: 'Timeout' });
      });
      req.end();
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

async function debugFailed() {
  console.log('Debugging failed product images...');

  const { data: products } = await supabase
    .from('products')
    .select('id, title, images:product_images(url, is_primary)')
    .eq('status', 'published')
    .eq('is_active', true)
    .limit(30);

  if (!products) return;

  for (const p of products) {
    if (!p.images || p.images.length === 0) continue;
    const rawUrl = p.images[0].url;

    // Direct HTTP test
    const res = await checkDetailed(rawUrl);
    console.log(`[Product ${p.id.slice(0, 8)}] Raw URL: ${rawUrl}`);
    console.log('  HTTP Result:', res);
  }
}

debugFailed();
