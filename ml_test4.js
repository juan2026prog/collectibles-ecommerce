const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    const mlItemId = "MLU615886931";
    const { data: links } = await supabase
        .from('ml_catalog_links')
        .select('vendor_product_id, vendor_product_variant_id')
        .eq('ml_item_id', mlItemId);

    console.log("Links found:", links);

    for (const link of (links || [])) {
        if (link.vendor_product_variant_id) {
           const { data, error: vvErr } = await supabase
             .from('vendor_product_variants')
             .update({ 
               inventory_count: 9,
               skip_ml_sync: true,
               updated_at: new Date().toISOString() 
             })
             .eq('id', link.vendor_product_variant_id)
             .select();
             
           if (vvErr) {
               console.error("Error updating:", vvErr);
           } else {
               console.log("Success updating:", data);
           }
        }
    }
}

run().catch(console.error);
