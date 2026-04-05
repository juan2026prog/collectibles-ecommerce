const https = require('https');

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

    const body = JSON.stringify({
      amount: 1.00, currency: "UYU", country: "UY",
      order_id: "test-" + Date.now(),
      success_url: "https://collectibles-ecommerce.vercel.app/checkout/success",
      back_url: "https://collectibles-ecommerce.vercel.app/checkout",
      notification_url: "https://example.com/webhook",
      description: "Test payment",
      payer: { name: "Test User", email: "test@test.com" }
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
        res.on('end', () => console.log(`#${n} [${label}] → ${res.statusCode}: ${d.substring(0,250)}`));
      });
      req.on('error', (e) => console.log(`#${n} [${label}] → ERROR: ${e.message}`));
      req.write(body);
      req.end();
    }

    // /v1/checkout with all key combos
    doTest('api.dlocalgo.com', '/v1/checkout', { Authorization: 'Bearer ' + apiKey }, '/v1/checkout + Bearer apiKey');
    doTest('api.dlocalgo.com', '/v1/checkout', { Authorization: 'Bearer ' + sfKey }, '/v1/checkout + Bearer sfKey');
    doTest('api.dlocalgo.com', '/v1/checkout', { Authorization: 'Bearer ' + secret }, '/v1/checkout + Bearer secret');
    
    // Basic auth combos on /v1/checkout
    doTest('api.dlocalgo.com', '/v1/checkout', { Authorization: 'Basic ' + Buffer.from(apiKey + ':' + secret).toString('base64') }, '/v1/checkout + Basic api:secret');
    doTest('api.dlocalgo.com', '/v1/checkout', { Authorization: 'Basic ' + Buffer.from(sfKey + ':' + secret).toString('base64') }, '/v1/checkout + Basic sf:secret');

    // With X-API-Key header
    doTest('api.dlocalgo.com', '/v1/checkout', { 'X-API-Key': apiKey }, '/v1/checkout + X-API-Key header');
    doTest('api.dlocalgo.com', '/v1/checkout', { Authorization: 'Bearer ' + apiKey, 'X-API-Key': secret }, '/v1/checkout + Bearer api + X-API-Key secret');
  });
});
getReq.end();
