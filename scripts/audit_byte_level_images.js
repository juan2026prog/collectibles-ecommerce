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

function getUrlExtension(urlString) {
  try {
    const parsed = new URL(urlString);
    const pathname = parsed.pathname;
    const lastPart = pathname.split('/').pop() || '';
    if (!lastPart.includes('.')) return '';
    const ext = lastPart.split('.').pop() || '';
    return ext.toLowerCase();
  } catch {
    return '';
  }
}

function isExtensionMatchingFormat(ext, realFormat) {
  if (!ext) return false;
  if (realFormat === 'JPEG' && (ext === 'jpg' || ext === 'jpeg')) return true;
  if (realFormat === 'WEBP' && ext === 'webp') return true;
  if (realFormat === 'PNG' && ext === 'png') return true;
  if (realFormat === 'GIF' && ext === 'gif') return true;
  if (realFormat === 'BMP' && ext === 'bmp') return true;
  if (realFormat === 'TIFF' && (ext === 'tif' || ext === 'tiff')) return true;
  return false;
}

async function runFullAudit() {
  console.log('================================================================');
  console.log(`AUDITORÍA STRICT: MAGIC BYTES + EXTENSIONES + MIME (1.207 ITEMS)`);
  console.log(`Target Feed: ${targetFeedUrl}`);
  console.log('================================================================\n');

  const res = await fetch(targetFeedUrl);
  const xml = await res.text();

  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  console.log(`Total <item> en feed: ${itemMatches.length}\n`);

  let valid = 0;
  let noExtension = 0;
  let wrongExtension = 0;
  let mimeMismatch = 0;
  let broken = 0;
  let unsupported = 0;

  const CONCURRENCY = 60;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < itemMatches.length; i += CONCURRENCY) {
    const chunk = itemMatches.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async (itemMatch) => {
      const itemXml = itemMatch[1];
      const imgMatch = itemXml.match(/<g:image_link>(.*?)<\/g:image_link>/);
      if (!imgMatch) {
        broken++;
        return;
      }

      const imgUrl = imgMatch[1];
      const extension = getUrlExtension(imgUrl);

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
          broken++;
          return;
        }

        if (['AVIF', 'HTML', 'UNKNOWN'].includes(realFmt)) {
          unsupported++;
          return;
        }

        if (!extension) {
          noExtension++;
          return;
        }

        if (!isExtensionMatchingFormat(extension, realFmt)) {
          wrongExtension++;
          return;
        }

        if (realFmt === 'JPEG' && !contentType.includes('jpeg') && !contentType.includes('jpg')) {
          mimeMismatch++;
          return;
        }
        if (realFmt === 'PNG' && !contentType.includes('png')) {
          mimeMismatch++;
          return;
        }
        if (realFmt === 'WEBP' && !contentType.includes('webp')) {
          mimeMismatch++;
          return;
        }

        valid++;
      } catch (err) {
        broken++;
      }
    }));

    await sleep(15);
    console.log(`Progreso: ${Math.min(i + CONCURRENCY, itemMatches.length)} / ${itemMatches.length}`);
  }

  const totalEvaluated = valid + noExtension + wrongExtension + mimeMismatch + broken + unsupported;

  console.log('\n\n================================================================');
  console.log('RESULTADO FINAL DE LA AUDITORÍA DE EXTENSIÓN Y FORMATO');
  console.log('================================================================');
  console.log(`TOTAL:              ${itemMatches.length}`);
  console.log(`VALID:              ${valid}`);
  console.log(`NO_EXTENSION:       ${noExtension}`);
  console.log(`WRONG_EXTENSION:    ${wrongExtension}`);
  console.log(`MIME_MISMATCH:      ${mimeMismatch}`);
  console.log(`BROKEN:             ${broken}`);
  console.log(`UNSUPPORTED:        ${unsupported}`);
  console.log(`TOTAL EVALUATED:    ${totalEvaluated}`);
  console.log('================================================================\n');

  if (valid === itemMatches.length && noExtension === 0 && wrongExtension === 0 && mimeMismatch === 0 && broken === 0 && unsupported === 0) {
    console.log('AUDITORÍA STRICT EXTENSIONS PASS ✅');
  } else {
    console.error('AUDITORÍA STRICT EXTENSIONS FALLIDA ❌');
    process.exit(1);
  }
}

runFullAudit();
