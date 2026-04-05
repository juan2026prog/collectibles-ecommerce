const https = require('https');
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

// Insert PayPal settings
const settings = [
  { key: 'payments_paypal_client_id', value: '' },
  { key: 'payments_paypal_client_secret', value: '' },
  { key: 'payments_paypal_sandbox', value: 'true' },
  { key: 'payments_paypal_enabled', value: 'true' }
];

const body = JSON.stringify(settings);

const req = https.request({
  hostname: 'cobtsgkwcftvexaarwmo.supabase.co',
  path: '/rest/v1/site_settings?on_conflict=key',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + ANON_KEY,
    'apikey': ANON_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=representation'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('\nPayPal settings created! Now go to your Admin panel and set:');
      console.log('  payments_paypal_client_id = your PayPal Client ID');
      console.log('  payments_paypal_client_secret = your PayPal Client Secret');
      console.log('  payments_paypal_sandbox = "true" for testing, "false" for production');
    }
  });
});
req.write(body);
req.end();
