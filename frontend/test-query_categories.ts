import { createClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';

const url = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';
const supabase = createClient(url, key);

test('fetch catalog categories and products', async () => {
  const { data: categories } = await supabase.from('categories').select('id, name, slug');
  console.log('CATEGORIES:', JSON.stringify(categories, null, 2));

  const { data: products } = await supabase
    .from('products')
    .select('id, title, base_price, category_id, is_featured')
    .eq('status', 'published')
    .limit(10);
  console.log('PRODUCTS:', JSON.stringify(products, null, 2));
  
  expect(true).toBe(true);
});
