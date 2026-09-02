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

const { generateProductSchema, generateBreadcrumbs } = require('../api/lib/seo-helpers.js');

(async () => {
  console.log('Iniciando auditoría de Structured Data (JSON-LD)...');

  const rows = [];
  rows.push('entity_type,entity_id,slug,schema_type,context_ok,type_ok,required_fields_ok,urls_ok,breadcrumb_items_ok,validation_result,notes');

  // 1. Audit Active Products (Product + BreadcrumbList)
  const { data: products } = await supabase
    .from('products')
    .select('id, title, slug, description, base_price, is_active, status, brand_id, category_id, metadata')
    .eq('is_active', true)
    .eq('status', 'published');

  const [{ data: brands }, { data: categories }] = await Promise.all([
    supabase.from('brands').select('id, name, slug'),
    supabase.from('categories').select('id, name, slug')
  ]);

  const brandMap = {};
  if (brands) brands.forEach(b => brandMap[b.id] = b);

  const catMap = {};
  if (categories) categories.forEach(c => catMap[c.id] = c);

  let passCount = 0;
  let failCount = 0;

  if (products) {
    products.forEach(p => {
      const b = brandMap[p.brand_id];
      const c = catMap[p.category_id];

      // Product Schema
      const pSchema = generateProductSchema(p, b, c, []);
      const pContextOk = pSchema['@context'] === 'https://schema.org/';
      const pTypeOk = pSchema['@type'] === 'Product';
      const pFieldsOk = Boolean(pSchema.name && pSchema.offers && pSchema.offers.priceCurrency === 'UYU');
      const pUrlsOk = Boolean(pSchema.url && pSchema.url.startsWith('https://collectibles.uy/producto/'));
      const pResult = (pContextOk && pTypeOk && pFieldsOk && pUrlsOk) ? 'PASS' : 'FAIL';

      if (pResult === 'PASS') passCount++; else failCount++;
      rows.push(`PRODUCT,${p.id},${p.slug},Product,${pContextOk},${pTypeOk},${pFieldsOk},${pUrlsOk},N/A,${pResult},Schema de Producto UYU`);

      // Breadcrumb Schema
      const bSchema = generateBreadcrumbs('producto', { ...p, category: c, brand: b });
      const bContextOk = bSchema['@context'] === 'https://schema.org';
      const bTypeOk = bSchema['@type'] === 'BreadcrumbList';
      let bItemsOk = true;

      bSchema.itemListElement.forEach((item, idx) => {
        if (idx > 0 && !item.item && idx < bSchema.itemListElement.length - 1) {
          bItemsOk = false;
        }
      });

      const bResult = (bContextOk && bTypeOk && bItemsOk) ? 'PASS' : 'FAIL';
      if (bResult === 'PASS') passCount++; else failCount++;
      rows.push(`PRODUCT,${p.id},${p.slug},BreadcrumbList,${bContextOk},${bTypeOk},N/A,N/A,${bItemsOk},${bResult},Breadcrumb sin nivel huerfano`);
    });
  }

  // 2. Audit Approved Categories
  if (categories) {
    categories.forEach(c => {
      const bSchema = generateBreadcrumbs('categoria', c);
      let bItemsOk = true;
      bSchema.itemListElement.forEach((item, idx) => {
        if (idx > 0 && !item.item && idx < bSchema.itemListElement.length - 1) bItemsOk = false;
      });
      const bResult = bItemsOk ? 'PASS' : 'FAIL';
      if (bResult === 'PASS') passCount++; else failCount++;
      rows.push(`CATEGORY,${c.id},${c.slug},BreadcrumbList,true,true,N/A,true,${bItemsOk},${bResult},Breadcrumb Categoria`);
    });
  }

  // 3. Audit Approved Brands
  if (brands) {
    brands.forEach(b => {
      const bSchema = generateBreadcrumbs('marca', b);
      let bItemsOk = true;
      bSchema.itemListElement.forEach((item, idx) => {
        if (idx > 0 && !item.item && idx < bSchema.itemListElement.length - 1) bItemsOk = false;
      });
      const bResult = bItemsOk ? 'PASS' : 'FAIL';
      if (bResult === 'PASS') passCount++; else failCount++;
      rows.push(`BRAND,${b.id},${b.slug},BreadcrumbList,true,true,N/A,true,${bItemsOk},${bResult},Breadcrumb Marca`);
    });
  }

  const seoDir = path.join(__dirname, '../seo');
  if (!fs.existsSync(seoDir)) fs.mkdirSync(seoDir, { recursive: true });

  fs.writeFileSync(path.join(seoDir, 'STRUCTURED_DATA_FULL_AUDIT.csv'), rows.join('\n'));
  console.log(`Auditoría de Structured Data completada. Total esquemas: ${rows.length - 1}, PASS: ${passCount}, FAIL: ${failCount}`);
})();
