const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function scan(path = '') {
  const { data, error } = await supabase.storage.from('public-assets').list(path, { limit: 100 });
  if (error) {
    console.error(`Error listing ${path}:`, error);
    return;
  }
  for (const item of data) {
    const fullPath = path ? `${path}/${item.name}` : item.name;
    if (!item.id) {
      // It's a folder
      console.log('Folder found:', fullPath);
      await scan(fullPath);
    } else {
      // It's a file
      if (item.name === '.emptyFolderPlaceholder') {
        console.log('Placeholder found:', fullPath);
      }
    }
  }
}

scan();
