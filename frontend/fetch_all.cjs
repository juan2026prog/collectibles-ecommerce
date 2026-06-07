const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Leer de las variables de entorno de Windows que setearé antes
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  let allProducts = [];
  let from = 0;
  let to = 999;
  
  while (true) {
    const { data, error } = await supabase.from('products').select('id, slug, title, description, seo_title, metadata, brand:brands(name), category:categories(name)').range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allProducts.push(...data);
    from += 1000;
    to += 1000;
    if (data.length < 1000) break;
  }
  
  // Filter out the 20 already processed
  // Actually, let's keep all or just the ones where seo_title is null or not updated yet.
  const toAudit = allProducts.filter(p => p.seo_title === null || p.seo_title === '');
  
  fs.writeFileSync('all_products.json', JSON.stringify(toAudit, null, 2));
  console.log(`Fetched ${toAudit.length} products to audit.`);
}

run().catch(console.error);
