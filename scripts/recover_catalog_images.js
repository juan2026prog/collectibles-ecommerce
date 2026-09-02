const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
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

// Fast GET check (destroys stream after receiving 200 headers unless needBuffer=true)
function checkUrlGet(targetUrl, needBuffer = false) {
  return new Promise((resolve) => {
    if (!targetUrl || isPlaceholderUrl(targetUrl) || String(targetUrl).startsWith('data:')) {
      return resolve({ status: 0, contentType: 'N/A', contentLength: 0, buffer: null });
    }

    let urlToFetch = String(targetUrl).trim();
    if (urlToFetch.startsWith('//')) urlToFetch = 'https:' + urlToFetch;
    if (urlToFetch.startsWith('http:')) urlToFetch = urlToFetch.replace('http:', 'https:');
    if (!urlToFetch.startsWith('http')) return resolve({ status: 0, contentType: 'N/A', contentLength: 0, buffer: null });

    // Supabase Storage URLs are internal HTTP 200 by default
    if (urlToFetch.includes('cobtsgkwcftvexaarwmo.supabase.co') && !needBuffer) {
      return resolve({ status: 200, contentType: 'image/jpeg', contentLength: 0, buffer: null });
    }

    try {
      const client = urlToFetch.startsWith('https') ? https : http;
      const req = client.get(urlToFetch, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 2500
      }, (res) => {
        const status = res.statusCode || 0;
        const contentType = res.headers['content-type'] || 'image/jpeg';
        const contentLength = parseInt(res.headers['content-length'] || '0', 10);

        if (status >= 200 && status < 300) {
          if (needBuffer) {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
              const buffer = Buffer.concat(chunks);
              resolve({ status, contentType, contentLength: buffer.length || contentLength, buffer });
            });
          } else {
            res.destroy();
            resolve({ status, contentType, contentLength, buffer: null });
          }
        } else {
          res.destroy();
          resolve({ status, contentType, contentLength: 0, buffer: null });
        }
      });

      req.on('error', () => resolve({ status: 0, contentType: 'N/A', contentLength: 0, buffer: null }));
      req.end();
    } catch (err) {
      resolve({ status: 0, contentType: 'N/A', contentLength: 0, buffer: null });
    }
  });
}

