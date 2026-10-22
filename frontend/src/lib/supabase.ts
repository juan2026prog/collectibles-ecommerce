import { createClient } from '@supabase/supabase-js';
import { navigatorLock } from '@supabase/auth-js';

// Use environment variables for Supabase configuration with process.env fallback.
// These are PUBLIC keys (anon key) — safe for client-side use.
// The anon key only grants access allowed by RLS policies.
const env = (typeof import.meta !== 'undefined' && import.meta?.env) ? import.meta.env : (process.env as any) || {};
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Custom lock implementation extending the Web Locks acquisition timeout
    // to 15000ms using the official, exported navigatorLock from @supabase/auth-js.
    lock: (name, _acquireTimeout, fn) => navigatorLock(name, 15000, fn),
  },
});
