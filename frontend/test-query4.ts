import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const { data } = await supabase.from('products').select('brand_id').limit(1);
  console.log('brand_id exists?', data ? Object.keys(data[0] || {}).includes('brand_id') : false);
}
run();
