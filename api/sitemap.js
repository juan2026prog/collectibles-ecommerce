import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  try {
    const baseUrl = 'https://collectibles.uy';

    const [
      { data: products },
      { data: categories },
      { data: brands }
    ] = await Promise.all([
      supabase
        .from('products')
        .select('slug, updated_at, created_at')
        .eq('is_active', true)
        .eq('status', 'published'),
      supabase
        .from('categories')
        .select('slug')
        .eq('is_active', true)
        .eq('status', 'approved'),
      supabase
        .from('brands')
        .select('slug')
        .eq('is_active', true)
        .eq('status', 'approved')
    ]);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // 1. Home
    xml += `  <url>\n    <loc>${baseUrl}/</loc>\n    <priority>1.0</priority>\n    <changefreq>daily</changefreq>\n  </url>\n`;

    // 2. Real Commercial & Static Base Pages (200 OK)
    const mainPages = [
      '/shop',
      '/page/nosotros',
      '/page/terminos',
      '/page/pol-ticas-de-privacidad',
      '/page/condiciones-de-compra',
      '/contact'
    ];
    mainPages.forEach(p => {
      xml += `  <url>\n    <loc>${baseUrl}${p}</loc>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
    });

    // 3. Categories (0.9)
    if (categories && categories.length > 0) {
      categories.forEach(c => {
        if (c.slug) {
          xml += `  <url>\n    <loc>${baseUrl}/categoria/${c.slug}</loc>\n    <priority>0.9</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
        }
      });
    }

    // 4. Brands (0.8)
    if (brands && brands.length > 0) {
      brands.forEach(b => {
        if (b.slug) {
          xml += `  <url>\n    <loc>${baseUrl}/marca/${b.slug}</loc>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
        }
      });
    }

    // 5. Published & Active Products (0.7)
    if (products && products.length > 0) {
      products.forEach(p => {
        if (p.slug) {
          const date = p.updated_at || p.created_at;
          const lastMod = date ? new Date(date).toISOString() : new Date().toISOString();
          xml += `  <url>\n    <loc>${baseUrl}/producto/${p.slug}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <priority>0.7</priority>\n    <changefreq>daily</changefreq>\n  </url>\n`;
        }
      });
    }

    xml += `</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=43200');
    res.status(200).send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).json({ error: 'Error generating sitemap' });
  }
}
