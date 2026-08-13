import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const SUPABASE_STORAGE_BUCKET = 'product-images';
const BASE_SITE_URL = 'https://collectibles.uy';

/**
 * Cleans text from HTML tags, line breaks, and excessive spaces.
 */
function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves product image paths to full public HTTPS URLs.
 */
function resolveImageUrl(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return '';
  const trimmed = imgUrl.trim();
  if (!trimmed) return '';
  
  if (/^(https?:\/\/)/.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-f0-9-]{36}$/i.test(trimmed)) {
    return `${supabaseUrl}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${trimmed}`;
  }
  if (!trimmed.startsWith('/')) {
    return `${supabaseUrl}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${trimmed}`;
  }
  return `${supabaseUrl}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}${trimmed}`;
}

/**
 * Escapes a cell for RFC 4180 CSV compatibility.
 */
function escapeCsvField(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export default async function handler(req, res) {
  try {
    let allProducts = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    // Paginate through Supabase to overcome default 1,000 row REST limit
    while (hasMore) {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          title,
          slug,
          description,
          short_description,
          base_price,
          compare_at_price,
          status,
          is_active,
          category:categories(name),
          brand:brands(name),
          images:product_images(url, is_primary, sort_order),
          variants:product_variants(id, sku, inventory_count)
        `)
        .eq('status', 'published')
        .eq('is_active', true)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Supabase query error in meta-catalog:', error);
        throw error;
      }

      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    const csvRows = [];
    const headers = [
      'id',
      'title',
      'description',
      'availability',
      'condition',
      'price',
      'link',
      'image_link',
      'brand',
      'sale_price',
      'additional_image_link',
      'google_product_category',
      'product_type',
      'inventory'
    ];

    csvRows.push(headers.map(escapeCsvField).join(','));

    allProducts.forEach((p) => {
      const title = cleanText(p.title);
      if (!title) return;

      const rawBasePrice = Number(p.base_price);
      if (isNaN(rawBasePrice) || rawBasePrice <= 0) return;

      const rawComparePrice = Number(p.compare_at_price);
      const hasSale = !isNaN(rawComparePrice) && rawComparePrice > rawBasePrice;

      const normalPriceVal = hasSale ? rawComparePrice : rawBasePrice;
      const salePriceVal = hasSale ? rawBasePrice : null;

      const formattedPrice = `${normalPriceVal} UYU`;
      const formattedSalePrice = salePriceVal ? `${salePriceVal} UYU` : '';

      let mainImageUrl = '';
      const additionalImages = [];

      if (Array.isArray(p.images) && p.images.length > 0) {
        const sortedImages = [...p.images].sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1;
          if (!a.is_primary && b.is_primary) return 1;
          return (a.sort_order || 0) - (b.sort_order || 0);
        });

        sortedImages.forEach((img) => {
          const resolved = resolveImageUrl(img.url);
          if (resolved && resolved.startsWith('https://')) {
            if (!mainImageUrl) {
              mainImageUrl = resolved;
            } else if (!additionalImages.includes(resolved) && resolved !== mainImageUrl) {
              additionalImages.push(resolved);
            }
          }
        });
      }

      // Exclude products without a valid public HTTPS main image
      if (!mainImageUrl) return;

      const totalInventory = (p.variants || []).reduce(
        (acc, v) => acc + Math.max(0, Number(v.inventory_count) || 0),
        0
      );
      const availability = totalInventory > 0 ? 'in stock' : 'out of stock';
      const condition = 'new';
      const productLink = `${BASE_SITE_URL}/p/${p.slug}`;
      const brand = cleanText(p.brand?.name || '');
      const productType = cleanText(p.category?.name || '');
      const description = cleanText(
        p.description || p.short_description || `${title} - Disponible en Collectibles Uruguay`
      );

      const row = [
        p.id,
        title,
        description,
        availability,
        condition,
        formattedPrice,
        productLink,
        mainImageUrl,
        brand,
        formattedSalePrice,
        additionalImages.join(','),
        '', // google_product_category
        productType,
        totalInventory
      ];

      csvRows.push(row.map(escapeCsvField).join(','));
    });

    // UTF-8 BOM + CSV string
    const csvContent = '\uFEFF' + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="meta-catalog.csv"');
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Error generating meta-catalog.csv:', error);
    res.status(500).json({ error: 'Internal Server Error generating meta catalog' });
  }
}
