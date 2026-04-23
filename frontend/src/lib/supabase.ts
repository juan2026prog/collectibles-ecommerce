import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase configuration.
// These are PUBLIC keys (anon key) — safe for client-side use.
// The anon key only grants access allowed by RLS policies.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '⚠️ Missing Supabase environment variables. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
