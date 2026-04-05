const https = require('https');

const options = {
  hostname: 'collectibles-ecommerce.vercel.app',
  path: '/assets/index-CfZoPrBC.js',
  method: 'GET',
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    // Find createClient calls and what keys they use
    // Look for the supabase URL and what comes right after it
    const idx = data.indexOf('cobtsgkwcftvexaarwmo.supabase.co');
    if (idx > -1) {
      // Get surrounding context (200 chars before and after)
      const start = Math.max(0, idx - 100);
      const end = Math.min(data.length, idx + 200);
      console.log('Context around supabase URL:');
      console.log(data.substring(start, end));
      console.log('\n---\n');
    }
    
    // Find sb_publishable in context
    const sbIdx = data.indexOf('sb_publishable');
    if (sbIdx > -1) {
      const start = Math.max(0, sbIdx - 50);
      const end = Math.min(data.length, sbIdx + 100);
      console.log('Context around sb_publishable:');
      console.log(data.substring(start, end));
    }
  });
});
req.end();
