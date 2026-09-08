import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabase = createClient(supabaseUrl, supabaseKey);

const BASE_URL = 'https://collectibles.uy';

// Curated & static editorial academy guides list (32 articles, all 200 OK)
const ACADEMY_ARTICLE_SLUGS = [
  "como-empezar-coleccion-figuras",
  "figuras-accion-vs-estatuas",
  "el-arte-del-foco-como-elegir-linea-coleccion",
  "completismo-vs-curaduria-coleccionismo",
  "presupuesto-real-coleccionista-costos-ocultos",
  "sindrome-caja-cerrada-open-box-vs-sellado",
  "guia-escalas-figuras-coleccion",
  "el-salto-a-escala-1-6-requisitos-espacio-vitrinas",
  "micro-escalas-miniaturas-figuras-1-18-y-1-24",
  "batalla-escala-1-12-import-japones-vs-retail-americano",
  "frontera-18-cm-escala-1-10-mcfarlane-neca",
  "lineas-entrada-vs-alta-gama-fabricantes-coleccionismo",
  "guerra-titanes-1-6-hot-toys-vs-inart-ingenieria",
  "como-reconocer-figura-original-bootleg",
  "mercado-cabezas-custom-escultura-3d-pintura",
  "resinas-estudio-licencia-oficial-vs-garages-custom",
  "materiales-figuras-pvc-abs-resina-diecast",
  "como-cuidar-exhibir-figuras-coleccion",
  "articulaciones-rigidas-clavijas-quebradas-tecnicas-calor",
  "articulaciones-flojas-devolver-firmeza-rotulas-sin-pegamento",
  "centro-gravedad-balance-posa-dinamica-sin-stands",
  "cuidado-ropa-tela-cuerina-pleather-evitar-cuarteado",
  "edicion-limitada-exclusive-chase-preorder",
  "fomo-aftermarket-reventa-vs-esperar-reissue",
  "preventas-depositos-reserva-ciclo-produccion-retrasos",
  "guia-importacion-uruguay-franquicia-usd-200-figuras",
  "misb-mib-loose-glosario-coleccionismo",
  "grading-figuras-accion-afa-cas-certificacion",
  "guia-de-escalas-coleccionables",
  "como-detectar-bootlegs-figuras-originales",
  "pvc-vs-resina-vs-diecast-cuidados",
  "vitrinas-iluminacion-led-y-control-uv"
];

async function fetchCategories() {
  let allCategories = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('categories')
      .select('slug, updated_at, created_at')
      .eq('is_active', true)
      .eq('status', 'approved')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching sitemap categories batch:', error);
      break;
    }

    if (batch && batch.length > 0) {
      allCategories = allCategories.concat(batch);
      if (batch.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }
  return allCategories;
}

async function fetchBrands() {
  let allBrands = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('brands')
      .select('slug, created_at')
      .eq('is_active', true)
      .eq('status', 'approved')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching sitemap brands batch:', error);
      break;
    }

    if (batch && batch.length > 0) {
      allBrands = allBrands.concat(batch);
      if (batch.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }
  return allBrands;
}

async function fetchLicenses() {
  const { data, error } = await supabase
    .from('licenses')
    .select('slug')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching sitemap licenses:', error);
    return [];
  }
  return data || [];
}

async function fetchThemes() {
  const { data, error } = await supabase
    .from('themes')
    .select('slug')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching sitemap themes:', error);
    return [];
  }
  return data || [];
}

async function fetchProducts() {
  let allProducts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('products')
      .select('slug, updated_at, created_at')
      .eq('is_active', true)
      .eq('status', 'published')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching sitemap products batch:', error);
      break;
    }

    if (batch && batch.length > 0) {
      allProducts = allProducts.concat(batch);
      if (batch.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }
  return allProducts;
}

