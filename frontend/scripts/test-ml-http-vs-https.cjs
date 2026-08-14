const http = require('http');
const https = require('https');

const sampleMlUrls = [
  'https://http2.mlstatic.com/D_987399-MLU47549044297_092021-O.jpg',
  'http://http2.mlstatic.com/D_987399-MLU47549044297_092021-O.jpg',
  'https://http2.mlstatic.com/D_943997-MLU106854787617_022026-O.jpg',
  'http://http2.mlstatic.com/D_943997-MLU106854787617_022026-O.jpg'
];

async function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.request(url, { method: 'HEAD', headers: { 'User-Agent': 'facebookexternalhit/1.1' } }, (res) => {
        resolve({ url, status: res.statusCode, contentType: res.headers['content-type'], location: res.headers['location'] });
      });
      req.on('error', e => resolve({ url, error: e.message }));
      req.end();
    } catch (e) {
      resolve({ url, error: e.message });
    }
  });
}

async function run() {
  for (const u of sampleMlUrls) {
    const res = await checkUrl(u);
    console.log(res);
  }
}

run();
