const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const data = {};

  const { data: products } = await supabase.from('products').select('*');
  data.products = products || [];

  const { data: categories } = await supabase.from('categories').select('*');
  data.categories = categories || [];

  const { data: brands } = await supabase.from('brands').select('*');
  data.brands = brands || [];

  fs.writeFileSync('audit_data.json', JSON.stringify(data, null, 2));
  console.log('done');
}

run();
