const https = require('https');

// Check the preview deploy directly
const options = {
  hostname: 'frontend-bgb52438q-juans-projects-05818af2.vercel.app',
  path: '/',
  method: 'GET',
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const jsMatch = data.match(/src="\/assets\/(index-[^"]+\.js)"/);
    if (jsMatch) {
      console.log('JS bundle:', jsMatch[1]);
      // Now fetch this JS file from the preview deploy
      const jsReq = https.request({
        hostname: 'frontend-bgb52438q-juans-projects-05818af2.vercel.app',
        path: '/assets/' + jsMatch[1],
        method: 'GET',
      }, (jsRes) => {
        let jsData = '';
        jsRes.on('data', (chunk) => { jsData += chunk; });
        jsRes.on('end', () => {
          if (jsData.includes('sb_publishable')) {
            console.log('BAD: sb_publishable key in NEW deploy too!');
          } else if (jsData.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')) {
            console.log('GOOD: JWT key is in NEW deploy!');
          } else {
            console.log('UNKNOWN: Neither key found');
          }
        });
      });
      jsReq.end();
    } else {
      console.log('Could not find JS bundle in HTML');
      console.log(data.substring(0, 500));
    }
  });
});
req.end();
