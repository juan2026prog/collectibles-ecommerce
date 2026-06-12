const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'frontend/.env.local' });
require('dotenv').config({ path: 'frontend/.env' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing credentials");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runAudit() {
  console.log("=== FASE 1: Estado de Conexión ===");
  const { data: accounts, error: errAcct } = await supabase.from('ml_seller_accounts').select('*');
  if (errAcct) console.error(errAcct);
  else {
    accounts.forEach(a => {
        console.log(`- Vendor ID: ${a.vendor_id}`);
        console.log(`- Seller ID: ${a.seller_id}`);
        console.log(`- Nickname: ${a.nickname}`);
        console.log(`- Access Token (Valid): ${a.access_token ? 'Yes' : 'No'}`);
        console.log(`- Refresh Token (Valid): ${a.refresh_token ? 'Yes' : 'No'}`);
        console.log(`- Expires At: ${a.expires_at} (Expired? ${new Date(a.expires_at) < new Date()})`);
    });
  }

  console.log("\n=== FASE 2: Inventario Importado ===");
  const { count: rawCount } = await supabase.from('ml_raw_items').select('*', { count: 'exact', head: true });
  const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('metadata->>source_platform', 'mercadolibre');
  const { count: varCount } = await supabase.from('product_variants').select('*, products!inner(*)', { count: 'exact', head: true }).eq('products.metadata->>source_platform', 'mercadolibre');
  
  console.log(`- Publicaciones importadas (ml_raw_items): ${rawCount}`);
  console.log(`- Productos creados: ${prodCount}`);
  console.log(`- Variantes creadas: ${varCount}`);

  console.log("\nDetalle de Items Publicados:");
  const { data: links } = await supabase.from('ml_catalog_links').select('*, product_variants(*), vendor_product_variants(*)');
  const { data: raws } = await supabase.from('ml_raw_items').select('ml_item_id, title, available_quantity');
  
  const rawMap = new Map(raws?.map(r => [r.ml_item_id, r]) || []);

  const table = links?.map(l => ({
      "ML Item ID": l.ml_item_id,
      "SKU (Vendor/Master)": l.vendor_product_variants?.sku_vendedor || l.product_variants?.sku,
      "Título": rawMap.get(l.ml_item_id)?.title || 'N/A',
      "Stock ML": rawMap.get(l.ml_item_id)?.available_quantity || 0,
      "Stock Local": l.vendor_product_variants?.inventory_count ?? l.product_variants?.inventory_count,
      "Estado Sync": l.last_sync_status
  })) || [];

  if (table.length > 0) {
      console.table(table);
  } else {
      console.log("No hay items publicados (ml_catalog_links).");
  }

  console.log("\n=== PREPARANDO DATOS PARA FASES 3 Y 4 ===");
  if (links && links.length > 0) {
      const target = links[0];
      console.log(`Utilizaremos el ítem: ${target.ml_item_id} (Variant: ${target.variant_id}, Vendor Variant: ${target.vendor_product_variant_id})`);
      console.log(`Stock actual local: ${target.vendor_product_variants?.inventory_count ?? target.product_variants?.inventory_count}`);
      console.log(`Access Token para pruebas ML: ${accounts?.find(a => a.seller_id === target.seller_id)?.access_token}`);
  }
}

runAudit();
