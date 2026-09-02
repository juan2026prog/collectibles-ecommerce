const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load env
const envPath = path.join(__dirname, '../frontend/.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
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

function simulateReq(query) {
  const req = { query };
  let statusCode = 200;
  let headers = {};
  let body = '';

  const res = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    status: (code) => { statusCode = code; return res; },
    send: (content) => { body = content; return res; },
    json: (obj) => { body = JSON.stringify(obj); return res; }
  };

  return { req, res, getResult: () => ({ statusCode, headers, body }) };
}

(async () => {
  console.log('Iniciando validación del Google Merchant Feed...');

  const merchantFeedModule = await import('file:///c:/Projects/Collectibles2026/api/merchant-feed.js');
  const merchantFeedHandler = merchantFeedModule.default;

  const { req, res, getResult } = simulateReq({});
  await merchantFeedHandler(req, res);
  const feedRes = getResult();

  const xml = feedRes.body;

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  console.log(`Total productos en Merchant Feed: ${items.length}`);

  const rows = [];
  rows.push('item_id,title,link,price,availability,brand,condition,validation_result,notes');

  let passCount = 0;
  let failCount = 0;

  items.forEach(itemMatch => {
    const itemContent = itemMatch[1];
    const id = itemContent.match(/<g:id>(.*?)<\/g:id>/)?.[1] || '';
    const title = itemContent.match(/<g:title>(.*?)<\/g:title>/)?.[1] || '';
    const link = itemContent.match(/<g:link>(.*?)<\/g:link>/)?.[1] || '';
    const price = itemContent.match(/<g:price>(.*?)<\/g:price>/)?.[1] || '';
    const availability = itemContent.match(/<g:availability>(.*?)<\/g:availability>/)?.[1] || '';
    const brand = itemContent.match(/<g:brand>(.*?)<\/g:brand>/)?.[1] || '';
    const condition = itemContent.match(/<g:condition>(.*?)<\/g:condition>/)?.[1] || '';

    const idOk = Boolean(id);
    const titleOk = Boolean(title);
    const linkOk = Boolean(link && link.startsWith('https://collectibles.uy/producto/'));
    const priceOk = Boolean(price && price.includes('UYU'));
    const availOk = Boolean(availability === 'in_stock' || availability === 'out_of_stock');

    const isPass = idOk && titleOk && linkOk && priceOk && availOk;
    const result = isPass ? 'PASS' : 'FAIL';

    if (isPass) passCount++; else failCount++;

    rows.push(`"${id}","${title.replace(/"/g, '""')}","${link}","${price}","${availability}","${brand}","${condition}",${result},"OK"`);
  });

  const seoDir = path.join(__dirname, '../seo');
  if (!fs.existsSync(seoDir)) fs.mkdirSync(seoDir, { recursive: true });

  fs.writeFileSync(path.join(seoDir, 'MERCHANT_FULL_VALIDATION.csv'), rows.join('\n'));
  console.log(`Validación Merchant Feed completada en seo/MERCHANT_FULL_VALIDATION.csv. Total: ${items.length}, PASS: ${passCount}, FAIL: ${failCount}`);
})();
