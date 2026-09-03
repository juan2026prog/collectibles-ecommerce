import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  try {
    const baseUrl = 'https://collectibles.uy';

    // 1. Paginated Categories
    let allCategories = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('categories')
        .select('slug')
        .eq('is_active', true)
        .eq('status', 'approved')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error fetching sitemap categories batch:', error);
        throw error;
      }

      if (batch && batch.length > 0) {
        allCategories = allCategories.concat(batch);
        if (batch.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    // 2. Paginated Brands
    let allBrands = [];
    page = 0;
    hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('brands')
        .select('slug')
        .eq('is_active', true)
        .eq('status', 'approved')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error fetching sitemap brands batch:', error);
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

    // 3. Paginated Products
    let allProducts = [];
    page = 0;
    hasMore = true;

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('products')
        .select('slug, updated_at, created_at')
        .eq('is_active', true)
        .eq('status', 'published')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error fetching sitemap products batch:', error);
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

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Home
    xml += `  <url>\n    <loc>${baseUrl}/</loc>\n    <priority>1.0</priority>\n    <changefreq>daily</changefreq>\n  </url>\n`;

    // Real Commercial & Static Base Pages (200 OK)
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

    // Categories (0.9)
    if (allCategories && allCategories.length > 0) {
      allCategories.forEach(c => {
        if (c.slug) {
          xml += `  <url>\n    <loc>${baseUrl}/categoria/${c.slug}</loc>\n    <priority>0.9</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
        }
      });
    }

    // Brands (0.8)
    if (allBrands && allBrands.length > 0) {
      allBrands.forEach(b => {
        if (b.slug) {
          xml += `  <url>\n    <loc>${baseUrl}/marca/${b.slug}</loc>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
        }
      });
    }

    // Published & Active Products (0.7)
    if (allProducts && allProducts.length > 0) {
      allProducts.forEach(p => {
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
