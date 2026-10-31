import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules(); localStorage.clear();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://public-test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Supabase public client isolation', () => {
  it('initializes authentication when Web Locks are unavailable', async () => {
    const { supabase } = await import('../lib/supabase');
    const result = await supabase.auth.getSession();
    expect(result.error).toBeNull();
    expect(result.data.session).toBeNull();
    supabase.auth.stopAutoRefresh();
  });

  it('reads public data even while the visitor auth lock is blocked', async () => {
    const request = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('navigator', { locks: { request } });
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ key: 'store_name', value: 'Collectibles' }]), {
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', transport);
    const { publicSupabase, supabase } = await import('../lib/supabase');
    const result = await publicSupabase.from('public_site_config').select('*');

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ key: 'store_name', value: 'Collectibles' }]);
    expect(await publicSupabase.auth.getSession()).toMatchObject({ data: { session: null }, error: null });
    expect(request).toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
    const headers = new Headers(transport.mock.calls[0][1].headers);
    expect(headers.get('authorization')).toBe('Bearer public-test-key');
    publicSupabase.auth.stopAutoRefresh(); supabase.auth.stopAutoRefresh();
  });
});
