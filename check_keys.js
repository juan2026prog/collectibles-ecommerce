const https = require('https');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const options = {
  hostname: 'cobtsgkwcftvexaarwmo.supabase.co',
  path: '/rest/v1/site_settings?select=key,value&key=like.payments_dlocal*',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + ANON_KEY,
    'apikey': ANON_KEY,
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const settings = JSON.parse(data);
    settings.forEach(s => {
      const val = s.value || '';
      // Show full key names and first/last 4 chars of values
      const masked = val.length > 12 
        ? val.substring(0, 4) + '****' + val.substring(val.length - 4) 
        : val;
      console.log(`DB field: "${s.key}"`);
      console.log(`  Value: "${masked}" (length: ${val.length})`);
      console.log(`  Used as: ${
        s.key === 'payments_dlocal_go_api_key' ? 'X-Login' :
        s.key === 'payments_dlocal_go_smartfields_key' ? 'X-Trans-Key' :
        s.key === 'payments_dlocal_go_secret_key' ? 'Secret Key (for HMAC signature)' :
        s.key === 'payments_dlocal_go_enabled' ? 'Feature toggle' :
        s.key === 'payments_dlocal_go_sandbox' ? 'Sandbox toggle' : 'Unknown'
      }`);
      console.log('');
    });
    
    console.log('=== MAPPING SUMMARY ===');
    console.log('Your dLocal Go dashboard should show these 3 credentials:');
    console.log('1. "x-login" or "Login" → should match payments_dlocal_go_api_key');
    console.log('2. "x-trans-key" or "Trans Key" → should match payments_dlocal_go_smartfields_key');  
    console.log('3. "Secret Key" → should match payments_dlocal_go_secret_key');
    console.log('');
    console.log('If the mapping is wrong, the API will return "Invalid Credentials".');
    console.log('Please verify the mapping in your dLocal Go dashboard.');
  });
});
req.end();
