import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanText(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function validateGtin(gtin) {
  if (!gtin) return null;
  const str = String(gtin).trim();
  if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(str)) {
    return str;
  }
  return null;
}

function resolveMerchantImageUrl(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return '';
  const trimmed = imgUrl.trim();
  if (!trimmed) return '';

  // 1. Direct stable Supabase Storage URLs (preferred for performance and reliability)
  if (trimmed.includes('cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/')) {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return `https://${trimmed.replace(/^\/+/, '')}`;
  }

  if (trimmed.startsWith('/storage/v1/object/public/')) {
    return `https://cobtsgkwcftvexaarwmo.supabase.co${trimmed}`;
  }

  // 2. MercadoLibre static image URLs (proxied to add headers/extension consistency)
  if (trimmed.includes('http2.mlstatic.com/')) {
    const pathPart = trimmed.split('http2.mlstatic.com/')[1];
    return `https://collectibles.uy/catalog-images/external/http2.mlstatic.com/${pathPart}`;
  }

  // 3. Other external image URLs
  if (/^(https?:\/\/)/.test(trimmed)) {
    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    return `https://collectibles.uy/catalog-images/external/${withoutProtocol}`;
  }

  // 4. Relative paths or product image filenames
  if (trimmed.startsWith('/')) {
    return `https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/product-images${trimmed}`;
  }

  return `https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/product-images/${trimmed}`;
}

export default async function handler(req, res) {
  try {
    const baseUrl = 'https://collectibles.uy';

    // 1. Paginated fetch for ALL published active products
    let allProducts = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('products')
        .select(`
          id,
          title,
          slug,
          description,
          short_description,
          base_price,
          condition,
          brand_id,
          metadata
        `)
        .eq('is_active', true)
        .eq('status', 'published')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Supabase query error in merchant-feed products:', error);
        throw error;
      }

      if (batch && batch.length > 0) {
        allProducts = allProducts.concat(batch);
        if (batch.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    // 2. Paginated fetch for ALL product images
    let allImages = [];
    page = 0;
    hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('product_images')
        .select('product_id, url, is_primary')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Supabase query error in merchant-feed images:', error);
        throw error;
      }

      if (batch && batch.length > 0) {
        allImages = allImages.concat(batch);
        if (batch.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    // 3. Paginated fetch for ALL active brands
    let allBrands = [];
    page = 0;
    hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('brands')
        .select('id, name')
        .eq('is_active', true)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Supabase query error in merchant-feed brands:', error);
        throw error;
      }

      if (batch && batch.length > 0) {
        allBrands = allBrands.concat(batch);
        if (batch.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    const imageMap = {};
    if (allImages) {
      allImages.forEach(img => {
        if (!imageMap[img.product_id] || img.is_primary) {
          imageMap[img.product_id] = img.url;
        }
      });
    }

    const brandMap = {};
    if (allBrands) {
      allBrands.forEach(b => {
        brandMap[b.id] = b.name;
      });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n`;
    xml += `  <channel>\n`;
    xml += `    <title>Collectibles Uruguay - Google Merchant Feed</title>\n`;
    xml += `    <link>${baseUrl}</link>\n`;
    xml += `    <description>Feed dinámico oficial de productos de Collectibles Uruguay</description>\n`;

    if (allProducts && allProducts.length > 0) {
      allProducts.forEach(p => {
        // STRICT MERCHANT ELIGIBILITY FILTERS
        if (!p.slug || !p.title) return;

        const priceNum = Number(p.base_price || 0);
        if (isNaN(priceNum) || priceNum <= 0) return;

        const rawImg = imageMap[p.id];
        if (!rawImg) return;

        const link = `${baseUrl}/producto/${p.slug}`;
        const imageLink = resolveMerchantImageUrl(rawImg);
        const rawDesc = p.description || p.short_description || p.title;
        const description = cleanText(rawDesc);
        const brandName = (p.brand_id && brandMap[p.brand_id]) ? brandMap[p.brand_id] : 'Collectibles';
        
        let condition = 'new';
        if (p.condition) {
          const cLower = String(p.condition).toLowerCase();
          if (cLower.includes('usad') || cLower.includes('used')) {
            condition = 'used';
          }
        }

        const priceFormatted = `${priceNum.toFixed(2)} UYU`;
        const rawGtin = p.metadata?.gtin || p.metadata?.ean || p.gtin || p.ean;
        const validGtin = validateGtin(rawGtin);
        const mpn = p.metadata?.mpn || p.id;

        xml += `    <item>\n`;
        xml += `      <g:id>${escapeXml(p.id)}</g:id>\n`;
        xml += `      <g:title>${escapeXml(p.title)}</g:title>\n`;
        xml += `      <g:description>${escapeXml(description)}</g:description>\n`;
        xml += `      <g:link>${escapeXml(link)}</g:link>\n`;
        xml += `      <g:image_link>${escapeXml(imageLink)}</g:image_link>\n`;
        xml += `      <g:availability>in_stock</g:availability>\n`;
        xml += `      <g:price>${escapeXml(priceFormatted)}</g:price>\n`;
        xml += `      <g:brand>${escapeXml(brandName)}</g:brand>\n`;
        if (validGtin) {
          xml += `      <g:gtin>${escapeXml(validGtin)}</g:gtin>\n`;
        } else {
          xml += `      <g:identifier_exists>no</g:identifier_exists>\n`;
        }
        xml += `      <g:mpn>${escapeXml(mpn)}</g:mpn>\n`;
        xml += `      <g:condition>${escapeXml(condition)}</g:condition>\n`;
        xml += `    </item>\n`;
      });
    }

    xml += `  </channel>\n`;
    xml += `</rss>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=43200');
    res.status(200).send(xml);
  } catch (error) {
    console.error('Error generating merchant feed:', error);
    res.status(500).json({ error: 'Error generating merchant feed' });
  }
}
