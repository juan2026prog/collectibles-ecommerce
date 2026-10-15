import { readFile, stat } from 'node:fs/promises';
import { brotliCompressSync } from 'node:zlib';
const root = process.argv[2] || 'frontend/dist';
const manifest = JSON.parse(await readFile(`${root}/.vite/manifest.json`, 'utf8'));
const seen = new Set();
const walk = key => {
  if (seen.has(key)) return;
  seen.add(key);
  for (const dependency of manifest[key]?.imports || []) walk(dependency);
};
walk('index.html');
let bytes = 0, brotli = 0;
for (const key of seen) {
  const item = manifest[key];
  if (/(?:Admin|VendorDashboard|ArtistDashboard|AffiliateDashboard|Star2FanDashboard|vendor-excel)/.test(item.file)) {
    throw new Error(`Private route included in initial static graph: ${key}`);
  }
  const buffer = await readFile(`${root}/${item.file}`);
  bytes += (await stat(`${root}/${item.file}`)).size;
  brotli += brotliCompressSync(buffer).length;
}
const html = await readFile(`${root}/index.html`, 'utf8');
if (/<link[^>]+modulepreload[^>]+(?:admin-chunk|portal-chunk)/i.test(html)) throw new Error('Private route preload in HTML');
console.log(JSON.stringify({initial_modules:seen.size,decoded_bytes:bytes,brotli_estimate_bytes:brotli,private_route_modules:0},null,2));
