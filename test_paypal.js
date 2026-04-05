const https = require('https');
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const body = JSON.stringify({
  provider: 'paypal',
  amount: 100,
  currency: 'USD',
  customer: { name: 'Test User', email: 'test@test.com', phone: '099123456' },
  items: [{ id: 'test-1', quantity: 1, price: 100, title: 'Test Item' }]
});

const req = https.request({
  hostname: 'cobtsgkwcftvexaarwmo.supabase.co',
  path: '/functions/v1/create-payment',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + ANON,
    'apikey': ANON,
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    const parsed = JSON.parse(data);
    console.log('Response:', JSON.stringify(parsed, null, 2));
    if (parsed.checkout_url) {
      console.log('\n✅ SUCCESS! PayPal checkout URL:', parsed.checkout_url);
    } else if (parsed.error) {
      console.log('\n❌ ERROR:', parsed.error);
    }
  });
});

req.write(body);
req.end();
