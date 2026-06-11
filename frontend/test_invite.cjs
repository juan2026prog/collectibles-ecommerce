const fs = require('fs');
const path = require('path');
const envLines = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8').split('\n').filter(Boolean);
const env = {};
for(let line of envLines) { 
  if (!line.includes('=')) continue;
  const [k,...v] = line.split('='); 
  env[k] = v.join('=').replace(/['"]/g, '').trim(); 
}
const {createClient} = require('@supabase/supabase-js');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('vendor_invitations').select('*');
  console.log("Data:", data, "Error:", error);
}
test();
