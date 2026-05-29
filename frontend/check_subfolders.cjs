const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const placeholderPath = 'test-nested/test-sub/.emptyFolderPlaceholder';
  console.log('Uploading placeholder to:', placeholderPath);
  const emptyFile = Buffer.from('');
  
  const { error: uploadError } = await supabase.storage.from('public-assets').upload(placeholderPath, emptyFile, { upsert: true });
  if (uploadError) {
    console.error('Upload error:', uploadError);
    return;
  }

  console.log('Listing "test-nested"...');
  const { data: listData, error: listError } = await supabase.storage.from('public-assets').list('test-nested');
  if (listError) {
    console.error('List error:', listError);
  } else {
    console.log('List result:', listData.map(f => ({ name: f.name, id: f.id })));
  }

  console.log('Cleaning up placeholder...');
  const { error: deleteError } = await supabase.storage.from('public-assets').remove([placeholderPath]);
  if (deleteError) {
    console.error('Delete error:', deleteError);
  }
}

run();
