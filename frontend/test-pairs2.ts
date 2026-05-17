import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from('products')
    .select('id, brand_id, product_categories!inner(category_id)')
    .eq('status', 'published');
  
  if (error) console.error(error);
  
  const withoutBrand = data?.filter(d => !d.brand_id).length;
  const total = data?.length;
  
  console.log(`Total published products with category: ${total}`);
  console.log(`Total without brand: ${withoutBrand}`);
}
run();
