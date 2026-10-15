import { workerFetch } from './workerGuard.ts';

function wait(milliseconds: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const cancel = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

// Read-only retries: at most three bounded requests, never a final raw fetch.
// A caller's execution deadline also interrupts the backoff sleep.
export async function fetchWithWorkerReadBackoff(input: RequestInfo | URL, init: RequestInit = {},
  fetcher = workerFetch, delay = wait): Promise<Response> {
  const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') throw new Error('Worker read retries require GET or HEAD');
  const signal = init.signal || (input instanceof Request ? input.signal : undefined);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw signal.reason;
    try {
      const response = await fetcher(input, signal ? { ...init, signal } : init);
      if (response.status !== 429 || attempt === 2) return response;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (attempt === 2) throw error;
    }
    await delay(1000 * 2 ** attempt, signal);
  }
  throw new Error('Worker read retries exhausted');
}
