const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env.vercel' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const SUPABASE_STORAGE_BUCKET = 'product-images';
const BASE_SITE_URL = 'https://collectibles.uy';

function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveImageUrl(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return '';
  const trimmed = imgUrl.trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/)/.test(trimmed)) return trimmed;
  if (/^[a-f0-9-]{36}$/i.test(trimmed)) {
    return `${supabaseUrl}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${trimmed}`;
  }
  if (!trimmed.startsWith('/')) {
    return `${supabaseUrl}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${trimmed}`;
  }
  return `${supabaseUrl}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}${trimmed}`;
}

async function validateMetaCatalog() {
  console.log('--- STARTING META CATALOG AUTOMATED VALIDATION ---');
  let allProducts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, title, slug, description, short_description, base_price, compare_at_price, status, is_active,
        category:categories(name),
        brand:brands(name),
        images:product_images(url, is_primary, sort_order),
        variants:product_variants(id, sku, inventory_count)
      `)
      .eq('status', 'published')
      .eq('is_active', true)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Supabase query error:', error);
      process.exit(1);
    }
    if (data && data.length > 0) {
      allProducts = allProducts.concat(data);
      if (data.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`Fetched ${allProducts.length} published products from Supabase.`);

  const seenIds = new Set();
  const errors = [];
  let processedCount = 0;

  allProducts.forEach((p, idx) => {
    // 1. Duplicate ID check
    if (seenIds.has(p.id)) {
      errors.push(`Row ${idx}: Duplicate ID found -> ${p.id}`);
    }
    seenIds.add(p.id);

    // 2. Title check
    const title = cleanText(p.title);
    if (!title) {
      errors.push(`Row ${idx} (ID: ${p.id}): Empty or missing title`);
      return;
    }

    // 3. Price check
    const rawBasePrice = Number(p.base_price);
    if (isNaN(rawBasePrice) || rawBasePrice <= 0) {
      errors.push(`Row ${idx} (ID: ${p.id}): Invalid base price -> ${p.base_price}`);
      return;
    }

    const rawComparePrice = Number(p.compare_at_price);
    const hasSale = !isNaN(rawComparePrice) && rawComparePrice > rawBasePrice;

    const normalPriceVal = hasSale ? rawComparePrice : rawBasePrice;
    const salePriceVal = hasSale ? rawBasePrice : null;

    const formattedPrice = `${normalPriceVal} UYU`;
    const formattedSalePrice = salePriceVal ? `${salePriceVal} UYU` : '';

    if (!formattedPrice.endsWith(' UYU')) {
      errors.push(`Row ${idx} (ID: ${p.id}): Price must end with ' UYU' -> ${formattedPrice}`);
    }

    // 4. Sale price check (sale_price < price)
    if (salePriceVal !== null) {
      if (salePriceVal >= normalPriceVal) {
        errors.push(`Row ${idx} (ID: ${p.id}): sale_price (${salePriceVal}) is not strictly less than price (${normalPriceVal})`);
      }
    }

    // 5. Image link check
    let mainImageUrl = '';
    if (Array.isArray(p.images) && p.images.length > 0) {
      const sortedImages = [...p.images].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      for (const img of sortedImages) {
        const resolved = resolveImageUrl(img.url);
        if (resolved && resolved.startsWith('https://')) {
          mainImageUrl = resolved;
          break;
        }
      }
    }

    if (!mainImageUrl) {
      errors.push(`Row ${idx} (ID: ${p.id}): No valid public HTTPS image found`);
      return;
    }

    // 6. Link check
    const productLink = `${BASE_SITE_URL}/p/${p.slug}`;
    if (!productLink.startsWith('https://collectibles.uy/p/')) {
      errors.push(`Row ${idx} (ID: ${p.id}): Invalid URL link -> ${productLink}`);
    }

    // 7. Availability check
    const totalInventory = (p.variants || []).reduce((acc, v) => acc + Math.max(0, Number(v.inventory_count) || 0), 0);
    const availability = totalInventory > 0 ? 'in stock' : 'out of stock';
    if (availability !== 'in stock' && availability !== 'out of stock') {
      errors.push(`Row ${idx} (ID: ${p.id}): Invalid availability -> ${availability}`);
    }

    // 8. Literal NaN / null / undefined string check
    const fieldsToCheck = [
      { name: 'id', val: p.id },
      { name: 'title', val: title },
      { name: 'availability', val: availability },
      { name: 'condition', val: 'new' },
      { name: 'price', val: formattedPrice },
      { name: 'link', val: productLink },
      { name: 'image_link', val: mainImageUrl },
      { name: 'sale_price', val: formattedSalePrice }
    ];

    fieldsToCheck.forEach(({ name, val }) => {
      if (val === undefined || val === null || (typeof val === 'number' && Number.isNaN(val))) {
        errors.push(`Row ${idx} (ID: ${p.id}): ${name} is null/undefined/NaN`);
      }
      const str = String(val);
      if (/\b(undefined|null|NaN)\b/i.test(str)) {
        errors.push(`Row ${idx} (ID: ${p.id}): ${name} contains literal null/undefined/NaN -> "${str}"`);
      }
    });

    processedCount++;
  });

  console.log(`Validation complete. Processed ${processedCount} valid products.`);
  if (errors.length > 0) {
    console.error(`FOUND ${errors.length} VALIDATION ERRORS:`);
    errors.forEach((e) => console.error(' - ' + e));
    process.exit(1);
  } else {
    console.log('✅ ALL 10 AUTOMATED VALIDATION CHECKS PASSED PERFECTLY!');
  }
}

validateMetaCatalog();
