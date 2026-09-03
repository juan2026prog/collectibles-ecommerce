import fs from 'fs';

const targetFeedUrl = process.argv[2] || 'https://collectibles.uy/merchant-feed.xml';

function detectRealFormat(buffer) {
  if (!buffer || buffer.length < 12) return 'UNKNOWN';

  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'JPEG';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'PNG';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'WEBP';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'GIF';

  const hexStr = buffer.toString('hex', 0, 32);
  if (hexStr.includes('6674797061766966') || hexStr.includes('667479706d696631') || hexStr.includes('61766966')) {
    return 'AVIF';
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) return 'BMP';

  const textStr = buffer.toString('utf8', 0, 100).toLowerCase();
  if (textStr.includes('<html') || textStr.includes('<!doctype html') || textStr.includes('<xml')) return 'HTML';

  return 'UNKNOWN';
}

async function runByteLevelAudit() {
  console.log('================================================================');
  console.log(`AUDITORÍA BYTE-LEVEL COMPLETA DE 1.207 IMÁGENES`);
  console.log(`Target Feed: ${targetFeedUrl}`);
  console.log('================================================================\n');

  const res = await fetch(targetFeedUrl);
  const xml = await res.text();

  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  console.log(`Total <item> en feed: ${itemMatches.length}\n`);

  let jpegReal = 0;
  let webpReal = 0;
  let pngReal = 0;
  let otherSupported = 0;
  let avifCount = 0;
  let mimeMismatchCount = 0;
  let brokenCount = 0;

  const CONCURRENCY = 50;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < itemMatches.length; i += CONCURRENCY) {
    const chunk = itemMatches.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async (itemMatch) => {
      const itemXml = itemMatch[1];
      const imgMatch = itemXml.match(/<g:image_link>(.*?)<\/g:image_link>/);
      if (!imgMatch) {
        brokenCount++;
        return;
      }

      const imgUrl = imgMatch[1];

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const imgRes = await fetch(imgUrl, {
          headers: { 'User-Agent': 'Googlebot-Image/1.0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const status = imgRes.status;
        const contentType = (imgRes.headers.get('content-type') || '').toLowerCase();
        const arrayBuf = await imgRes.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        const realFmt = detectRealFormat(buf);

        if (status !== 200) {
          brokenCount++;
          return;
        }

        if (realFmt === 'AVIF' || contentType.includes('avif')) {
          avifCount++;
          return;
        }

        if (realFmt === 'JPEG') {
          if (contentType.includes('jpeg') || contentType.includes('jpg')) {
            jpegReal++;
          } else {
            mimeMismatchCount++;
          }
        } else if (realFmt === 'PNG') {
          if (contentType.includes('png')) {
            pngReal++;
          } else {
            mimeMismatchCount++;
          }
        } else if (realFmt === 'WEBP') {
          if (contentType.includes('webp')) {
            webpReal++;
          } else {
            mimeMismatchCount++;
          }
        } else if (['GIF', 'BMP', 'TIFF'].includes(realFmt)) {
          otherSupported++;
        } else {
          brokenCount++;
        }
      } catch (err) {
        brokenCount++;
      }
    }));

    await sleep(15);
    console.log(`Progreso: ${Math.min(i + CONCURRENCY, itemMatches.length)} / ${itemMatches.length}`);
  }

  const totalEvaluated = jpegReal + webpReal + pngReal + otherSupported + avifCount + mimeMismatchCount + brokenCount;

  console.log('\n\n================================================================');
  console.log('RESULTADO FINAL DE LA AUDITORÍA BYTE-LEVEL (1.207 ITEMS)');
  console.log('================================================================');
  console.log(`JPEG REAL:         ${jpegReal}`);
  console.log(`WEBP REAL:         ${webpReal}`);
  console.log(`PNG REAL:          ${pngReal}`);
  console.log(`OTHER SUPPORTED:   ${otherSupported}`);
  console.log(`AVIF:              ${avifCount}`);
  console.log(`MIME MISMATCH:     ${mimeMismatchCount}`);
  console.log(`BROKEN:            ${brokenCount}`);
  console.log(`TOTAL EVALUATED:   ${totalEvaluated}`);
  console.log('================================================================\n');

  if (avifCount === 0 && mimeMismatchCount === 0 && brokenCount === 0 && totalEvaluated === itemMatches.length) {
    console.log('CERTIFICACIÓN INTERNA TECNOLÓGICA 100% PASS ✅');
  } else {
    console.error('CERTIFICACIÓN FALLIDA ❌');
    process.exit(1);
  }
}

runByteLevelAudit();
