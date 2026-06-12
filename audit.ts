import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

const env = await load();
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

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
        console.log(`- Access Token (Valid): ${a.access_token ? 'Yes (hidden)' : 'No'}`);
        console.log(`- Refresh Token (Valid): ${a.refresh_token ? 'Yes (hidden)' : 'No'}`);
        console.log(`- Expires At: ${a.expires_at} (Is expired? ${new Date(a.expires_at) < new Date()})`);
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

  console.table(links?.map(l => ({
      "ML Item ID": l.ml_item_id,
      "SKU (Vendor/Master)": l.vendor_product_variants?.sku_vendedor || l.product_variants?.sku,
      "Título": rawMap.get(l.ml_item_id)?.title || 'N/A',
      "Stock ML": rawMap.get(l.ml_item_id)?.available_quantity || 0,
      "Stock Local": l.vendor_product_variants?.inventory_count ?? l.product_variants?.inventory_count,
      "Estado Sync": l.last_sync_status
  })));

  console.log("\n=== PREPARANDO DATOS PARA FASES 3 Y 4 ===");
  if (links && links.length > 0) {
      const target = links[0];
      console.log(`Utilizaremos el ítem: ${target.ml_item_id} (Variant: ${target.variant_id}, Vendor Variant: ${target.vendor_product_variant_id})`);
      console.log(`Stock actual local: ${target.vendor_product_variants?.inventory_count ?? target.product_variants?.inventory_count}`);
      console.log(`Access Token para pruebas ML: ${accounts?.find(a => a.seller_id === target.seller_id)?.access_token}`);
  }
}

runAudit();
