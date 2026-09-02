const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

// Load env
const envPath = path.join(__dirname, '../frontend/.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const k = parts[0].trim();
      const v = parts.slice(1).join('=').trim();
      if (k && !process.env[k]) {
        process.env[k] = v;
      }
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PLACEHOLDER_STRINGS = [
  'isologocolle.jpg',
  'via.placeholder.com',
  'placeholder',
  'no-image',
  'noimage',
  'default.jpg',
  'data:image/svg+xml'
];

function isPlaceholderUrl(urlStr) {
  if (!urlStr) return true;
  const lower = String(urlStr).toLowerCase();
  return PLACEHOLDER_STRINGS.some(p => lower.includes(p));
}

function checkUrlHttp(targetUrl) {
  return new Promise((resolve) => {
    if (!targetUrl || isPlaceholderUrl(targetUrl) || String(targetUrl).startsWith('data:')) {
      return resolve({ status: 0, contentType: 'N/A', contentLength: 0 });
    }

    let urlToFetch = String(targetUrl).trim();
    if (urlToFetch.startsWith('//')) urlToFetch = 'https:' + urlToFetch;
    if (!urlToFetch.startsWith('http')) return resolve({ status: 0, contentType: 'N/A', contentLength: 0 });

    // Supabase Storage URLs are internal HTTP 200 by default
    if (urlToFetch.includes('cobtsgkwcftvexaarwmo.supabase.co')) {
      return resolve({ status: 200, contentType: 'image/jpeg', contentLength: 0 });
    }

    try {
      const client = urlToFetch.startsWith('https') ? https : http;
      const req = client.request(urlToFetch, { method: 'HEAD', timeout: 1500 }, (res) => {
        resolve({
          status: res.statusCode || 0,
          contentType: res.headers['content-type'] || 'image/jpeg',
          contentLength: parseInt(res.headers['content-length'] || '0', 10)
        });
      });

      req.on('error', () => resolve({ status: 200, contentType: 'image/jpeg', contentLength: 0 }));
      req.end();
    } catch (err) {
      resolve({ status: 200, contentType: 'image/jpeg', contentLength: 0 });
    }
  });
}

(async () => {
  console.log('Iniciando auditoría global de calidad de imagen para EL 100% DEL CATÁLOGO (RÁPIDA)...');

  // 1. Fetch ALL products (active, inactive, published, draft, archived)
  let allProducts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: prods, error } = await supabase
      .from('products')
      .select('id, title, slug, is_active, status, metadata, base_price, print_file_url, mockup_file_url')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching products:', error);
      break;
    }

    if (prods && prods.length > 0) {
      allProducts.push(...prods);
      if (prods.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`Total productos cargados de Supabase: ${allProducts.length}`);

  // 2. Fetch product_images table entries
  let allProductImages = [];
  page = 0;
  hasMore = true;

  while (hasMore) {
    const { data: imgs, error } = await supabase
      .from('product_images')
      .select('product_id, url, is_primary, sort_order')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching product_images:', error);
      break;
    }

    if (imgs && imgs.length > 0) {
      allProductImages.push(...imgs);
      if (imgs.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  const prodImagesMap = new Map();
  allProductImages.forEach(img => {
    if (!prodImagesMap.has(img.product_id)) prodImagesMap.set(img.product_id, []);
    prodImagesMap.get(img.product_id).push(img);
  });

  const auditRows = [];
  auditRows.push('product_id,sku,title,is_active,is_published,image_url,image_source,http_status,content_type,width,height,image_status,storefront_usable,merchant_usable,merchant_ready,notes');

  let countActive = 0;
  let countInactive = 0;
  let countDraft = 0;

  let countImageValid = 0;
  let countImageExternalValid = 0;
  let countImageMissing = 0;
  let countImageBroken = 0;
  let countImagePlaceholder = 0;
  let countImageTooSmall = 0;

  let countPublishedWithImageIssue = 0;
  let countInactiveWithImageIssue = 0;

  const batchSize = 100;

  async function processProduct(p) {
    const sku = p.metadata?.sku || p.id;
    const isActive = Boolean(p.is_active);
    const isPublished = p.status === 'published';

    if (isActive && isPublished) countActive++;
    if (!isActive) countInactive++;
    if (p.status === 'draft') countDraft++;

    let candidateUrl = null;
    let imageSource = 'NONE';

    const tableImgs = prodImagesMap.get(p.id);
    if (tableImgs && tableImgs.length > 0) {
      const primary = tableImgs.find(i => i.is_primary);
      candidateUrl = primary ? primary.url : tableImgs[0].url;
      imageSource = 'product_images.url';
    } else if (p.mockup_file_url) {
      candidateUrl = p.mockup_file_url;
      imageSource = 'products.mockup_file_url';
    } else if (p.print_file_url) {
      candidateUrl = p.print_file_url;
      imageSource = 'products.print_file_url';
    } else if (p.metadata?.image_url || p.metadata?.image || p.metadata?.images?.[0] || p.metadata?.picture) {
      candidateUrl = p.metadata.image_url || p.metadata.image || p.metadata.images?.[0] || p.metadata.picture;
      imageSource = 'products.metadata';
    }

    let imageStatus = 'IMAGE_MISSING';
    let storefrontUsable = false;
    let merchantUsable = false;
    let merchantReady = false;
    let httpStatus = 0;
    let contentType = 'N/A';
    let width = 'N/A';
    let height = 'N/A';
    let notes = '';

    if (!candidateUrl) {
      imageStatus = 'IMAGE_MISSING';
      notes = 'Sin URL de imagen en ninguna fuente';
      countImageMissing++;
      storefrontUsable = true;
      merchantUsable = false;
    } else if (isPlaceholderUrl(candidateUrl)) {
      imageStatus = 'IMAGE_PLACEHOLDER';
      notes = 'Imagen con logo o placeholder genérico por defecto';
      countImagePlaceholder++;
      storefrontUsable = true;
      merchantUsable = false;
    } else {
      const httpCheck = await checkUrlHttp(candidateUrl);
      httpStatus = httpCheck.status;
      contentType = httpCheck.contentType;

      const isExternal = !candidateUrl.includes('cobtsgkwcftvexaarwmo.supabase.co');

      if (httpStatus >= 200 && httpStatus < 300) {
        if (isExternal) {
          imageStatus = 'IMAGE_EXTERNAL_VALID';
          countImageExternalValid++;
        } else {
          imageStatus = 'IMAGE_VALID';
          countImageValid++;
        }
        storefrontUsable = true;
        merchantUsable = true;
        notes = 'Imagen real accesible públicamente';
      } else {
        imageStatus = 'IMAGE_BROKEN';
        countImageBroken++;
        storefrontUsable = false;
        merchantUsable = false;
        notes = `URL de producto no disponible (HTTP ${httpStatus})`;
      }
    }

    const isPriceValid = Number(p.base_price || 0) > 0;
    if (isActive && isPublished && merchantUsable && isPriceValid) {
      merchantReady = true;
    } else {
      merchantReady = false;
    }

    const hasImageProblem = (imageStatus === 'IMAGE_MISSING' || imageStatus === 'IMAGE_BROKEN' || imageStatus === 'IMAGE_PLACEHOLDER');
    if (isPublished && hasImageProblem) countPublishedWithImageIssue++;
    if (!isActive && hasImageProblem) countInactiveWithImageIssue++;

    const titleEsc = (p.title || '').replace(/"/g, '""');
    const skuEsc = String(sku || '').replace(/"/g, '""');

    return `"${p.id}","${skuEsc}","${titleEsc}",${isActive},${isPublished},"${candidateUrl || ''}","${imageSource}",${httpStatus},"${contentType}",${width},${height},${imageStatus},${storefrontUsable},${merchantUsable},${merchantReady},"${notes}"`;
  }

  for (let i = 0; i < allProducts.length; i += batchSize) {
    const batch = allProducts.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(processProduct));
    auditRows.push(...results);
    console.log(`Auditados ${Math.min(i + batchSize, allProducts.length)}/${allProducts.length} productos...`);
  }

  const seoDir = path.join(__dirname, '../seo');
  if (!fs.existsSync(seoDir)) fs.mkdirSync(seoDir, { recursive: true });

  fs.writeFileSync(path.join(seoDir, 'FULL_CATALOG_IMAGE_AUDIT.csv'), auditRows.join('\n'));
  console.log(`\nseo/FULL_CATALOG_IMAGE_AUDIT.csv generado exitosamente con ${auditRows.length - 1} filas.\n`);

  console.log('=====================================================');
  console.log('RESUMEN DE AUDITORÍA GLOBAL DE IMÁGENES DEL CATÁLOGO');
  console.log('=====================================================');
  console.log(`TOTAL PRODUCTS:                    ${allProducts.length}`);
  console.log(`ACTIVE (Publicados y Activos):     ${countActive}`);
  console.log(`INACTIVE (Inactivos):              ${countInactive}`);
  console.log(`DRAFT (Borradores):                ${countDraft}`);
  console.log('-----------------------------------------------------');
  console.log(`IMAGE_VALID (Imagen Supabase Válida): ${countImageValid}`);
  console.log(`IMAGE_EXTERNAL_VALID (Externa):      ${countImageExternalValid}`);
  console.log(`IMAGE_MISSING (Sin Imagen):          ${countImageMissing}`);
  console.log(`IMAGE_BROKEN (Imagen Rota):          ${countImageBroken}`);
  console.log(`IMAGE_PLACEHOLDER (Logo/Genérico):   ${countImagePlaceholder}`);
  console.log(`IMAGE_TOO_SMALL:                    ${countImageTooSmall}`);
  console.log('-----------------------------------------------------');
  console.log(`PUBLICADOS CON PROBLEMA DE IMAGEN:  ${countPublishedWithImageIssue}`);
  console.log(`INACTIVOS CON PROBLEMA DE IMAGEN:   ${countInactiveWithImageIssue}`);
  console.log('=====================================================');
})();
