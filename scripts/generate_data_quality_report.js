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

const { validateGtin } = require('../api/lib/seo-helpers.js');

(async () => {
  console.log('Generando reporte de calidad de datos del catálogo (seo/DATA_QUALITY_REPORT.csv)...');

  const rows = [];
  rows.push('product_id,title,slug,issue_type,severity,recommendation_action,notes');

  const { data: products } = await supabase
    .from('products')
    .select('id, title, slug, description, short_description, brand_id, category_id, metadata, base_price, is_active, status');

  const [{ data: brands }, { data: images }] = await Promise.all([
    supabase.from('brands').select('id, name'),
    supabase.from('product_images').select('product_id')
  ]);

  const brandMap = {};
  if (brands) brands.forEach(b => brandMap[b.id] = b.name);

  const imageSet = new Set();
  if (images) images.forEach(img => imageSet.add(img.product_id));

  let issueCount = 0;

  if (products) {
    products.forEach(p => {
      // 1. Poor or short title
      if (!p.title || p.title.length < 5) {
        issueCount++;
        rows.push(`"${p.id}","${(p.title || '').replace(/"/g, '""')}","${p.slug}","POOR_TITLE","HIGH","MANUAL_REVIEW","Título de producto demasiado corto o vacío"`);
      }

      // 2. Missing description
      if (!p.description && !p.short_description) {
        issueCount++;
        rows.push(`"${p.id}","${p.title.replace(/"/g, '""')}","${p.slug}","MISSING_DESCRIPTION","LOW","AUTO_FIX_SAFE","Sin descripción detallada, se usará plantilla estándar"`);
      }

      // 3. Missing brand
      if (!p.brand_id || !brandMap[p.brand_id]) {
        issueCount++;
        rows.push(`"${p.id}","${p.title.replace(/"/g, '""')}","${p.slug}","MISSING_BRAND","MEDIUM","MANUAL_REVIEW","Marca no asignada en catálogo"`);
      }

      // 4. Missing image
      if (!imageSet.has(p.id)) {
        issueCount++;
        rows.push(`"${p.id}","${p.title.replace(/"/g, '""')}","${p.slug}","MISSING_IMAGE","HIGH","MANUAL_REVIEW","Producto sin imágenes en product_images"`);
      }

      // 5. Invalid GTIN
      const rawGtin = p.metadata?.gtin || p.metadata?.ean;
      if (rawGtin && !validateGtin(rawGtin)) {
        issueCount++;
        rows.push(`"${p.id}","${p.title.replace(/"/g, '""')}","${p.slug}","INVALID_GTIN","MEDIUM","MANUAL_REVIEW","GTIN en metadata no cumple formato estándar 8/12/13/14 dígitos"`);
      }
    });
  }

  const seoDir = path.join(__dirname, '../seo');
  if (!fs.existsSync(seoDir)) fs.mkdirSync(seoDir, { recursive: true });

  fs.writeFileSync(path.join(seoDir, 'DATA_QUALITY_REPORT.csv'), rows.join('\n'));
  console.log(`Reporte de calidad de datos generado en seo/DATA_QUALITY_REPORT.csv. Hallazgos: ${issueCount}`);
})();
