// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), authenticate: vi.fn() }));
vi.mock('../../../server/lib/authGuard.js', () => ({ authenticateRequest: mocks.authenticate }));

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers();
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const row = { id: 'uyu', country_code: 'UY', quote_currency: 'UYU', rate: 44,
  is_manual_override: true, status: 'MANUAL_OVERRIDE', fetched_at: null };
function response() {
  const res: any = { headers: {}, statusCode: 0, body: null,
    setHeader: (key: string, value: string) => { res.headers[key] = value; },
    status: (code: number) => { res.statusCode = code; return res; },
    json: (body: any) => { res.body = body; return res; }, end: () => res };
  return res;
}
function rows(data: any[]) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}

describe('Bounded currency reads under Supabase outages', () => {
  it('coalesces concurrent reads, preserves manual rates and does not retain a stale price cache', async () => {
    let complete!: (value: Response) => void;
    mocks.fetch.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const { default: handler } = await import('../../../api/currency-sync.js');
    const first = response(), second = response();
    const pending = [handler({ method: 'GET', query: {} }, first), handler({ method: 'GET', query: {} }, second)];
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    complete(rows([row]));
    await Promise.all(pending);

    for (const res of [first, second]) {
      expect(res.statusCode).toBe(200);
      expect(res.body.rates[0]).toMatchObject({ rate: 44, is_manual_override: true });
    }
    mocks.fetch.mockResolvedValue(rows([{ ...row, rate: 45 }]));
    const next = response(); await handler({ method: 'GET', query: {} }, next);
    expect(next.body.rates[0].rate).toBe(45);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it('aborts the actual upstream read at 3.5 seconds, returns an honest fallback, and recovers', async () => {
    let signal!: AbortSignal;
    mocks.fetch.mockImplementation((_input, init) => { signal = init.signal; return new Promise((_, reject) => signal.addEventListener('abort',
      () => reject(new DOMException('Aborted', 'AbortError')), { once: true })); });
    const { default: handler } = await import('../../../api/currency-sync.js');
    const res = response(); const pending = handler({ method: 'GET', query: {} }, res);
    await vi.advanceTimersByTimeAsync(3500); await pending;

    expect(signal.aborted).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe('INSTITUTIONAL_FALLBACK');
    expect(res.body.rates.every((r: any) => r.status === 'STALE' && r.is_fallback)).toBe(true);
    mocks.fetch.mockResolvedValue(rows([row]));
    const recovered = response(); await handler({ method: 'GET', query: {} }, recovered);
    expect(recovered.body.source).toBe('SUPABASE_EXCHANGE_RATES');
  });

  it('still rejects unauthorized sync requests before touching the database', async () => {
    mocks.authenticate.mockResolvedValue({ authenticated: false });
    const { default: handler } = await import('../../../api/currency-sync.js');
    const res = response(); await handler({ method: 'GET', query: { sync: 'true' } }, res);
    expect(res.statusCode).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
