import fs from 'fs';

function detectRealFormat(buffer) {
  if (!buffer || buffer.length < 12) return 'UNKNOWN';

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'JPEG';
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'PNG';
  }

  // WEBP: RIFF .... WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'WEBP';
  }

  // GIF: GIF8
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'GIF';
  }

  // AVIF: ftypavif or ftypmif1
  const hexStr = buffer.toString('hex', 0, 32);
  if (hexStr.includes('6674797061766966') || hexStr.includes('667479706d696631') || hexStr.includes('61766966')) {
    return 'AVIF';
  }

  // BMP: BM
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return 'BMP';
  }

  // HTML response
  const textStr = buffer.toString('utf8', 0, 100).toLowerCase();
  if (textStr.includes('<html') || textStr.includes('<!doctype html') || textStr.includes('<xml')) {
    return 'HTML';
  }

  return 'UNKNOWN';
}

async function diagnose() {
  console.log('================================================================');
  console.log('DIAGNÓSTICO PROFUNDO DE DISAPPROVALS EN MERCHANT FEED');
  console.log('================================================================\n');

  const res = await fetch('https://collectibles.uy/merchant-feed.xml');
  const xml = await res.text();

  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  console.log(`Analizando ${itemMatches.length} items en el feed...\n`);

  let invalidImageCount = 0;
  let invalidPriceCount = 0;
  const invalidImages = [];
  const invalidPrices = [];

  const BATCH_SIZE = 80;

  for (let i = 0; i < itemMatches.length; i += BATCH_SIZE) {
    const batch = itemMatches.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (match) => {
      const itemXml = match[1];

      const idMatch = itemXml.match(/<g:id>(.*?)<\/g:id>/);
      const titleMatch = itemXml.match(/<g:title>(.*?)<\/g:title>/);
      const linkMatch = itemXml.match(/<g:link>(.*?)<\/g:link>/);
      const imgMatch = itemXml.match(/<g:image_link>(.*?)<\/g:image_link>/);
      const priceMatch = itemXml.match(/<g:price>(.*?)<\/g:price>/);

      const productId = idMatch ? idMatch[1] : 'UNKNOWN';
      const title = titleMatch ? titleMatch[1] : 'UNKNOWN';
      const link = linkMatch ? linkMatch[1] : '';
      const slug = link.replace('https://collectibles.uy/producto/', '');
      const imageUrl = imgMatch ? imgMatch[1] : '';
      const priceStr = priceMatch ? priceMatch[1] : '';

      // 1. Audit Price
      const priceNum = parseFloat(priceStr.replace(' UYU', '').trim());
      if (isNaN(priceNum) || priceNum <= 0) {
        invalidPriceCount++;
        invalidPrices.push({
          product_id: productId,
          title,
          slug,
          feed_price: priceStr,
          price_num: priceNum
        });
      }

      // 2. Audit Image
      if (!imageUrl) {
        invalidImageCount++;
        invalidImages.push({
          product_id: productId,
          title,
          slug,
          image_url: '',
          http_status: 0,
          content_type: 'MISSING',
          real_format: 'NONE',
          problem: 'MISSING_IMAGE_URL',
          proposed_fix: 'Assign valid primary image in product_images'
        });
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const imgRes = await fetch(imageUrl, {
          headers: { 'User-Agent': 'Googlebot-Image/1.0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const httpStatus = imgRes.status;
        const contentType = imgRes.headers.get('content-type') || '';

        // Read first 512 bytes for fast magic bytes detection
        const arrayBuf = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const realFormat = detectRealFormat(buffer);

        const supportedFormats = ['JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'TIFF'];
        const isSupportedFormat = supportedFormats.includes(realFormat);

        let problem = null;
        let proposedFix = null;

        if (httpStatus !== 200) {
          problem = `HTTP_${httpStatus}`;
          proposedFix = 'Fix broken URL or restore image in storage';
        } else if (realFormat === 'AVIF') {
          problem = 'UNSUPPORTED_FORMAT_AVIF';
          proposedFix = 'Re-encode to WebP/JPEG or use original JPEG/PNG URL';
        } else if (realFormat === 'HTML') {
          problem = 'HTML_RESPONSE';
          proposedFix = 'Fix CDN proxy route to serve raw binary image';
        } else if (!isSupportedFormat) {
          problem = `UNSUPPORTED_FORMAT_${realFormat}`;
          proposedFix = 'Convert image to WebP or JPEG';
        }

        if (problem) {
          invalidImageCount++;
          invalidImages.push({
            product_id: productId,
            title,
            slug,
            image_url: imageUrl,
            http_status: httpStatus,
            content_type: contentType,
            real_format: realFormat,
            problem,
            proposed_fix: proposedFix
          });
        }
      } catch (err) {
        invalidImageCount++;
        invalidImages.push({
          product_id: productId,
          title,
          slug,
          image_url: imageUrl,
          http_status: 0,
          content_type: 'FETCH_ERROR',
          real_format: 'ERROR',
          problem: `FETCH_ERROR: ${err.message}`,
          proposed_fix: 'Check server network or URL syntax'
        });
      }
    }));
    console.log(`Progreso: ${Math.min(i + BATCH_SIZE, itemMatches.length)} / ${itemMatches.length}`);
  }

  console.log(`\n================================================================`);
  console.log('RESULTADOS DEL DIAGNÓSTICO EN VIVO');
  console.log('================================================================');
  console.log(`Total Productos con Precio Inválido (<= 0): ${invalidPriceCount}`);
  console.log(`Total Productos con Imagen Inválida (AVIF, HTTP error, format, etc.): ${invalidImageCount}\n`);

  console.log('--- DETALLE DE PRECIOS INVÁLIDOS ---');
  console.table(invalidPrices);

  console.log('\n--- RESUMEN DE PROBLEMAS DE IMAGEN ---');
  const problemCounts = {};
  invalidImages.forEach(img => {
    problemCounts[img.problem] = (problemCounts[img.problem] || 0) + 1;
  });
  console.table(problemCounts);

  // Export CSV
  let csv = `product_id,title,product_slug,image_url,http_status,content_type,real_format,problem,proposed_fix\n`;
  invalidImages.forEach(row => {
    const cleanTitle = `"${row.title.replace(/"/g, '""')}"`;
    const cleanFix = `"${row.proposed_fix.replace(/"/g, '""')}"`;
    csv += `${row.product_id},${cleanTitle},${row.slug},${row.image_url},${row.http_status},${row.content_type},${row.real_format},${row.problem},${cleanFix}\n`;
  });

  fs.mkdirSync('qa', { recursive: true });
  fs.writeFileSync('qa/merchant_invalid_images.csv', csv, 'utf8');
  console.log('\nqa/merchant_invalid_images.csv generado exitosamente.');
}

diagnose();
