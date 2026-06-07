const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // We fetch products where seo_title ends with " | Collectibles"
  // to target the 378 products updated in Phase 3B.
  const { data, error } = await supabase
    .from('products')
    .select('id, title, slug, brand:brands(name), seo_title, seo_description, metadata')
    .like('seo_title', '% | Collectibles');

  if (error) {
    console.error("Error fetching data:", error);
    process.exit(1);
  }

  console.log(`Found ${data.length} products.`);
  fs.writeFileSync('current_seo_products.json', JSON.stringify(data, null, 2));
}

main();
