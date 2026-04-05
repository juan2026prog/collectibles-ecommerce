const https = require('https');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const body = JSON.stringify({
  provider: 'dlocal',
  amount: 100,
  currency: 'UYU',
  customer: { name: 'Test User', email: 'test@example.com', address: '123 St', phone: '099123' },
  items: []
});

const options = {
  hostname: 'cobtsgkwcftvexaarwmo.supabase.co',
  path: '/functions/v1/create-payment',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + ANON_KEY,
    'apikey': ANON_KEY,
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  console.log('HTTP STATUS:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('RESPONSE BODY:', data);
  });
});

req.on('error', (e) => {
  console.error('REQUEST ERROR:', e.message);
});

req.write(body);
req.end();
