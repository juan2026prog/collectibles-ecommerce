// @vitest-environment node
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

describe('Fail-Closed International Visibility & Desync Resilience', () => {

  it('1. Cloudflare Worker with legacy/stale { international_enabled: true } falls through to Supabase RPC (false)', async () => {
    // Cloudflare returns outdated bundle with international_enabled: true and NO international_public_enabled
    mocks.isDomainEnabled.mockReturnValue(true);
    mocks.getPublicSettingsBundle.mockResolvedValue({
      data: {
        international_status: {
          international_enabled: true,
          pause_message: null
        }
      }
    });

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
    // Must strictly be false, completely ignoring Cloudflare's stale international_enabled
    expect(settings?.international_public_enabled).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('2. Cloudflare Worker without international_status falls through to Supabase RPC authority', async () => {
    mocks.isDomainEnabled.mockReturnValue(true);
    mocks.getPublicSettingsBundle.mockResolvedValue({
      data: {
        site_config: {}
      }
    });

    mocks.rpc.mockReturnValue({
      abortSignal: async () => ({
        data: { international_public_enabled: false, international_purchases_enabled: false },
        error: null
      })
    });

    const { fetchInternationalSettings } = await import('../hooks/useInternationalSettings');
    const settings = await fetchInternationalSettings(true, false);

    expect(settings?.international_public_enabled).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('3. Network failure / settings unavailable defaults to safe fail-closed behavior', async () => {
    mocks.isDomainEnabled.mockReturnValue(false);
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

  it('4. When Cloudflare Worker contains verified { international_public_enabled: true }, it respects it', async () => {
    mocks.isDomainEnabled.mockReturnValue(true);
    mocks.getPublicSettingsBundle.mockResolvedValue({
      data: {
        international_status: {
          international_public_enabled: true,
          international_purchases_enabled: true
        }
      }
    });

    const { fetchInternationalSettings } = await import('../hooks/useInternationalSettings');
    const settings = await fetchInternationalSettings(true, false);

    expect(settings?.international_public_enabled).toBe(true);
    expect(settings?.international_purchases_enabled).toBe(true);
    // Should NOT call Supabase since Worker has verified modern payload
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

});
