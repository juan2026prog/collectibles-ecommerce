import fs from 'fs';

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

async function auditExtensions() {
  console.log('================================================================');
  console.log('AUDITORÍA PROFUNDA DE EXTENSIONES Y REALIDAD BINARIA (1.207 ITEMS)');
  console.log('================================================================\n');

  const feedUrl = 'https://collectibles.uy/merchant-feed.xml';
  const feedRes = await fetch(feedUrl);
  const xml = await feedRes.text();

  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  console.log(`Total <item> en merchant-feed.xml: ${itemMatches.length}\n`);

  const results = [];
  const counts = {
    PASS: 0,
    NO_EXTENSION: 0,
    WRONG_EXTENSION: 0,
    MIME_MISMATCH: 0,
    UNSUPPORTED_FORMAT: 0,
    BROKEN: 0
  };

  const CONCURRENCY = 60;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < itemMatches.length; i += CONCURRENCY) {
    const chunk = itemMatches.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async (itemMatch) => {
      const itemXml = itemMatch[1];
      const idMatch = itemXml.match(/<g:id>(.*?)<\/g:id>/);
      const titleMatch = itemXml.match(/<g:title>(.*?)<\/g:title>/);
      const linkMatch = itemXml.match(/<g:link>(.*?)<\/g:link>/);
      const imgMatch = itemXml.match(/<g:image_link>(.*?)<\/g:image_link>/);
      const priceMatch = itemXml.match(/<g:price>(.*?)<\/g:price>/);

      const productId = idMatch ? idMatch[1] : '';
      const title = titleMatch ? titleMatch[1] : '';
      const productSlug = linkMatch ? linkMatch[1].split('/producto/')[1] || '' : '';
      const imageUrl = imgMatch ? imgMatch[1] : '';
      const feedPrice = priceMatch ? priceMatch[1] : '';

      if (!imageUrl) {
        counts.BROKEN++;
        results.push({
          product_id: productId,
          title,
          product_slug: productSlug,
          image_url: '',
          final_url: '',
          http_status: 0,
          content_type: 'MISSING',
          magic_format: 'NONE',
          pathname: '',
          extension: '',
          status: 'BROKEN',
          feed_price: feedPrice
        });
        return;
      }

      let parsedPath = '';
      try {
        parsedPath = new URL(imageUrl).pathname;
      } catch {
        parsedPath = imageUrl;
      }

      const extension = getUrlExtension(imageUrl);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(imageUrl, {
          headers: { 'User-Agent': 'Googlebot-Image/1.0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const httpStatus = res.status;
        const finalUrl = res.url;
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        const magicFormat = detectRealFormat(buf);

        let status = 'PASS';

        if (httpStatus !== 200) {
          status = 'BROKEN';
        } else if (['AVIF', 'HTML', 'UNKNOWN'].includes(magicFormat)) {
          status = 'UNSUPPORTED_FORMAT';
        } else if (!extension) {
          status = 'NO_EXTENSION';
        } else if (!isExtensionMatchingFormat(extension, magicFormat)) {
          status = 'WRONG_EXTENSION';
        } else {
          if (magicFormat === 'JPEG' && !contentType.includes('jpeg') && !contentType.includes('jpg')) {
            status = 'MIME_MISMATCH';
          } else if (magicFormat === 'PNG' && !contentType.includes('png')) {
            status = 'MIME_MISMATCH';
          } else if (magicFormat === 'WEBP' && !contentType.includes('webp')) {
            status = 'MIME_MISMATCH';
          }
        }

        counts[status] = (counts[status] || 0) + 1;

        results.push({
          product_id: productId,
          title,
          product_slug: productSlug,
          image_url: imageUrl,
          final_url: finalUrl,
          http_status: httpStatus,
          content_type: contentType,
          magic_format: magicFormat,
          pathname: parsedPath,
          extension: extension || 'NONE',
          status,
          feed_price: feedPrice
        });
      } catch (err) {
        counts.BROKEN++;
        results.push({
          product_id: productId,
          title,
          product_slug: productSlug,
          image_url: imageUrl,
          final_url: imageUrl,
          http_status: 0,
          content_type: 'FETCH_ERROR',
          magic_format: 'ERROR',
          pathname: parsedPath,
          extension: extension || 'NONE',
          status: 'BROKEN',
          feed_price: feedPrice
        });
      }
    }));

    await sleep(15);
    console.log(`Progreso: ${Math.min(i + CONCURRENCY, itemMatches.length)} / ${itemMatches.length}`);
  }

  console.log(`\n\n================================================================`);
  console.log('RESUMEN DE AUDITORÍA DE EXTENSIONES Y MATEO FORMATO/MIME');
  console.log('================================================================');
  console.table(counts);

  // Write CSV
  let csv = `product_id,title,product_slug,image_url,final_url,http_status,content_type,magic_format,pathname,extension,status,feed_price\n`;
  results.forEach(r => {
    const cleanTitle = `"${r.title.replace(/"/g, '""')}"`;
    csv += `${r.product_id},${cleanTitle},${r.product_slug},${r.image_url},${r.final_url},${r.http_status},${r.content_type},${r.magic_format},${r.pathname},${r.extension},${r.status},${r.feed_price}\n`;
  });

  fs.mkdirSync('qa', { recursive: true });
  fs.writeFileSync('qa/MERCHANT_IMAGE_EXTENSION_AUDIT.csv', csv, 'utf8');
  console.log('\nqa/MERCHANT_IMAGE_EXTENSION_AUDIT.csv generado exitosamente.');
}

auditExtensions();
