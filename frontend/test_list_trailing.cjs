const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: dataWithout, error: errorWithout } = await supabase.storage.from('public-assets').list('banners', { limit: 10 });
  console.log('--- list("banners") ---');
  console.log(dataWithout ? dataWithout.map(f => ({ name: f.name, id: f.id })) : errorWithout);

  const { data: dataWith, error: errorWith } = await supabase.storage.from('public-assets').list('banners/', { limit: 10 });
  console.log('--- list("banners/") ---');
  console.log(dataWith ? dataWith.map(f => ({ name: f.name, id: f.id })) : errorWith);
}

run();
