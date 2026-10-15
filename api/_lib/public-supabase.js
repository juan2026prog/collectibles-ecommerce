import { createClient } from '@supabase/supabase-js';

// Public read paths must never fall back to a service key or inherit a visitor's session.
export function createPublicSupabase(env = process.env) {
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Public Supabase configuration unavailable');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithDeadline },
  });
}

export async function fetchWithDeadline(input, init = {}) {
  const timeout = AbortSignal.timeout(5000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    // Report only controlled transport metadata, never request headers or credentials.
    throw new Error(`Public database transport failed: ${error?.name || 'Error'} ${error?.cause?.code || ''}`);
  }
}

export async function withDeadline(operation, milliseconds = 4000) {
  const controller = new AbortController();
  let timer;
  try {
    const pending = typeof operation.abortSignal === 'function'
      ? operation.abortSignal(controller.signal) : operation;
    const result = await Promise.race([
      Promise.resolve(pending),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Database request timed out'));
        }, milliseconds);
      }),
    ]);
    if (result?.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
    return result;
  } finally {
    clearTimeout(timer);
  }
}
