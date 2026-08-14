import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { auditProductBrand } from '../frontend/src/lib/brandGovernanceAuditEngine';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../frontend/.env') });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!key) {
  console.error("No supabase key found!");
  process.exit(1);
}

const supabase = createClient(url, key);

async function runDatabaseAuditPopulation() {
  console.log("=== PARALLEL BATCH POPULATION OF BRAND AUDIT METADATA ===");

  // 1. Fetch DB Brands
  const { data: dbBrands, error: bErr } = await supabase.from('brands').select('id, name, slug');
  if (bErr) {
    console.error("Error fetching DB brands:", bErr);
    return;
  }

  // 2. Fetch all Published Vendor Products (Paginated)
  let allProducts: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error: pErr } = await supabase
      .from('products')
      .select(`
        id, title, status, vendor_id, brand_id, ml_item_id, metadata, ml_attributes,
        is_brand_exception, needs_brand_review,
        brand:brands!products_brand_id_fkey(id, name),
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

  console.log(`Total Published Vendor Products to process: ${allProducts.length}`);

  let updatedCount = 0;
  let reviewCount = 0;
  const chunkSize = 50;

  for (let i = 0; i < allProducts.length; i += chunkSize) {
    const chunk = allProducts.slice(i, i + chunkSize);
    const updatePromises = chunk.map(p => {
      const auditRes = auditProductBrand({
        ...p,
        brand_name: p.brand?.name || ''
      }, dbBrands || []);

      if (auditRes.needsReview) reviewCount++;

      return supabase
        .from('products')
        .update({
          needs_brand_review: auditRes.needsReview,
          brand_audit_status: auditRes.classification,
          brand_audit_reason: auditRes.reason,
          suggested_brand_id: auditRes.suggestedBrandId,
          suggested_brand_name: auditRes.suggestedBrandName,
          brand_confidence_score: auditRes.confidenceScore
        })
        .eq('id', p.id);
    });

    await Promise.all(updatePromises);
    updatedCount += chunk.length;
    console.log(`Processed batch ${i + chunk.length} / ${allProducts.length}`);
  }

  console.log(`\n✅ Auditoría en DB completada exitosamente!`);
  console.log(`- Total productos procesados: ${updatedCount}`);
  console.log(`- Productos marcados con needs_brand_review = true: ${reviewCount}`);
}

runDatabaseAuditPopulation().catch(console.error);
