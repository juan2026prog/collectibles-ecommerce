const https = require('https');
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const req = https.request({
  hostname: 'cobtsgkwcftvexaarwmo.supabase.co',
  path: '/rest/v1/site_settings?select=key,value&key=like.payments_paypal*',
  method: 'GET',
  headers: { 'Authorization': 'Bearer ' + ANON_KEY, 'apikey': ANON_KEY }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const settings = JSON.parse(data);
    if (settings.length === 0) {
      console.log('No PayPal settings found in database. Need to create them.');
    } else {
      settings.forEach(s => {
        const val = s.value || '';
        const masked = val.length > 12 ? val.substring(0,4) + '****' + val.substring(val.length-4) : val;
        console.log(`${s.key} => "${masked}" (${val.length} chars)`);
      });
    }
  });
});
req.end();
