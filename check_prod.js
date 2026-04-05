const https = require('https');

// Check collectibles-ecommerce.vercel.app for new bundle
const options = {
  hostname: 'collectibles-ecommerce.vercel.app',
  path: '/',
  method: 'GET',
  headers: { 'Cache-Control': 'no-cache' }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const jsMatch = data.match(/src="\/assets\/(index-[^"]+\.js)"/);
    console.log('Bundle filename:', jsMatch ? jsMatch[1] : 'NOT FOUND');
    
    if (jsMatch) {
      const jsReq = https.request({
        hostname: 'collectibles-ecommerce.vercel.app',
        path: '/assets/' + jsMatch[1],
        method: 'GET',
      }, (jsRes) => {
        let jsData = '';
        jsRes.on('data', (chunk) => { jsData += chunk; });
        jsRes.on('end', () => {
          if (jsData.includes('sb_publishable')) {
            console.log('BAD: sb_publishable key in bundle!');
          }
          if (jsData.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')) {
            console.log('GOOD: JWT key is in bundle!');
          }
          if (!jsData.includes('sb_publishable') && !jsData.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')) {
            console.log('UNKNOWN: Neither key found');
          }
        });
      });
      jsReq.end();
    }
  });
});
req.end();
