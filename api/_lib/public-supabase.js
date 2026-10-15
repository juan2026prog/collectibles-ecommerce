import { createClient } from '@supabase/supabase-js';

// Per serverless instance: bound active HTTP reads and reject an unbounded bot queue.
// This is not a database-wide connection limit.
export function createReadGate(concurrency = 3, maxQueued = 24) {
  let active = 0;
  const queue = [];
  const pump = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      job.signal?.removeEventListener('abort', job.cancel);
      if (job.signal?.aborted) { job.reject(new Error('Database request timed out')); continue; }
      active++;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { active--; pump(); });
    }
  };
  return (task, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Database request timed out'));
    if (active >= concurrency && queue.length >= maxQueued) {
      return reject(Object.assign(new Error('Public read queue full'), { code: 'READ_QUEUE_FULL' }));
    }
    const job = { task, signal, resolve, reject, cancel: null };
    job.cancel = () => {
      const index = queue.indexOf(job);
      if (index >= 0) queue.splice(index, 1);
      reject(new Error('Database request timed out'));
    };
    signal?.addEventListener('abort', job.cancel, { once: true });
    queue.push(job); pump();
  });
}

const publicReadGate = createReadGate();

export function publicReadFailure(error) {
  const code = /^[A-Z0-9_]{1,32}$/.test(String(error?.code || '')) ? error.code : undefined;
  const kind = code === '57014' ? 'QUERY_CANCELLED' : code === '22P02' ? 'INVALID_IDENTIFIER'
    : code === 'READ_QUEUE_FULL' ? 'OVERLOADED'
      : /timeout|timed out|AbortError/i.test(String(error?.message || '')) ? 'TIMEOUT' : 'UPSTREAM_READ_FAILED';
  return { kind, ...(code ? { code } : {}) };
}

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
  return publicReadGate(async () => {
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
  }, callerSignal ? AbortSignal.any([budget, callerSignal]) : budget);
}

export async function withDeadline(operation, milliseconds = 4000) {
  const controller = new AbortController();
  let timer;
  try {
    const pending = typeof operation === 'function' ? operation(controller.signal)
      : typeof operation.abortSignal === 'function' ? operation.abortSignal(controller.signal) : operation;
    const result = await Promise.race([
      Promise.resolve(pending),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Database request timed out'));
        }, milliseconds);
      }),
    ]);
    if (result?.error) throw Object.assign(new Error('Database request failed'), { code: result.error.code });
    return result;
  } finally {
    clearTimeout(timer);
    // Also cancel sibling reads if a factory's Promise.all rejects before its timer.
    controller.abort();
  }
}

export function createPublicReadContext(milliseconds = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return {
    async read(operation, timeout = 4000, stage = 'seo_read') {
      if (controller.signal.aborted) throw Object.assign(new Error('Database request timed out'), { stage });
      try {
        return await withDeadline(signal => {
          const combined = AbortSignal.any([signal, controller.signal]);
          return typeof operation === 'function' ? operation(combined) : operation.abortSignal(combined);
        }, timeout);
      } catch (error) { error.stage ||= stage; throw error; }
    },
    close() { clearTimeout(timer); controller.abort(); },
  };
}
