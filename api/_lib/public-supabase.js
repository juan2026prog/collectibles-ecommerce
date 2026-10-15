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
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const method = String(init.method || request?.method || 'GET').toUpperCase();
  const pathname = new URL(request?.url || input).pathname;
  // Only replay safe reads. Never retry arbitrary RPCs or application writes.
  const retryable = method === 'GET' || method === 'HEAD'
    || (method === 'POST' && !request && pathname === '/rest/v1/rpc/get_international_public_status');
  const budget = AbortSignal.timeout(8000);
  const callerSignal = init.signal || request?.signal;
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(5000);
    const signal = AbortSignal.any([budget, timeout, ...(callerSignal ? [callerSignal] : [])]);
    try {
      return await fetch(input, { ...init, signal });
    } catch (error) {
      const kind = ['TimeoutError', 'AbortError', 'TypeError'].includes(error?.name) ? error.name : 'Error';
      if (attempt === 0 && retryable && kind !== 'Error' && !callerSignal?.aborted && !budget.aborted) continue;
      // Report only controlled transport metadata, never request headers or credentials.
      const code = typeof error?.cause?.code === 'string' && /^[A-Z_0-9]{1,48}$/.test(error.cause.code) ? ` ${error.cause.code}` : '';
      throw new Error(`Public database transport failed: ${kind}${code}`);
    }
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
