import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseKey);

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

async function auditImages() {
  console.log('================================================================');
  console.log('AUDITORÍA PRECISA DE IMÁGENES PUBLICADAS (SUPABASE SDK)');
  console.log('================================================================\n');

  let allProducts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('products')
      .select('id, title, slug, base_price')
      .eq('is_active', true)
      .eq('status', 'published')
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching products batch:', error);
      break;
    }

    if (batch && batch.length > 0) {
      allProducts.push(...batch);
      if (batch.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  let allImages = [];
  page = 0;
  hasMore = true;
  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('product_images')
      .select('product_id, url, is_primary')
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching images batch:', error);
      break;
    }

    if (batch && batch.length > 0) {
      allImages.push(...batch);
      if (batch.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  const imageMap = {};
  allImages.forEach(img => {
    if (!imageMap[img.product_id] || img.is_primary) {
      imageMap[img.product_id] = img.url;
    }
  });

  console.log(`Total Productos a auditar: ${allProducts.length}\n`);

  const invalidImages = [];
  const formatCounts = {};
  const problemCounts = {};

  const CONCURRENCY = 25;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < allProducts.length; i += CONCURRENCY) {
    const chunk = allProducts.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (p) => {
      const rawUrl = imageMap[p.id] || '';
      if (!rawUrl) {
        invalidImages.push({
          product_id: p.id,
          title: p.title,
          product_slug: p.slug,
          image_url: '',
          http_status: 0,
          content_type: 'MISSING',
          real_format: 'NONE',
          problem: 'MISSING_IMAGE',
          proposed_fix: 'Assign valid primary image in product_images'
        });
        problemCounts['MISSING_IMAGE'] = (problemCounts['MISSING_IMAGE'] || 0) + 1;
        return;
      }

      const lowerUrl = rawUrl.toLowerCase();
      let urlExt = 'NONE';
      if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) urlExt = 'JPG';
      else if (lowerUrl.endsWith('.png')) urlExt = 'PNG';
      else if (lowerUrl.endsWith('.webp')) urlExt = 'WEBP';
      else if (lowerUrl.endsWith('.avif')) urlExt = 'AVIF';
      else if (lowerUrl.endsWith('.gif')) urlExt = 'GIF';

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const imgRes = await fetch(rawUrl, {
          headers: { 'User-Agent': 'Googlebot-Image/1.0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const status = imgRes.status;
        const contentType = imgRes.headers.get('content-type') || '';
        const arrayBuf = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const realFormat = detectRealFormat(buffer);

        formatCounts[realFormat] = (formatCounts[realFormat] || 0) + 1;

        const supportedFormats = ['JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'TIFF'];
        let problem = null;
        let proposedFix = null;

        if (status !== 200) {
          problem = `HTTP_${status}`;
          proposedFix = 'Fix broken image link or re-upload to Supabase Storage';
        } else if (realFormat === 'AVIF' || contentType.includes('avif') || urlExt === 'AVIF') {
          problem = 'UNSUPPORTED_FORMAT_AVIF';
          proposedFix = 'Convert/serve as WebP or JPEG via image proxy';
        } else if (realFormat === 'HTML') {
          problem = 'HTML_RESPONSE';
          proposedFix = 'Fix CDN proxy to serve binary image instead of HTML';
        } else if (!supportedFormats.includes(realFormat)) {
          problem = `UNSUPPORTED_FORMAT_${realFormat}`;
          proposedFix = 'Convert image to WebP or JPEG';
        }

        if (problem) {
          problemCounts[problem] = (problemCounts[problem] || 0) + 1;
          invalidImages.push({
            product_id: p.id,
            title: p.title,
            product_slug: p.slug,
            image_url: rawUrl,
            http_status: status,
            content_type: contentType,
            real_format: realFormat,
            problem,
            proposed_fix: proposedFix
          });
        }
      } catch (err) {
        const problem = `FETCH_ERROR_${err.name || 'FAILED'}`;
        problemCounts[problem] = (problemCounts[problem] || 0) + 1;
        invalidImages.push({
          product_id: p.id,
          title: p.title,
          product_slug: p.slug,
          image_url: rawUrl,
          http_status: 0,
          content_type: 'FETCH_ERROR',
          real_format: 'ERROR',
          problem,
          proposed_fix: 'Verify server network and image URL accessibility'
        });
      }
    }));

    await sleep(20);
    console.log(`Progreso: ${Math.min(i + CONCURRENCY, allProducts.length)} / ${allProducts.length}`);
  }

  console.log(`\n\n================================================================`);
  console.log('RESUMEN DE FORMATOS DETECTADOS EN DB');
  console.log('================================================================');
  console.table(formatCounts);

  console.log('\n================================================================');
  console.log('RESUMEN DE PROBLEMAS DE IMAGEN DETECTADOS');
  console.log('================================================================');
  console.table(problemCounts);
  console.log(`Total de imágenes problemáticas: ${invalidImages.length}\n`);

  // Write CSV
  let csv = `product_id,title,product_slug,image_url,http_status,content_type,real_format,problem,proposed_fix\n`;
  invalidImages.forEach(row => {
    const cleanTitle = `"${row.title.replace(/"/g, '""')}"`;
    const cleanFix = `"${row.proposed_fix.replace(/"/g, '""')}"`;
    csv += `${row.product_id},${cleanTitle},${row.product_slug},${row.image_url},${row.http_status},${row.content_type},${row.real_format},${row.problem},${cleanFix}\n`;
  });

  fs.mkdirSync('qa', { recursive: true });
  fs.writeFileSync('qa/merchant_invalid_images.csv', csv, 'utf8');
  console.log('qa/merchant_invalid_images.csv generado exitosamente.');
}

auditImages();
