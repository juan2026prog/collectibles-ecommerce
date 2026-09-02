import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

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
 * Resolves product image paths to public HTTPS URLs served by the first-party catalog-images proxy.
 */
function resolveImageUrl(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return '';
  const trimmed = imgUrl.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('https://collectibles.uy/catalog-images/')) {
    return trimmed;
  }

  if (trimmed.includes('cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/')) {
    const pathPart = trimmed.split('/storage/v1/object/public/')[1];
    return `${BASE_SITE_URL}/catalog-images/${pathPart}`;
  }

  if (trimmed.includes('http2.mlstatic.com/')) {
    const pathPart = trimmed.split('http2.mlstatic.com/')[1];
    return `${BASE_SITE_URL}/catalog-images/external/http2.mlstatic.com/${pathPart}`;
  }

  if (/^(https?:\/\/)/.test(trimmed)) {
    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    return `${BASE_SITE_URL}/catalog-images/external/${withoutProtocol}`;
  }

  if (/^[a-f0-9-]{36}$/i.test(trimmed)) {
    return `${BASE_SITE_URL}/catalog-images/product-images/${trimmed}`;
  }

  if (trimmed.startsWith('/')) {
    return `${BASE_SITE_URL}/catalog-images/product-images${trimmed}`;
  }

  return `${BASE_SITE_URL}/catalog-images/product-images/${trimmed}`;
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

        // Separate Supabase Storage images (Priority 1 & 2) from External images (Priority 3 & 4)
        const supabaseCandidates = [];
        const externalCandidates = [];

        sortedImages.forEach((img) => {
          const resolved = resolveImageUrl(img.url);
          if (resolved && resolved.startsWith('https://')) {
            const isSupabase = img.url.includes('supabase.co') || /^[a-f0-9-]{36}$/i.test(img.url) || !img.url.startsWith('http');
            if (isSupabase) {
              if (!supabaseCandidates.includes(resolved)) supabaseCandidates.push(resolved);
            } else {
              if (!externalCandidates.includes(resolved)) externalCandidates.push(resolved);
            }
          }
        });

        const allCandidates = [...supabaseCandidates, ...externalCandidates];

        allCandidates.forEach((imgUrl) => {
          if (!mainImageUrl) {
            mainImageUrl = imgUrl;
          } else if (!additionalImages.includes(imgUrl) && imgUrl !== mainImageUrl) {
            additionalImages.push(imgUrl);
          }
        });
      }

      // Exclude products without any valid main image (Requirement 7)
      if (!mainImageUrl) return;

      const totalInventory = (p.variants || []).reduce(
        (acc, v) => acc + Math.max(0, Number(v.inventory_count) || 0),
        0
      );
      const availability = totalInventory > 0 ? 'in stock' : 'out of stock';
      const condition = 'new';
      const productLink = `${BASE_SITE_URL}/producto/${p.slug}`;
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
