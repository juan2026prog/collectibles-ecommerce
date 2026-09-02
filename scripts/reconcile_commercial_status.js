const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '../frontend/.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) process.env[parts[0].trim()] = parts.slice(1).join('=').trim();
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  let allProducts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: prods, error } = await supabase
      .from('products')
      .select('id, title, slug, is_active, status, metadata')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) { console.error(error); break; }
    if (prods && prods.length > 0) {
      allProducts.push(...prods);
      if (prods.length < pageSize) hasMore = false;
      else page++;
    } else { hasMore = false; }
  }

  let publishedActive = 0;
  let draft = 0;
  let inactive = 0;
  let other = 0;

  const rows = ['product_id,sku,title,is_active,status,commercial_classification'];

  allProducts.forEach(p => {
    const isActive = Boolean(p.is_active !== false);
    const status = p.status || 'draft';
    const sku = p.metadata?.sku || p.id;
    let classification = 'OTHER';

    if (status === 'published' && isActive) {
      classification = 'PUBLISHED_ACTIVE';
      publishedActive++;
    } else if (status === 'draft') {
      classification = 'DRAFT';
      draft++;
    } else if (!isActive || status === 'archived' || status === 'unpublished' || status === 'inactive') {
      classification = 'INACTIVE';
      inactive++;
    } else {
      classification = 'OTHER';
      other++;
    }

    const titleEsc = String(p.title || '').replace(/"/g, '""');
    const skuEsc = String(sku || '').replace(/"/g, '""');
    rows.push(`"${p.id}","${skuEsc}","${titleEsc}",${isActive},"${status}","${classification}"`);
  });

  console.log('--- RECONCILIACIÓN MATEMÁTICA DE ESTADOS COMERCIALES ---');
  console.log('Total Productos en Supabase:', allProducts.length);
  console.log('PUBLISHED_ACTIVE:           ', publishedActive);
  console.log('DRAFT:                      ', draft);
  console.log('INACTIVE:                   ', inactive);
  console.log('OTHER:                      ', other);
  console.log('SUMA TOTAL:                 ', publishedActive + draft + inactive + other);

  const catalogDir = path.join(__dirname, '../catalog');
  if (!fs.existsSync(catalogDir)) fs.mkdirSync(catalogDir, { recursive: true });
  fs.writeFileSync(path.join(catalogDir, 'PRODUCT_STATUS_RECONCILIATION.csv'), rows.join('\n'));
  console.log('catalog/PRODUCT_STATUS_RECONCILIATION.csv generado exitosamente.');
})();
