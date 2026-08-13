import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  try {
    const baseUrl = 'https://collectibles.uy';
    
    const [{ data: products }, { data: categories }, { data: brands }] = await Promise.all([
      supabase.from('products').select('slug, updated_at').eq('is_active', true),
      supabase.from('categories').select('slug'),
      supabase.from('brands').select('slug')
    ]);

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    sitemap += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Home
    sitemap += `  <url>\n    <loc>${baseUrl}</loc>\n    <priority>1.0</priority>\n    <changefreq>daily</changefreq>\n  </url>\n`;

    // Categories (0.9)
    if (categories) {
      categories.forEach(c => {
        sitemap += `  <url>\n    <loc>${baseUrl}/categoria/${c.slug}</loc>\n    <priority>0.9</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
      });
    }

    // Brands (0.8)
    if (brands) {
      brands.forEach(b => {
        sitemap += `  <url>\n    <loc>${baseUrl}/marca/${b.slug}</loc>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
      });
    }

    // Products (0.7)
    if (products) {
      products.forEach(p => {
        const lastMod = p.updated_at ? new Date(p.updated_at).toISOString() : new Date().toISOString();
        sitemap += `  <url>\n    <loc>${baseUrl}/producto/${p.slug}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <priority>0.7</priority>\n    <changefreq>daily</changefreq>\n  </url>\n`;
      });
    }

    // Static pages (0.6)
    const staticPages = ['/shop', '/about', '/contact', '/faq'];
    staticPages.forEach(p => {
      sitemap += `  <url>\n    <loc>${baseUrl}${p}</loc>\n    <priority>0.6</priority>\n    <changefreq>monthly</changefreq>\n  </url>\n`;
    });

    sitemap += `</urlset>`;

    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate'); // Cache for 1 day
    res.status(200).send(sitemap);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).json({ error: 'Error generating sitemap' });
  }
}
