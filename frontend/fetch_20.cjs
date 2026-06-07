const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const ids = JSON.parse(fs.readFileSync('audit_results.json')).map(p => p.id);
  const { data } = await supabase.from('products').select('id, slug, title, seo_title, seo_description, metadata, brand:brands(name), category:categories(name)').in('id', ids);
  
  fs.writeFileSync('products_to_fix.json', JSON.stringify(data, null, 2));
  console.log('Wrote products_to_fix.json');
}

run().catch(console.error);
