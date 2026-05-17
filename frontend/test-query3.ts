import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const catId = '94c47727-f07d-4c80-b74d-eb8344c8ddeb';
  let query = supabase.from('products').select(`id, title, product_categories!inner(category_id)`, { count: 'exact' });
  query = query.eq('product_categories.category_id', catId);
  const { data, count, error } = await query;
  console.log('Count:', count);
  console.log('Error:', error);
}
run();
