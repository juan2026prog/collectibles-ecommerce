const https = require('https');

const options = {
  hostname: 'collectibles-ecommerce.vercel.app',
  path: '/assets/index-JSMeYugR.js',
  method: 'GET',
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (data.includes('sb_publishable')) {
      console.log('BAD: sb_publishable key STILL in deployed bundle!');
    } else if (data.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')) {
      console.log('GOOD: JWT key is in deployed bundle - fix is live!');
    } else {
      console.log('UNKNOWN: Neither key pattern found');
    }
    
    // Check if it uses env var or hardcoded
    if (data.includes('VITE_SUPABASE_ANON_KEY')) {
      console.log('WARNING: Still references VITE_SUPABASE_ANON_KEY env var');
    }
    
    // Find supabase URL pattern
    const match = data.match(/cobtsgkwcftvexaarwmo/);
    if (match) {
      console.log('GOOD: Supabase project ref found in bundle');
    }
  });
});
req.end();
