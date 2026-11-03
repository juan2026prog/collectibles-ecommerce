import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getSession: vi.fn(),
  getPublicSettingsBundle: vi.fn(),
  isDomainEnabled: vi.fn()
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    auth: { getSession: mocks.getSession }
  }
}));

vi.mock('../lib/providers/PublicCatalogProvider', () => ({
  PublicCatalogProvider: {
    isDomainEnabled: mocks.isDomainEnabled,
    getPublicSettingsBundle: mocks.getPublicSettingsBundle
  }
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
});

describe('Fail-Closed International Visibility & Supabase Sole Authority', () => {

  it('1. Supabase is the sole authority of record: Worker or external state never overrides Supabase RPC (false)', async () => {
    // Supabase RPC is authority: false
    mocks.rpc.mockReturnValue({
      abortSignal: async () => ({
        data: { international_public_enabled: false, international_purchases_enabled: false },
        error: null
      })
    });

    const { fetchInternationalSettings } = await import('../hooks/useInternationalSettings');
    const settings = await fetchInternationalSettings(true, false);

    expect(settings).not.toBeNull();
    // Must strictly be false, fetched directly and authoritatively from Supabase RPC
    expect(settings?.international_public_enabled).toBe(false);
    expect(settings?.international_purchases_enabled).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('2. Network failure / settings unavailable defaults to safe fail-closed behavior', async () => {
    mocks.rpc.mockReturnValue({
      abortSignal: async () => ({
        data: null,
        error: { message: 'Network connection failed' }
      })
    });

    const { fetchInternationalSettings } = await import('../hooks/useInternationalSettings');
    const settings = await fetchInternationalSettings(true, false);

    // In public context when network fails and no cache exists, returns null (fail-closed)
    expect(settings).toBeNull();
  });

  it('3. purchasesEnabled and publicEnabled are strictly fail-closed (false) when settings is null', async () => {
    const { useInternationalSettings } = await import('../hooks/useInternationalSettings');
    const { renderHook } = await import('@testing-library/react');
    const { result } = renderHook(() => useInternationalSettings(false, false));

    // While not loaded or when settings is null, purchasesEnabled is strictly false
    expect(result.current.purchasesEnabled).toBe(false);
    expect(result.current.publicEnabled).toBe(false);
  });

  it('4. When Supabase returns verified true, it is correctly reflected', async () => {
    mocks.rpc.mockReturnValue({
      abortSignal: async () => ({
        data: {
          international_public_enabled: true,
          international_purchases_enabled: true,
          international_capacity_enabled: true
        },
        error: null
      })
    });

    const { fetchInternationalSettings } = await import('../hooks/useInternationalSettings');
    const settings = await fetchInternationalSettings(true, false);

    expect(settings?.international_public_enabled).toBe(true);
    expect(settings?.international_purchases_enabled).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

});
