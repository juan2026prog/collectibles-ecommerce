import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function run() {
  const { data: cat } = await supabase.from('categories').select('id').eq('slug', 'funko-pop').single();
  console.log('Cat id:', cat?.id);

  if (cat) {
    const { data: allProducts, count } = await supabase.from('products').select('id, status, is_active, base_price', { count: 'exact' }).eq('category_id', cat.id);
    console.log('Total products:', count);
    
    const stats = { statuses: {}, is_active: {} };
    for(const p of allProducts || []) {
      stats.statuses[p.status] = (stats.statuses[p.status] || 0) + 1;
      stats.is_active[p.is_active] = (stats.is_active[p.is_active] || 0) + 1;
    }
    console.log('Stats:', stats);
  }
}
run();