export default async function handler(req, res) {
  try {
    const rawUrl = req.url || '';
    const parsed = new URL(rawUrl, 'https://collectibles.uy');
    const xForwardedUri = req.headers?.['x-forwarded-uri'] || req.headers?.['x-matched-path'] || '';
    const fullPath = (parsed.pathname + ' ' + rawUrl + ' ' + xForwardedUri).toLowerCase();
    const typeParam = (parsed.searchParams.get('type') || req.query?.type || '').toLowerCase();

    // Route matching
    const isProducts = typeParam === 'products' || fullPath.includes('sitemap-products.xml');
    const isCategories = typeParam === 'categories' || fullPath.includes('sitemap-categories.xml');
    const isBrands = typeParam === 'brands' || fullPath.includes('sitemap-brands.xml');
    const isPages = typeParam === 'pages' || fullPath.includes('sitemap-pages.xml');
    const isAcademy = typeParam === 'academy' || fullPath.includes('sitemap-academy.xml');
    const isIndex = typeParam === 'index' || fullPath.includes('sitemap_index.xml') || fullPath.includes('sitemap.xml') || (!typeParam && (fullPath.includes('/api/sitemap') || fullPath.includes('/sitemap')));

    // Unknown sitemap -> return 404 (do not fallback to React HTML)
    if (typeParam === 'unknown' || (!isIndex && !isProducts && !isCategories && !isBrands && !isPages && !isAcademy)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(404).send('404 Sitemap Not Found');
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=43200');
    res.setHeader('X-SEO-Version', '2026.09.07-v5');

    // 1. SITEMAP INDEX (for both /sitemap.xml and /sitemap_index.xml)
    if (isIndex && !isProducts && !isCategories && !isBrands && !isPages && !isAcademy) {
      const now = new Date().toISOString();
      const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap-pages.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${BASE_URL}/sitemap-products.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${BASE_URL}/sitemap-categories.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${BASE_URL}/sitemap-brands.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${BASE_URL}/sitemap-academy.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;
      return res.status(200).send(indexXml);
    }

    // 2. SITEMAP PRODUCTS
    if (isProducts) {
      const products = await fetchProducts();
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      products.forEach(p => {
        if (p.slug) {
          const date = p.updated_at || p.created_at;
          const lastMod = date ? new Date(date).toISOString() : new Date().toISOString();
          xml += `  <url>\n    <loc>${BASE_URL}/producto/${p.slug}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <priority>0.8</priority>\n    <changefreq>daily</changefreq>\n  </url>\n`;
        }
      });
      xml += `</urlset>`;
      return res.status(200).send(xml);
    }

    // 3. SITEMAP CATEGORIES
    if (isCategories) {
      const [categories, licenses, themes] = await Promise.all([
        fetchCategories(),
        fetchLicenses(),
        fetchThemes()
      ]);
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      categories.forEach(c => {
        if (c.slug) {
          const date = c.updated_at || c.created_at;
          const lastMod = date ? new Date(date).toISOString() : new Date().toISOString();
          xml += `  <url>\n    <loc>${BASE_URL}/categoria/${c.slug}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <priority>0.9</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
        }
      });
      licenses.forEach(l => {
        if (l.slug) {
          xml += `  <url>\n    <loc>${BASE_URL}/licencias/${l.slug}</loc>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
        }
      });
      themes.forEach(t => {
        if (t.slug) {
          xml += `  <url>\n    <loc>${BASE_URL}/themes/${t.slug}</loc>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
        }
      });
      xml += `</urlset>`;
      return res.status(200).send(xml);
    }

    // 4. SITEMAP BRANDS
    if (isBrands) {
      const brands = await fetchBrands();
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      brands.forEach(b => {
        if (b.slug) {
          const date = b.created_at;
          const lastMod = date ? new Date(date).toISOString() : new Date().toISOString();
          xml += `  <url>\n    <loc>${BASE_URL}/marca/${b.slug}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
        }
      });
      xml += `</urlset>`;
      return res.status(200).send(xml);
    }

    // 5. SITEMAP ACADEMY (Hub + 32 Articles = 33 Total)
    if (isAcademy) {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      xml += `  <url>\n    <loc>${BASE_URL}/academy</loc>\n    <priority>0.9</priority>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
      const uniqueAcademySlugs = Array.from(new Set(ACADEMY_ARTICLE_SLUGS));
      uniqueAcademySlugs.forEach(slug => {
        xml += `  <url>\n    <loc>${BASE_URL}/academy/${slug}</loc>\n    <priority>0.7</priority>\n    <changefreq>monthly</changefreq>\n  </url>\n`;
      });
      xml += `</urlset>`;
      return res.status(200).send(xml);
    }

    // 6. SITEMAP PAGES (Core & Institutional Pages, no academy to avoid duplicates)
    if (isPages) {
      const staticPages = [
        '/',
        '/shop',
        '/ai-search',
        '/licencias',
        '/themes',
        '/radar',
        '/releases',
        '/compare',
        '/import-hub',
        '/contact',
        '/page/nosotros',
        '/page/terminos',
        '/page/pol-ticas-de-privacidad',
        '/page/condiciones-de-compra',
        '/page/envios-devoluciones'
      ];
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      staticPages.forEach(p => {
        const priority = p === '/' ? '1.0' : ((p === '/shop' || p === '/ai-search') ? '0.9' : '0.8');
        const changefreq = p === '/' ? 'daily' : 'weekly';
        xml += `  <url>\n    <loc>${BASE_URL}${p === '/' ? '' : p}</loc>\n    <priority>${priority}</priority>\n    <changefreq>${changefreq}</changefreq>\n  </url>\n`;
      });
      xml += `</urlset>`;
      return res.status(200).send(xml);
    }

  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).setHeader('Content-Type', 'text/plain').send('500 Error generating sitemap');
  }
}
