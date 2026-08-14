import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../frontend/.env') });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!key) {
  console.error("No supabase key found!");
  process.exit(1);
}

const supabase = createClient(url, key);

const KNOWN_MANUFACTURERS: Record<string, string[]> = {
  'Hasbro': ['hasbro', 'kenner'],
  'Funko': ['funko', 'funko pop', 'pop!'],
  'Bandai': ['bandai', 'tamashii', 'tamashii nations', 'banpresto', 'sh figuarts', 's.h. figuarts'],
  'Mattel': ['mattel', 'hot wheels', 'barbie'],
  'Takara Tomy': ['takara tomy', 'takaratomy', 'takara', 'tomy'],
  'Good Smile Company': ['good smile', 'gsc', 'goodsmile', 'nendoroid'],
  'Kotobukiya': ['kotobukiya', 'koto', 'artfx'],
  'McFarlane Toys': ['mcfarlane', 'mcfarlane toys'],
  'NECA': ['neca'],
  'Super7': ['super7', 'ultimates'],
  'Iron Studios': ['iron studios'],
  'Hot Toys': ['hot toys'],
  'Mezco': ['mezco', 'mezco toyz'],
  'Jakks Pacific': ['jakks', 'jakks pacific'],
  'Jada Toys': ['jada', 'jada toys'],
  'PhatMojo': ['phatmojo'],
  'Spin Master': ['spin master']
};

const KNOWN_LICENSES = [
  'marvel', 'disney', 'star wars', 'dc', 'dc comics', 'pokémon', 'pokemon',
  'sonic', 'minecraft', 'roblox', 'harry potter', 'dragon ball', 'naruto',
  'one piece', 'zelda', 'plantas vs zombies', 'batman', 'spiderman', 'x-men'
];

const GENERIC_NAMES = [
  'genérica', 'generica', 'generic', 'sin marca', 'no brand', 'n/a', 'na', 'desconocido', 'ninguna', '—', '-'
];

