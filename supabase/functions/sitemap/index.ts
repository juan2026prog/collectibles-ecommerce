import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Solo un par de dominios base
    const domain = Deno.env.get('FRONTEND_URL') || 'https://www.tudominio.com';

    // Obtener todos los productos públicos
    const { data: products } = await supabaseClient
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'active');
      
    // Obtener categorías
    const { data: categories } = await supabaseClient
      .from('categories')
      .select('slug');

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Ruta Home
    xml += `  <url>\n    <loc>${domain}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    // Ruta Shop
    xml += `  <url>\n    <loc>${domain}/shop</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;

    // Categorias
    if (categories) {
        categories.forEach(cat => {
            xml += `  <url>\n    <loc>${domain}/shop?category=${cat.slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        });
    }

    // Productos
    if (products) {
        products.forEach(prod => {
            const date = prod.updated_at ? new Date(prod.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            xml += `  <url>\n    <loc>${domain}/p/${prod.slug}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
        });
    }

    xml += `</urlset>`;

    return new Response(xml, {
      headers: { 
          'Content-Type': 'application/xml',
          'Cache-Control': 'public, max-age=3600'
      },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
