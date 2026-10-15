// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getSession: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, auth: { getSession: mocks.getSession } } }));

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'admin-a' } } } });
  mocks.rpc.mockReturnValue({ abortSignal: async () => ({ data: { international_public_enabled: true }, error: null }) });
});

function adminResult(data: any, error: any = null) {
  const query: any = { select: () => query, eq: () => query, abortSignal: () => query,
    maybeSingle: async () => ({ data, error }) };
  mocks.from.mockReturnValue(query);
}

describe('International settings cache isolation', () => {
  it('deduplicates public reads without accessing private settings or sessions', async () => {
    const { fetchInternationalSettings } = await import('../hooks/useInternationalSettings');
    await Promise.all([fetchInternationalSettings(), fetchInternationalSettings(), fetchInternationalSettings()]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it('does not reuse public financial defaults for an administrator', async () => {
    const { fetchInternationalSettings } = await import('../hooks/useInternationalSettings');
    await fetchInternationalSettings();
    adminResult({ international_public_enabled: true, target_margin_percent: 37, zinc_fee_usd: 9 });
    expect(await fetchInternationalSettings(false, true)).toMatchObject({ target_margin_percent: 37, zinc_fee_usd: 9 });
    expect((await fetchInternationalSettings())?.target_margin_percent).toBe(15);
  });
  it('returns unavailable when private access fails even if a public cache exists', async () => {
    const { fetchInternationalSettings } = await import('../hooks/useInternationalSettings');
    await fetchInternationalSettings(); adminResult(null, { message: 'permission denied' });
    expect(await fetchInternationalSettings(false, true)).toBeNull();
  });
  it('never reuses another account’s private cache after the signed-in account changes', async () => {
    const { fetchInternationalSettings } = await import('../hooks/useInternationalSettings');
    adminResult({ international_public_enabled: true, target_margin_percent: 37 });
    await fetchInternationalSettings(false, true);
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'regular-b' } } } });
    adminResult(null, { message: 'permission denied' });
    expect(await fetchInternationalSettings(false, true)).toBeNull();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    expect(await fetchInternationalSettings(false, true)).toBeNull();
  });
});