async function runAudit() {
  console.log("Fetching all published vendor products...");
  
  const { data: brands, error: bErr } = await supabase.from('brands').select('id, name, slug');
  if (bErr) console.error("Error fetching brands:", bErr);
  
  const brandMap = new Map((brands || []).map(b => [b.id, b]));
  const brandNameMap = new Map((brands || []).map(b => [b.name.toLowerCase().trim(), b]));

  let allProducts: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error: pErr } = await supabase
      .from('products')
      .select(`
        id, title, status, vendor_id, brand_id, ml_item_id, metadata, ml_attributes,
        vendor:vendors(id, store_name, company_name),
        category:categories(id, name)
      `)
      .not('vendor_id', 'is', null)
      .eq('status', 'published')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (pErr) {
      console.error("Error fetching products:", pErr);
      return;
    }
    if (batch && batch.length > 0) {
      allProducts = allProducts.concat(batch);
      page++;
      if (batch.length < pageSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  const products = allProducts;
  console.log(`Total Published Vendor Products found: ${products.length}`);

  let validCount = 0;
  let missingCount = 0;
  let genericCount = 0;
  let licenseCount = 0;
  let unknownCount = 0;
  let invalidCount = 0;
  let ambiguousCount = 0;
  let autoFixableCount = 0;
  let manualReviewCount = 0;

  const auditRows: any[] = [];

  for (const p of products || []) {
    const currentBrand = p.brand_id ? brandMap.get(p.brand_id) : null;
    const currentBrandName = currentBrand ? currentBrand.name : '';
    const titleLower = (p.title || '').toLowerCase();
    const currentBrandLower = currentBrandName.toLowerCase().trim();

    let classification = 'VALID_BRAND';
    let reason = 'Marca válida y coincidente';
    let suggestedBrand: any = null;
    let confidence = 0.95;

    // 1. Missing Brand
    if (!p.brand_id || !currentBrandName) {
      classification = 'MISSING_BRAND';
      reason = 'El producto no tiene marca asignada (brand_id is NULL)';
      confidence = 0.0;
    }
    // 2. Generic Brand
    else if (GENERIC_NAMES.includes(currentBrandLower)) {
      classification = 'GENERIC_BRAND';
      reason = `Usa marca genérica: "${currentBrandName}"`;
      confidence = 0.0;
    }
    // 3. License as Brand
    else if (KNOWN_LICENSES.includes(currentBrandLower)) {
      classification = 'LICENSE_AS_BRAND';
      reason = `La marca actual ("${currentBrandName}") es una licencia/franquicia, no un fabricante.`;
      confidence = 0.4;
    }

    // Try to detect real manufacturer from title or metadata
    let detectedManufacturer = '';
    let detectedBrandObj: any = null;

    for (const [mfrName, keywords] of Object.entries(KNOWN_MANUFACTURERS)) {
      if (keywords.some(kw => titleLower.includes(kw))) {
        detectedManufacturer = mfrName;
        detectedBrandObj = brandNameMap.get(mfrName.toLowerCase()) || null;
        break;
      }
    }

    if (detectedManufacturer && detectedBrandObj) {
      if (classification === 'MISSING_BRAND' || classification === 'GENERIC_BRAND' || classification === 'LICENSE_AS_BRAND') {
        suggestedBrand = detectedBrandObj;
        confidence = 0.90; // High confidence matching keyword in title + approved brand
        reason += ` | Sugerencia detectada en título: ${detectedManufacturer}`;
      } else if (currentBrandLower !== detectedManufacturer.toLowerCase()) {
        classification = 'AMBIGUOUS_BRAND';
        reason = `Inconsistencia: Marca actual es "${currentBrandName}", pero el título contiene "${detectedManufacturer}".`;
        suggestedBrand = detectedBrandObj;
        confidence = 0.75;
      }
    }

    // Check unknown brand
    if (classification === 'VALID_BRAND' && !currentBrand) {
      classification = 'UNKNOWN_BRAND';
      reason = `Marca ID ${p.brand_id} no encontrada en la base de datos.`;
      confidence = 0.1;
    }

    if (classification === 'VALID_BRAND') {
      validCount++;
    } else {
      if (confidence >= 0.85 && suggestedBrand) {
        autoFixableCount++;
      } else {
        manualReviewCount++;
      }

      if (classification === 'MISSING_BRAND') missingCount++;
      if (classification === 'GENERIC_BRAND') genericCount++;
      if (classification === 'LICENSE_AS_BRAND') licenseCount++;
      if (classification === 'UNKNOWN_BRAND') unknownCount++;
      if (classification === 'INVALID_BRAND') invalidCount++;
      if (classification === 'AMBIGUOUS_BRAND') ambiguousCount++;
    }

    auditRows.push({
      product_id: p.id,
      title: p.title,
      vendor_id: p.vendor_id,
      vendor_name: p.vendor?.store_name || p.vendor?.company_name || 'Desconocido',
      current_brand_id: p.brand_id || '',
      current_brand_name: currentBrandName || 'SIN MARCA',
      status: p.status,
      ml_item_id: p.ml_item_id || '',
      category: p.category?.name || '',
      classification,
      reason,
      suggested_brand_id: suggestedBrand?.id || '',
      suggested_brand_name: suggestedBrand?.name || '',
      confidence
    });
  }

  console.log("\n=== RESULTADOS PRELIMINARES AUDITORÍA MARCAS VENDOR ===");
  console.log(`Total productos auditados: ${products?.length || 0}`);
  console.log(`- VÁLIDOS (VALID_BRAND): ${validCount}`);
  console.log(`- SIN MARCA (MISSING_BRAND): ${missingCount}`);
  console.log(`- MARCA GENÉRICA (GENERIC_BRAND): ${genericCount}`);
  console.log(`- LICENCIA COMO MARCA (LICENSE_AS_BRAND): ${licenseCount}`);
  console.log(`- MARCA DESCONOCIDA (UNKNOWN_BRAND): ${unknownCount}`);
  console.log(`- MARCA INVÁLIDA (INVALID_BRAND): ${invalidCount}`);
  console.log(`- MARCA AMBIGUA (AMBIGUOUS_BRAND): ${ambiguousCount}`);
  console.log(`-----------------------------------------------`);
  console.log(`- AUTO-CORREGIBLES (Alta Confianza >= 85%): ${autoFixableCount}`);
  console.log(`- REVISIÓN MANUAL ADMIN REQUERIDA: ${manualReviewCount}`);

  // Save CSV Preview
  const csvHeaders = ['product_id', 'title', 'vendor_id', 'vendor_name', 'current_brand_id', 'current_brand_name', 'status', 'ml_item_id', 'category', 'classification', 'reason', 'suggested_brand_id', 'suggested_brand_name', 'confidence'];
  const csvLines = [
    csvHeaders.join(','),
    ...auditRows.map(r => csvHeaders.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))
  ];

  const fs = require('fs');
  fs.writeFileSync('existing_vendor_brand_audit_preview.csv', csvLines.join('\n'), 'utf8');
  console.log("\nCSV Preview guardado en: existing_vendor_brand_audit_preview.csv");
}

runAudit().catch(console.error);
