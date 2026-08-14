const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const https = require('https');

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

// Read anon key from frontend/.env or .env.local if available
const fs = require('fs');
let realAnonKey = '';
try {
  const envContent = fs.readFileSync('frontend/.env.local', 'utf8');
  const match = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
  if (match) realAnonKey = match[1].trim();
} catch (e) {}

if (!realAnonKey) {
  try {
    const envContent = fs.readFileSync('frontend/.env', 'utf8');
    const match = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
    if (match) realAnonKey = match[1].trim();
  } catch (e) {}
}

const clientKey = realAnonKey || supabaseKey;
const supabase = createClient(supabaseUrl, clientKey);

const targetIds = [
  { name: 'Blanka', id: '5d7a7570-8749-4ecd-ab44-f5c28872f56a' },
  { name: 'Ken', id: 'acfac5ce-4360-4f8a-982e-9db411b11c9a' },
  { name: 'Amy', id: 'b9fed99b-020d-4e0f-9aff-ec123921a957' }
];

async function checkUrl(url) {
  if (!url) return { ok: false, error: 'Empty URL' };
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.request(url, { method: 'HEAD', headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' } }, (res) => {
        resolve({
          status: res.statusCode,
          contentType: res.headers['content-type'],
          contentLength: res.headers['content-length'],
          location: res.headers['location'],
          ok: res.statusCode >= 200 && res.statusCode < 300 && (res.headers['content-type'] || '').includes('image')
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.setTimeout(8000, () => {
        req.destroy();
        resolve({ ok: false, error: 'Timeout' });
      });
      req.end();
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

async function runAudit() {
  console.log('=== AUDITING TARGET PRODUCTS IN SUPABASE ===\n');

  for (const item of targetIds) {
    console.log(`--- ${item.name} (${item.id}) ---`);
    const { data: p, error } = await supabase
      .from('products')
      .select('*, product_images(*)')
      .eq('id', item.id)
      .single();

    if (error || !p) {
      console.log('Error fetching product:', error);
      continue;
    }

    console.log(`Title: ${p.title}`);
    console.log(`Status: ${p.status}, IsActive: ${p.is_active}`);
    console.log(`Direct image_url on product: ${p.image_url}`);
    console.log(`product_images count: ${p.product_images?.length || 0}`);
    
    if (p.product_images) {
      p.product_images.forEach((img, idx) => {
        console.log(`  [Image ${idx}] url: "${img.url}", is_primary: ${img.is_primary}, sort_order: ${img.sort_order}`);
      });
    }

    const testUrl = p.image_url || (p.product_images && p.product_images[0] ? p.product_images[0].url : '');
    console.log(`\nTesting HTTP HEAD on URL: ${testUrl}`);
    const res = await checkUrl(testUrl);
    console.log('HTTP Check Result:', res);
    console.log('\n');
  }

  // Also check Edmond Honda or Guile to compare working products
  console.log('--- Searching for Edmond Honda or Guile (working examples) ---');
  const { data: workingProds } = await supabase
    .from('products')
    .select('*, product_images(*)')
    .or('title.ilike.%Edmond Honda%,title.ilike.%Guile%')
    .limit(2);

  if (workingProds) {
    for (const p of workingProds) {
      console.log(`Title: ${p.title} (${p.id})`);
      console.log(`Direct image_url: ${p.image_url}`);
      console.log(`product_images:`, p.product_images);
      const testUrl = p.image_url || (p.product_images && p.product_images[0] ? p.product_images[0].url : '');
      const res = await checkUrl(testUrl);
      console.log('HTTP Check Result:', res);
      console.log('\n');
    }
  }
}

runAudit();
