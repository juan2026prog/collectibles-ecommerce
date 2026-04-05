const https = require('https');
const crypto = require('crypto');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

// First fetch the keys from the database
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
    settings.forEach(s => config[s.key] = s.value);
    
    const xLogin = (config.payments_dlocal_go_api_key || '').trim();
    const xTransKey = (config.payments_dlocal_go_smartfields_key || '').trim();
    const secretKey = (config.payments_dlocal_go_secret_key || '').trim();
    
    console.log('=== Testing with current mapping ===');
    console.log('X-Login:', xLogin.substring(0, 4) + '****');
    console.log('X-Trans-Key:', xTransKey.substring(0, 4) + '****');
    console.log('Secret Key:', secretKey.substring(0, 4) + '****');
    
    testPayment(xLogin, xTransKey, secretKey, 'Current mapping');
  });
});
getReq.end();

function testPayment(xLogin, xTransKey, secretKey, label) {
  const body = JSON.stringify({
    amount: "1.00",
    currency: "UYU",
    country: "UY",
    order_id: "test-" + Date.now(),
    payment_method_flow: "REDIRECT",
    notification_url: "https://example.com/webhook",
    callback_url: "https://example.com/success",
    payer: {
      name: "Test User",
      email: "test@example.com",
      document: "12345678"
    }
  });
  
  const xDate = new Date().toISOString();
  const message = xLogin + xDate + body;
  const signature = crypto.createHmac('sha256', secretKey).update(message, 'utf-8').digest('hex');
  
  console.log(`\n[${label}] Calling api.dlocal.com/payments...`);
  console.log('X-Date:', xDate);
  console.log('Signature:', signature.substring(0, 16) + '...');
  
  const req = https.request({
    hostname: 'api.dlocal.com',
    path: '/payments',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Date': xDate,
      'X-Login': xLogin,
      'X-Trans-Key': xTransKey,
      'X-Version': '2.1',
      'User-Agent': 'Collectibles/1.0',
      'Authorization': 'V2-HMAC-SHA256, Signature: ' + signature,
    }
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log(`[${label}] HTTP Status:`, res.statusCode);
      console.log(`[${label}] Response:`, data);
    });
  });
  
  req.write(body);
  req.end();
}
