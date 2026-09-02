import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

export default async function handler(req, res) {
  try {
    const baseUrl = 'https://collectibles.uy';

    const [{ data: products }, { data: images }, { data: brands }] = await Promise.all([
      supabase
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
        .eq('status', 'published'),
      supabase
        .from('product_images')
        .select('product_id, url, is_primary')
        .order('sort_order', { ascending: true }),
      supabase
        .from('brands')
        .select('id, name')
        .eq('is_active', true)
    ]);

    const imageMap = {};
    if (images) {
      images.forEach(img => {
        if (!imageMap[img.product_id] || img.is_primary) {
          imageMap[img.product_id] = img.url;
        }
      });
    }

    const brandMap = {};
    if (brands) {
      brands.forEach(b => {
        brandMap[b.id] = b.name;
      });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n`;
    xml += `  <channel>\n`;
    xml += `    <title>Collectibles Uruguay - Google Merchant Feed</title>\n`;
    xml += `    <link>${baseUrl}</link>\n`;
    xml += `    <description>Feed dinámico oficial de productos de Collectibles Uruguay</description>\n`;

    if (products && products.length > 0) {
      products.forEach(p => {
        if (!p.slug || !p.title) return;

        const link = `${baseUrl}/producto/${p.slug}`;
        const imageLink = imageMap[p.id] || 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg';
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

        const priceFormatted = `${Number(p.base_price || 0).toFixed(2)} UYU`;
        const gtin = p.metadata?.gtin || p.metadata?.ean || '';
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
        if (gtin) {
          xml += `      <g:gtin>${escapeXml(gtin)}</g:gtin>\n`;
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