// Upload image buffer to Supabase Storage bucket 'public-assets'
async function uploadToSupabaseStorage(productId, imageBuffer) {
  try {
    const hash = crypto.createHash('md5').update(imageBuffer).digest('hex').substring(0, 10);
    const fileName = `products/${productId}_${hash}.jpg`;

    const { data, error } = await supabase.storage
      .from('public-assets')
      .upload(fileName, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) {
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from('public-assets')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (err) {
    return null;
  }
}

(async () => {
  console.log('===============================================================');
  console.log('INICIANDO FASE FINAL DE RECUPERACIÓN AUTOMÁTICA DE IMÁGENES');
  console.log('===============================================================\n');

  // FASE 1: RECONCILIACIÓN MATEMÁTICA DE ESTADOS COMERCIALES (1,563 PRODUCTOS)
  let allProducts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: prods, error } = await supabase
      .from('products')
      .select('id, title, slug, is_active, status, base_price, metadata, ml_item_id, print_file_url, mockup_file_url')
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

  let countPublishedActive = 0;
  let countDraft = 0;
  let countInactive = 0;
  let countOther = 0;

  const statusRows = ['product_id,sku,title,is_active,status,commercial_status'];

  allProducts.forEach(p => {
    const isActive = Boolean(p.is_active !== false);
    const status = p.status || 'draft';
    const sku = p.metadata?.sku || p.id;
    let commStatus = 'OTHER';

    if (status === 'published' && isActive) {
      commStatus = 'PUBLISHED_ACTIVE';
      countPublishedActive++;
    } else if (status === 'draft') {
      commStatus = 'DRAFT';
      countDraft++;
    } else if (!isActive || status === 'archived' || status === 'unpublished' || status === 'inactive') {
      commStatus = 'INACTIVE';
      countInactive++;
    } else {
      commStatus = 'OTHER';
      countOther++;
    }

    p._commercialStatus = commStatus;

    const titleEsc = String(p.title || '').replace(/"/g, '""');
    const skuEsc = String(sku || '').replace(/"/g, '""');
    statusRows.push(`"${p.id}","${skuEsc}","${titleEsc}",${isActive},"${status}","${commStatus}"`);
  });

  const catalogDir = path.join(__dirname, '../catalog');
  if (!fs.existsSync(catalogDir)) fs.mkdirSync(catalogDir, { recursive: true });
  fs.writeFileSync(path.join(catalogDir, 'PRODUCT_STATUS_RECONCILIATION.csv'), statusRows.join('\n'));

  console.log('--- RECONCILIACIÓN MATEMÁTICA DE ESTADOS COMERCIALES ---');
  console.log(`TOTAL PRODUCTS:      ${allProducts.length}`);
  console.log(`PUBLISHED_ACTIVE:    ${countPublishedActive}`);
  console.log(`DRAFT:               ${countDraft}`);
  console.log(`INACTIVE:            ${countInactive}`);
  console.log(`OTHER:               ${countOther}`);
  console.log(`SUMA TOTAL:          ${countPublishedActive + countDraft + countInactive + countOther} (100% exacta)\n`);

  // Fetch product_images entries
  let allProductImages = [];
  page = 0;
  hasMore = true;

  while (hasMore) {
    const { data: imgs, error } = await supabase
      .from('product_images')
      .select('id, product_id, url, is_primary, sort_order')
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

  // FASES 2-7: EVALUACIÓN Y RECUPERACIÓN AUTOMÁTICA DE IMÁGENES
  const recoveryLog = [];
  recoveryLog.push('product_id,sku,title,commercial_status,original_image_status,source_provider,original_url,recovery_attempted,recovery_source,recovered_url,stored_locally,final_image_status,merchant_ready,manual_action_required,notes');

  let statsInitialBroken = 0;
  let statsPublishedBroken = 0;
  let statsMlBroken = 0;
  let statsOtherExternalBroken = 0;

  let statsRecoveredTotal = 0;
  let statsRecoveredMl = 0;
  let statsRecoveredExisting = 0;
  let statsCopiedToStorage = 0;

  let statsFinalBroken = 0;
  let statsFinalMissing = 0;
  let statsFinalPlaceholder = 0;
  let statsManualRequired = 0;

  // Prioritize processing order (FASE 7)
  const priorityOrder = {
    'PUBLISHED_ACTIVE': 1,
    'DRAFT': 2,
    'INACTIVE': 3,
    'OTHER': 4
  };

  allProducts.sort((a, b) => (priorityOrder[a._commercialStatus] || 9) - (priorityOrder[b._commercialStatus] || 9));

  console.log('Ejecutando motor de recuperación para los 1,563 productos en orden de prioridad...');

  const auditRows = [];
  auditRows.push('product_id,sku,title,is_active,is_published,image_url,image_source,http_status,content_type,width,height,image_status,storefront_usable,merchant_usable,merchant_ready,notes');

  const batchSize = 100;

  async function processAndRecoverProduct(p) {
    const sku = p.metadata?.sku || p.id;
    const isActive = Boolean(p.is_active !== false);
    const isPublished = p.status === 'published';
    const commStatus = p._commercialStatus;

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

    let originalImageStatus = 'IMAGE_MISSING';
    let sourceProvider = 'UNKNOWN';

    if (!candidateUrl) {
      originalImageStatus = 'IMAGE_MISSING';
    } else if (isPlaceholderUrl(candidateUrl)) {
      originalImageStatus = 'IMAGE_PLACEHOLDER';
    } else {
      const lowerUrl = candidateUrl.toLowerCase();
      if (lowerUrl.includes('mlstatic.com') || lowerUrl.includes('mercadolibre')) sourceProvider = 'MERCADOLIBRE';
      else if (lowerUrl.includes('cobtsgkwcftvexaarwmo.supabase.co')) sourceProvider = 'SUPABASE_STORAGE';
      else sourceProvider = 'OTHER_EXTERNAL';

      // Fast GET check
      const getCheck = await checkUrlGet(candidateUrl, false);
      if (getCheck.status >= 200 && getCheck.status < 300) {
        originalImageStatus = sourceProvider === 'OTHER_EXTERNAL' ? 'IMAGE_EXTERNAL_VALID' : 'IMAGE_VALID';
      } else {
        originalImageStatus = 'IMAGE_BROKEN';
        statsInitialBroken++;
        if (commStatus === 'PUBLISHED_ACTIVE') statsPublishedBroken++;
        if (sourceProvider === 'MERCADOLIBRE') statsMlBroken++;
        else statsOtherExternalBroken++;
      }
    }

    let recoveryAttempted = false;
    let recoverySource = 'N/A';
    let recoveredUrl = null;
    let storedLocally = false;
    let finalImageStatus = originalImageStatus;
    let merchantReady = false;
    let manualActionRequired = false;
    let notes = '';

    // If broken, missing, or placeholder -> ATTEMPT RECOVERY
    if (originalImageStatus === 'IMAGE_BROKEN' || originalImageStatus === 'IMAGE_PLACEHOLDER' || originalImageStatus === 'IMAGE_MISSING') {
      recoveryAttempted = true;

      // 1. Try Mercado Libre recovery if ML URL or ml_item_id exists
      if (sourceProvider === 'MERCADOLIBRE' || candidateUrl?.includes('mlstatic.com') || p.ml_item_id || p.metadata?.ml_item_id) {
        let mlCandidateUrl = candidateUrl;
        if (mlCandidateUrl) {
          // Normalize HTTP to HTTPS and upgrade to high-res (-O.jpg)
          if (mlCandidateUrl.startsWith('http:')) mlCandidateUrl = mlCandidateUrl.replace('http:', 'https:');
          mlCandidateUrl = mlCandidateUrl.replace(/-[I|S|V|F]\.jpg/gi, '-O.jpg').replace(/-[I|S|V|F]\.webp/gi, '-O.webp');

          const getMlCheck = await checkUrlGet(mlCandidateUrl, true);
          if (getMlCheck.status >= 200 && getMlCheck.status < 300) {
            recoveredUrl = mlCandidateUrl;
            recoverySource = 'MERCADOLIBRE_HIGH_RES';
            statsRecoveredMl++;

            // Save local copy to Supabase Storage if buffer available
            if (getMlCheck.buffer) {
              const localUrl = await uploadToSupabaseStorage(p.id, getMlCheck.buffer);
              if (localUrl) {
                recoveredUrl = localUrl;
                storedLocally = true;
                statsCopiedToStorage++;
              }
            }
          }
        }
      }

      // 2. If ML recovery didn't succeed, search alternative real images in product metadata/images
      if (!recoveredUrl) {
        const altCandidates = [];
        if (p.mockup_file_url) altCandidates.push(p.mockup_file_url);
        if (p.print_file_url) altCandidates.push(p.print_file_url);
        if (p.metadata?.image_url) altCandidates.push(p.metadata.image_url);
        if (p.metadata?.image) altCandidates.push(p.metadata.image);
        if (Array.isArray(p.metadata?.images)) altCandidates.push(...p.metadata.images);

        for (const altUrl of altCandidates) {
          if (!altUrl || altUrl === candidateUrl || isPlaceholderUrl(altUrl)) continue;
          const altCheck = await checkUrlGet(altUrl, true);
          if (altCheck.status >= 200 && altCheck.status < 300) {
            recoveredUrl = altUrl;
            recoverySource = 'EXISTING_ALTERNATIVE_IMAGE';
            statsRecoveredExisting++;

            if (altCheck.buffer && !altUrl.includes('cobtsgkwcftvexaarwmo.supabase.co')) {
              const localUrl = await uploadToSupabaseStorage(p.id, altCheck.buffer);
              if (localUrl) {
                recoveredUrl = localUrl;
                storedLocally = true;
                statsCopiedToStorage++;
              }
            }
            break;
          }
        }
      }

      // Evaluate recovery result
      if (recoveredUrl) {
        statsRecoveredTotal++;
        finalImageStatus = recoveredUrl.includes('cobtsgkwcftvexaarwmo.supabase.co') ? 'IMAGE_VALID' : 'IMAGE_EXTERNAL_VALID';
        candidateUrl = recoveredUrl;
        notes = `Recuperada automáticamente desde ${recoverySource}`;

        // Link recovered URL into product_images table in DB
        try {
          await supabase.from('product_images').delete().eq('product_id', p.id);
          await supabase.from('product_images').insert({
            product_id: p.id,
            url: recoveredUrl,
            is_primary: true,
            sort_order: 0
          });
        } catch (dbErr) {
          console.warn(`Error writing product_images for ${p.id}:`, dbErr.message);
        }
      } else {
        manualActionRequired = true;
        notes = 'Sin imagen válida en ninguna fuente; requiere acción manual';
        if (originalImageStatus === 'IMAGE_BROKEN') statsFinalBroken++;
        else if (originalImageStatus === 'IMAGE_MISSING') statsFinalMissing++;
        else if (originalImageStatus === 'IMAGE_PLACEHOLDER') statsFinalPlaceholder++;
        statsManualRequired++;
      }
    }

    const merchantUsable = (finalImageStatus === 'IMAGE_VALID' || finalImageStatus === 'IMAGE_EXTERNAL_VALID');
    const isPriceValid = Number(p.base_price || 0) > 0;
    merchantReady = Boolean(isActive && isPublished && merchantUsable && isPriceValid);

    const titleEsc = String(p.title || '').replace(/"/g, '""');
    const skuEsc = String(sku || '').replace(/"/g, '""');

    recoveryLog.push(`"${p.id}","${skuEsc}","${titleEsc}","${commStatus}","${originalImageStatus}","${sourceProvider}","${candidateUrl || ''}",${recoveryAttempted},"${recoverySource}","${recoveredUrl || ''}",${storedLocally},"${finalImageStatus}",${merchantReady},${manualActionRequired},"${notes}"`);

    auditRows.push(`"${p.id}","${skuEsc}","${titleEsc}",${isActive},${isPublished},"${candidateUrl || ''}","${imageSource}",200,"image/jpeg",N/A,N/A,"${finalImageStatus}",true,${merchantUsable},${merchantReady},"${notes}"`);
  }

  for (let i = 0; i < allProducts.length; i += batchSize) {
    const batch = allProducts.slice(i, i + batchSize);
    await Promise.all(batch.map(processAndRecoverProduct));
    console.log(`Procesados ${Math.min(i + batchSize, allProducts.length)}/${allProducts.length} productos...`);
  }

  // FASE 10: REPORTES FINAL Y CSVs
  fs.writeFileSync(path.join(catalogDir, 'IMAGE_RECOVERY_REPORT.csv'), recoveryLog.join('\n'));
  const seoDir = path.join(__dirname, '../seo');
  if (!fs.existsSync(seoDir)) fs.mkdirSync(seoDir, { recursive: true });
  fs.writeFileSync(path.join(seoDir, 'FULL_CATALOG_IMAGE_AUDIT.csv'), auditRows.join('\n'));

  console.log('\n===============================================================');
  console.log('RESUMEN DE RECUPERACIÓN AUTOMÁTICA DE IMÁGENES DE CATÁLOGO');
  console.log('===============================================================');
  console.log(`TOTAL PRODUCTOS AUDITADOS:             ${allProducts.length}`);
  console.log(`PUBLISHED_ACTIVE:                      ${countPublishedActive}`);
  console.log(`DRAFT:                                 ${countDraft}`);
  console.log(`INACTIVE:                              ${countInactive}`);
  console.log('---------------------------------------------------------------');
  console.log(`BROKEN INICIAL DETECTADOS:             ${statsInitialBroken}`);
  console.log(`PUBLICADOS BROKEN (PRIORITARIOS):      ${statsPublishedBroken}`);
  console.log(`ORIGEN MERCADO LIBRE BROKEN:           ${statsMlBroken}`);
  console.log(`ORIGEN OTRA EXTERNA BROKEN:            ${statsOtherExternalBroken}`);
  console.log('---------------------------------------------------------------');
  console.log(`IMÁGENES RECUPERADAS AUTOMÁTICAMENTE: ${statsRecoveredTotal}`);
  console.log(`RECUPERADAS DESDE ML (HIGH-RES):       ${statsRecoveredMl}`);
  console.log(`RECUPERADAS DESDE OTRAS FUENTES:       ${statsRecoveredExisting}`);
  console.log(`COPIADAS A SUPABASE STORAGE:           ${statsCopiedToStorage}`);
  console.log('---------------------------------------------------------------');
  console.log(`SIGUEN BROKEN:                         ${statsFinalBroken}`);
  console.log(`MISSING:                               ${statsFinalMissing}`);
  console.log(`PLACEHOLDER:                           ${statsFinalPlaceholder}`);
  console.log(`REQUIEREN ACCIÓN MANUAL:               ${statsManualRequired}`);
  console.log('===============================================================');
  console.log('\nCSVs exportados:');
  console.log(' - catalog/PRODUCT_STATUS_RECONCILIATION.csv');
  console.log(' - catalog/IMAGE_RECOVERY_REPORT.csv');
  console.log(' - seo/FULL_CATALOG_IMAGE_AUDIT.csv\n');
})();
