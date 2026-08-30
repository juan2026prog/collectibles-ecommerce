import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase configuration with process.env fallback.
// These are PUBLIC keys (anon key) — safe for client-side use.
// The anon key only grants access allowed by RLS policies.
const env = (typeof import.meta !== 'undefined' && import.meta?.env) ? import.meta.env : (process.env as any) || {};
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
