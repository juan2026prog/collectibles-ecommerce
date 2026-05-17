import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const catId = '94c47727-f07d-4c80-b74d-eb8344c8ddeb';
  const { data, count, error } = await supabase.from('product_categories').select('*', { count: 'exact' }).eq('category_id', catId);
  console.log('product_categories count for Funko:', count);
  console.log('Error:', error);
}
run();
