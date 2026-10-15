import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithWorkerReadBackoff } from '../../../supabase/functions/_shared/workerReadBackoff.ts';
import { runWorkerBatch } from '../../../supabase/functions/_shared/workerBatch.ts';
import { guardWorker } from '../../../supabase/functions/_shared/workerGuard.ts';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Bounded worker read recovery', () => {
  it('returns the third 429 and never sends an unbounded fourth request', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 429 }));
    const delays: number[] = [];
    const result = await fetchWithWorkerReadBackoff('https://example.com/item', {}, fetcher, async ms => { delays.push(ms); });
    expect(result.status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([1000, 2000]);
  });
  it('uses the same bounded transport after a transient network failure', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(new Response('{}'));
    const delay = vi.fn(async () => {});
    expect((await fetchWithWorkerReadBackoff('https://example.com/item', {}, fetcher, delay)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledTimes(1);
  });
  it('stops after three network failures and does not retry writes', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('network'); });
    await expect(fetchWithWorkerReadBackoff('https://example.com/item', {}, fetcher, async () => {})).rejects.toThrow('network');
    expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(fetchWithWorkerReadBackoff('https://example.com/item', { method: 'POST' }, fetcher)).rejects.toThrow('GET or HEAD');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('interrupts a backoff sleep when the execution deadline is cancelled', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn(async () => new Response('', { status: 429 }));
    const pending = fetchWithWorkerReadBackoff('https://example.com/item', { signal: controller.signal }, fetcher);
    const assertion = expect(pending).rejects.toThrow('budget expired');
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(new Error('budget expired'));
    await assertion;
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('Worker chunk concurrency and execution deadline', () => {
  it('preserves the wall-clock execution budget even before the cancellation timer runs', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(0);
    const client = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    const env = { get: (key: string) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'internal-test-key' : undefined };
    const lease = await guardWorker(new Request('https://example.com', { headers: { authorization: 'Bearer internal-test-key' } }), client, 'ml-import-worker', env);
    expect(lease.expired()).toBe(false);
    clock.mockReturnValue(45000);
    expect(lease.expired()).toBe(true);
    expect(lease.signal).toBeInstanceOf(AbortSignal);
    await lease.release();
  });
  it('settles each small chunk and never has more than two items in flight', async () => {
    let active = 0, maximum = 0;
    const completed: number[] = [];
    await runWorkerBatch([1, 2, 3, 4, 5], async item => {
      active++; maximum = Math.max(active, maximum);
      await Promise.resolve(); completed.push(item); active--;
    }, () => false);
    expect(maximum).toBe(2);
    expect(completed).toEqual([1, 2, 3, 4, 5]);
  });
  it('does not start remaining items after the current chunk exhausts the budget', async () => {
    let expired = false;
    const started: number[] = [];
    await runWorkerBatch([1, 2, 3, 4, 5], async item => { started.push(item); await Promise.resolve(); expired = true; }, () => expired);
    expect(started).toEqual([1, 2]);
    await runWorkerBatch([6, 7], async item => { started.push(item); }, () => expired);
    expect(started).toEqual([1, 2]);
  });
});
