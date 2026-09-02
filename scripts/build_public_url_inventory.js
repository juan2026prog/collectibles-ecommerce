const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load env
const envPath = path.join(__dirname, '../frontend/.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const k = parts[0].trim();
      const v = parts.slice(1).join('=').trim();
      if (k && !process.env[k]) {
        process.env[k] = v;
      }
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  console.log('Generando seo/FULL_PUBLIC_URL_INVENTORY.csv con paginación completa...');

  const rows = [];
  rows.push('url,type,entity_id,slug,indexable,canonical_expected,schema_expected,status_expected,notes');

  const baseUrl = 'https://collectibles.uy';

  // 1. HOME
  rows.push(`"${baseUrl}/",HOME,N/A,,true,"${baseUrl}/","WebSite,Organization",200,"Portada principal"`);

  // 2. SHOP
  rows.push(`"${baseUrl}/shop",SHOP,N/A,shop,true,"${baseUrl}/shop",BreadcrumbList,200,"Catálogo general"`);

  // 3. STATIC PAGES
  const staticPages = [
    { slug: 'nosotros', path: '/page/nosotros', name: 'Nosotros' },
    { slug: 'terminos', path: '/page/terminos', name: 'Términos' },
    { slug: 'pol-ticas-de-privacidad', path: '/page/pol-ticas-de-privacidad', name: 'Privacidad' },
    { slug: 'condiciones-de-compra', path: '/page/condiciones-de-compra', name: 'Condiciones de Compra' },
    { slug: 'contact', path: '/contact', name: 'Contacto' }
  ];

  staticPages.forEach(p => {
    rows.push(`"${baseUrl}${p.path}",STATIC_PAGE,N/A,"${p.slug}",true,"${baseUrl}${p.path}",BreadcrumbList,200,"Página institucional ${p.name}"`);
  });

  // 4. CATEGORÍAS
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug, is_active, status');

  if (categories) {
    categories.forEach(c => {
      if (!c.slug) return;
      const isIndexable = (c.is_active && c.status === 'approved');
      const expectedStatus = isIndexable ? 200 : 404;
      const titleEsc = (c.name || '').replace(/"/g, '""');
      rows.push(`"${baseUrl}/categoria/${c.slug}",CATEGORY,"${c.id}","${c.slug}",${isIndexable},"${baseUrl}/categoria/${c.slug}",BreadcrumbList,${expectedStatus},"Categoría: ${titleEsc}"`);
    });
  }

  // 5. MARCAS
  const { data: brands } = await supabase
    .from('brands')
    .select('id, name, slug, is_active, status');

  if (brands) {
    brands.forEach(b => {
      if (!b.slug) return;
      const isIndexable = (b.is_active && b.status === 'approved');
      const expectedStatus = isIndexable ? 200 : 404;
      const titleEsc = (b.name || '').replace(/"/g, '""');
      rows.push(`"${baseUrl}/marca/${b.slug}",BRAND,"${b.id}","${b.slug}",${isIndexable},"${baseUrl}/marca/${b.slug}",BreadcrumbList,${expectedStatus},"Marca: ${titleEsc}"`);
    });
  }

  // 6. PRODUCTOS (con paginación)
  let productCount = 0;
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: products } = await supabase
      .from('products')
      .select('id, title, slug, is_active, status')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (products && products.length > 0) {
      products.forEach(p => {
        if (!p.slug) return;
        productCount++;
        const isIndexable = (p.is_active && p.status === 'published');
        const expectedStatus = isIndexable ? 200 : 404;
        const titleEsc = (p.title || '').replace(/"/g, '""');
        rows.push(`"${baseUrl}/producto/${p.slug}",PRODUCT,"${p.id}","${p.slug}",${isIndexable},"${baseUrl}/producto/${p.slug}","Product,BreadcrumbList",${expectedStatus},"Producto: ${titleEsc}"`);
      });
      if (products.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`Total productos exportados: ${productCount}`);

  // 7. LEGACY PATTERNS
  const legacySample = [
    { url: `${baseUrl}/product-category/funko-pop`, expected: `${baseUrl}/categoria/funko-pop`, notes: 'Legacy WC category redirect' },
    { url: `${baseUrl}/product/figura-marvel`, expected: `${baseUrl}/producto/figura-marvel`, notes: 'Legacy WC product redirect' },
    { url: `${baseUrl}/wishlist`, expected: `${baseUrl}/cart`, notes: 'Legacy wishlist redirect' },
    { url: `${baseUrl}/feed/`, expected: 'None', notes: 'Legacy feed 410' },
    { url: `${baseUrl}/author/admin`, expected: 'None', notes: 'Legacy author 410' },
    { url: `${baseUrl}/hello-world/`, expected: 'None', notes: 'Legacy hello world 410' }
  ];

  legacySample.forEach(l => {
    rows.push(`"${l.url}",LEGACY,N/A,N/A,false,"${l.expected}",None,301,"${l.notes}"`);
  });

  const seoDir = path.join(__dirname, '../seo');
  if (!fs.existsSync(seoDir)) fs.mkdirSync(seoDir, { recursive: true });

  fs.writeFileSync(path.join(seoDir, 'FULL_PUBLIC_URL_INVENTORY.csv'), rows.join('\n'));
  console.log(`Inventario generado exitosamente con ${rows.length - 1} URLs.`);
})();
