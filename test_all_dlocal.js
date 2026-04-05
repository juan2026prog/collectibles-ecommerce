const https = require('https');
const crypto = require('crypto');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const getReq = https.request({
  hostname: 'cobtsgkwcftvexaarwmo.supabase.co',
  path: '/rest/v1/site_settings?select=key,value&key=like.payments_dlocal*',
  method: 'GET',
  headers: { 'Authorization': 'Bearer ' + ANON_KEY, 'apikey': ANON_KEY }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const settings = JSON.parse(data);
    const config = {};
    settings.forEach(s => config[s.key] = (s.value || '').trim());
    
    const apiKey = config.payments_dlocal_go_api_key;
    const sfKey = config.payments_dlocal_go_smartfields_key;
    const secret = config.payments_dlocal_go_secret_key;
    
    console.log('Keys loaded from DB:');
    console.log('  apiKey:', apiKey.substring(0,6) + '...(' + apiKey.length + ' chars)');
    console.log('  sfKey:', sfKey.substring(0,6) + '...(' + sfKey.length + ' chars)');
    console.log('  secret:', secret.substring(0,6) + '...(' + secret.length + ' chars)');
    console.log('');

    const body = JSON.stringify({
      amount: 1.00, currency: "UYU", country: "UY",
      order_id: "test-" + Date.now(),
      success_url: "https://collectibles-ecommerce.vercel.app/success",
      back_url: "https://collectibles-ecommerce.vercel.app/checkout",
      notification_url: "https://example.com/webhook",
      payer: { name: "Test", email: "test@test.com" }
    });

    let testNum = 0;

    function doTest(host, path, authHeader, label) {
      testNum++;
      const n = testNum;
      const req = https.request({ hostname: host, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader }
      }, (res) => {
        let d = '';
        res.on('data', (c) => d += c);
        res.on('end', () => console.log(`#${n} [${label}] → ${res.statusCode}: ${d.substring(0,150)}`));
      });
      req.on('error', (e) => console.log(`#${n} [${label}] → ERROR: ${e.message}`));
      req.write(body);
      req.end();
    }

    // === api.dlocalgo.com tests ===
    doTest('api.dlocalgo.com', '/v1/payments', { Authorization: 'Bearer ' + sfKey }, 'dlocalgo + Bearer sfKey');
    doTest('api.dlocalgo.com', '/v1/payments', { Authorization: 'Bearer ' + secret }, 'dlocalgo + Bearer secret');
    doTest('api.dlocalgo.com', '/v1/payments', { Authorization: 'Bearer ' + apiKey }, 'dlocalgo + Bearer apiKey');
    
    // Basic Auth combos on dlocalgo
    doTest('api.dlocalgo.com', '/v1/payments', { Authorization: 'Basic ' + Buffer.from(apiKey + ':' + secret).toString('base64') }, 'dlocalgo + Basic api:secret');
    doTest('api.dlocalgo.com', '/v1/payments', { Authorization: 'Basic ' + Buffer.from(sfKey + ':' + secret).toString('base64') }, 'dlocalgo + Basic sf:secret');

    // Different paths on dlocalgo
    doTest('api.dlocalgo.com', '/v1/checkout', { Authorization: 'Bearer ' + secret }, 'dlocalgo /v1/checkout + Bearer secret');
    doTest('api.dlocalgo.com', '/v1/payment-links', { Authorization: 'Bearer ' + secret }, 'dlocalgo /v1/payment-links + Bearer secret');

    // === api.dlocal.com tests with HMAC ===
    const xDate = new Date().toISOString();
    
    // Try: apiKey as login, sfKey as trans-key
    let sig1 = crypto.createHmac('sha256', secret).update(apiKey + xDate + body, 'utf-8').digest('hex');
    doTest('api.dlocal.com', '/payments', { 'X-Date': xDate, 'X-Login': apiKey, 'X-Trans-Key': sfKey, 'X-Version': '2.1', Authorization: 'V2-HMAC-SHA256, Signature: ' + sig1 }, 'dlocal HMAC api=login sf=trans');

    // Try: sfKey as login, apiKey as trans-key (swapped)
    let sig2 = crypto.createHmac('sha256', secret).update(sfKey + xDate + body, 'utf-8').digest('hex');
    doTest('api.dlocal.com', '/payments', { 'X-Date': xDate, 'X-Login': sfKey, 'X-Trans-Key': apiKey, 'X-Version': '2.1', Authorization: 'V2-HMAC-SHA256, Signature: ' + sig2 }, 'dlocal HMAC sf=login api=trans');

    // === sandbox tests ===
    doTest('api-sbx.dlocalgo.com', '/v1/payments', { Authorization: 'Bearer ' + secret }, 'SANDBOX dlocalgo + Bearer secret');
    doTest('sandbox.dlocal.com', '/payments', { 'X-Date': xDate, 'X-Login': apiKey, 'X-Trans-Key': sfKey, 'X-Version': '2.1', Authorization: 'V2-HMAC-SHA256, Signature: ' + sig1 }, 'SANDBOX dlocal HMAC');
  });
});
getReq.end();
