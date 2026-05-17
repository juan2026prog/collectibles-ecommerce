import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from('products')
    .select('brand:brands!inner(slug), categories:product_categories!inner(category:categories!inner(slug))')
    .eq('status', 'published');
  
  if (error) console.error(error);
  console.log(data ? `Got ${data.length} records. Example: ${JSON.stringify(data[0])}` : 'No data');
}
run();
