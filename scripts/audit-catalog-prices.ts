import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env files
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../frontend/.env') });
dotenv.config({ path: path.join(__dirname, '../frontend/.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runAudit() {
  console.log("Starting massive price integrity audit...");

  const results: any = {
    timestamp: new Date().toISOString(),
    totalActivePublishedProducts: 0,
    totalActiveVariants: 0,
    invalidBasePrices: [],
    invalidVariantAdjustments: [],
    negativeEffectivePrices: [],
    invalidVendorProductPrices: [],
    invalidVendorVariantAdjustments: [],
    productsWithoutActiveVariants: [],
    inactiveVariantsWithStock: [],
  };

  // 1. Count active published products
  const { count: prodCount, error: prodCountErr } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('is_active', true);
  if (prodCountErr) throw prodCountErr;
  results.totalActivePublishedProducts = prodCount || 0;

  // 2. Count active variants of active published products
  const { data: variantsData, error: varCountErr } = await supabase
    .from('product_variants')
    .select('id, product_id, is_active, price_adjustment, inventory_count, products!inner(status, is_active)')
    .eq('products.status', 'published')
    .eq('products.is_active', true)
    .eq('is_active', true);
  if (varCountErr) throw varCountErr;
  results.totalActiveVariants = variantsData?.length || 0;

  // 3. Products with invalid base price (null, <= 0)
  const { data: invalidProds, error: invalidProdsErr } = await supabase
    .from('products')
    .select('id, title, base_price, status, is_active')
    .eq('status', 'published')
    .eq('is_active', true)
    .or('base_price.is.null,base_price.lte.0');
  if (invalidProdsErr) throw invalidProdsErr;
  results.invalidBasePrices = invalidProds || [];

  // 4. Variants with null adjustments
  const { data: nullAdjustments, error: nullAdjErr } = await supabase
    .from('product_variants')
    .select('id, name, price_adjustment, product_id, products!inner(title, status, is_active)')
    .eq('products.status', 'published')
    .eq('products.is_active', true)
    .eq('is_active', true)
    .is('price_adjustment', null);
  if (nullAdjErr) throw nullAdjErr;
  results.invalidVariantAdjustments = nullAdjustments || [];

  // 5. Variants with effective price <= 0
  const { data: allActiveVariants, error: allVarErr } = await supabase
    .from('product_variants')
    .select('id, name, price_adjustment, product_id, products!inner(title, base_price, status, is_active)')
    .eq('products.status', 'published')
    .eq('products.is_active', true)
    .eq('is_active', true);
  if (allVarErr) throw allVarErr;

  for (const v of allActiveVariants || []) {
    const base = Number(v.products.base_price || 0);
    const adj = Number(v.price_adjustment || 0);
    const finalPrice = base + adj;
    if (isNaN(finalPrice) || finalPrice <= 0) {
      results.negativeEffectivePrices.push({
        variant_id: v.id,
        variant_name: v.name,
        product_id: v.product_id,
        product_title: v.products.title,
        base_price: base,
        price_adjustment: adj,
        effective_price: finalPrice
      });
    }
  }

  // 6. Vendor products with invalid prices (null, <= 0)
  const { data: invalidVendorProds, error: invVendorProdsErr } = await supabase
    .from('vendor_products')
    .select('id, price, product_id, products!inner(title, status, is_active)')
    .eq('products.status', 'published')
    .eq('products.is_active', true)
    .eq('status', 'active')
    .or('price.is.null,price.lte.0');
  if (invVendorProdsErr) throw invVendorProdsErr;
  results.invalidVendorProductPrices = invalidVendorProds || [];

  // 7. Vendor variants with null price_adjustment
  const { data: invalidVendorVars, error: invVendorVarsErr } = await supabase
    .from('vendor_product_variants')
    .select('id, price_adjustment, vendor_product_id, vendor_products!inner(status, products!inner(title, status, is_active))')
    .eq('vendor_products.products.status', 'published')
    .eq('vendor_products.products.is_active', true)
    .eq('vendor_products.status', 'active')
    .is('price_adjustment', null);
  if (invVendorVarsErr) throw invVendorVarsErr;
  results.invalidVendorVariantAdjustments = invalidVendorVars || [];

  // 8. Products without active variants
  const { data: prodsNoVars, error: prodsNoVarsErr } = await supabase
    .from('products')
    .select('id, title, status, is_active')
    .eq('status', 'published')
    .eq('is_active', true);
  if (prodsNoVarsErr) throw prodsNoVarsErr;

  const { data: activeVarsAll, error: activeVarsAllErr } = await supabase
    .from('product_variants')
    .select('product_id')
    .eq('is_active', true);
  if (activeVarsAllErr) throw activeVarsAllErr;

  const activeProductIdsWithVariants = new Set((activeVarsAll || []).map(v => v.product_id));
  results.productsWithoutActiveVariants = (prodsNoVars || [])
    .filter(p => !activeProductIdsWithVariants.has(p.id))
    .map(p => ({ id: p.id, title: p.title }));

  // 9. Inactive variants with stock
  const { data: inactiveWithStock, error: inactiveStockErr } = await supabase
    .from('product_variants')
    .select('id, name, inventory_count, product_id, products!inner(title, status, is_active)')
    .eq('products.status', 'published')
    .eq('products.is_active', true)
    .eq('is_active', false)
    .gt('inventory_count', 0);
  if (inactiveStockErr) throw inactiveStockErr;
  results.inactiveVariantsWithStock = inactiveWithStock || [];

  // Generate markdown report content
  const mdContent = `# Product Price Integrity Audit Report

Generated on: ${results.timestamp}

## Executive Summary

- **Total Active Published Products:** ${results.totalActivePublishedProducts}
- **Total Active Product Variants:** ${results.totalActiveVariants}
- **Products with Invalid Base Price (Null/<=0):** ${results.invalidBasePrices.length}
- **Variants with Null Price Adjustment:** ${results.invalidVariantAdjustments.length}
- **Variants with Negative/Zero Effective Price:** ${results.negativeEffectivePrices.length}
- **Vendor Products with Invalid Price:** ${results.invalidVendorProductPrices.length}
- **Vendor Variants with Null Adjustment:** ${results.invalidVendorVariantAdjustments.length}
- **Products without Active Variants:** ${results.productsWithoutActiveVariants.length}
- **Inactive Variants with Remaining Stock:** ${results.inactiveVariantsWithStock.length}

---

## 1. Products with Invalid Base Price
${results.invalidBasePrices.length === 0 ? '_No issues found._' : results.invalidBasePrices.map((p: any) => `- [${p.title}](file:///c:/Projects/Collectibles2026/frontend/src/pages/ProductDetail.tsx) (ID: \`${p.id}\`, Base Price: \`${p.base_price}\`)`).join('\n')}

## 2. Product Variants with Null Price Adjustment
${results.invalidVariantAdjustments.length === 0 ? '_No issues found._' : results.invalidVariantAdjustments.map((v: any) => `- Variant \`${v.name}\` (ID: \`${v.id}\`) of Product \`${v.products.title}\`: Adjustment is \`null\``).join('\n')}

## 3. Product Variants with Zero/Negative Effective Price (\`base_price + price_adjustment\`)
${results.negativeEffectivePrices.length === 0 ? '_No issues found._' : results.negativeEffectivePrices.map((v: any) => `- Variant \`${v.variant_name}\` of Product \`${v.product_title}\`: Base \`${v.base_price}\` + Adj \`${v.price_adjustment}\` = Effective \`${v.effective_price}\``).join('\n')}

## 4. Vendor Products with Invalid Price
${results.invalidVendorProductPrices.length === 0 ? '_No issues found._' : results.invalidVendorProductPrices.map((vp: any) => `- Vendor Product (ID: \`${vp.id}\`) for \`${vp.products.title}\`: Price is \`${vp.price}\``).join('\n')}

## 5. Vendor Variants with Null Adjustment
${results.invalidVendorVariantAdjustments.length === 0 ? '_No issues found._' : results.invalidVendorVariantAdjustments.map((vpv: any) => `- Vendor Variant (ID: \`${vpv.id}\`): Adjustment is \`null\``).join('\n')}

## 6. Products without Active Variants
${results.productsWithoutActiveVariants.length === 0 ? '_No issues found._' : results.productsWithoutActiveVariants.map((p: any) => `- [${p.title}](file:///c:/Projects/Collectibles2026/frontend/src/pages/ProductDetail.tsx) (ID: \`${p.id}\`)`).join('\n')}

## 7. Inactive Variants with Remaining Stock (Potential Orphan Inventory)
${results.inactiveVariantsWithStock.length === 0 ? '_No issues found._' : results.inactiveVariantsWithStock.map((v: any) => `- Variant \`${v.name}\` of \`${v.products.title}\` has \`${v.inventory_count}\` items in stock but is set to inactive.`).join('\n')}
`;

  // Write markdown report
  const reportPath = path.join(__dirname, '../docs/diagnostics/PRODUCT_PRICE_INTEGRITY_AUDIT.md');
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, mdContent, 'utf-8');
  console.log(`Massive pricing audit complete! Report generated at: ${reportPath}`);
}

runAudit().catch(err => {
  console.error("Audit failed:", err);
  process.exit(1);
});
