const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: rootData, error: rootError } = await supabase.storage.from('public-assets').list('', { limit: 100 });
  if (rootError) {
    console.error('Root error:', rootError);
    return;
  }
  console.log('--- Root files and folders ---');
  console.log(rootData.map(f => ({ name: f.name, id: f.id })));

  const folders = rootData.filter(f => !f.id).map(f => f.name);
  for (const folder of folders) {
    const { data: folderData, error: folderError } = await supabase.storage.from('public-assets').list(folder, { limit: 100 });
    if (folderError) {
      console.error(`Error in folder ${folder}:`, folderError);
      continue;
    }
    console.log(`--- Files and folders in "${folder}" ---`);
    console.log(folderData.map(f => ({ name: f.name, id: f.id })));
  }
}

run();
