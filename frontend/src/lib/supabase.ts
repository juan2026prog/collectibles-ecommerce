import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase configuration with process.env fallback.
// These are PUBLIC keys (anon key) — safe for client-side use.
// The anon key only grants access allowed by RLS policies.
const env = (typeof import.meta !== 'undefined' && import.meta?.env) ? import.meta.env : (process.env as any) || {};
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// LOW-06: Fail loudly on missing env vars instead of silently creating broken clients
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '⚠️ Missing Supabase environment variables. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
