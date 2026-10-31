import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mainFrom: vi.fn(), publicFrom: vi.fn(), ensure: vi.fn(), enabled: vi.fn(), bundle: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { from: mocks.mainFrom }, publicSupabase: { from: mocks.publicFrom },
}));
vi.mock('../lib/providers/PublicCatalogProvider', () => ({ PublicCatalogProvider: {
  ensureRuntimeConfigReady: mocks.ensure, isDomainEnabled: mocks.enabled,
  getPublicSettingsBundle: mocks.bundle,
} }));

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); localStorage.clear();
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.ensure.mockResolvedValue(undefined);
  mocks.enabled.mockReturnValue(false);
  mocks.mainFrom.mockImplementation(() => { throw Error('Visitor authentication is unavailable'); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function readResult(result: any) {
  const query = { select: () => query, abortSignal: vi.fn().mockResolvedValue(result) };
  mocks.publicFrom.mockReturnValue(query);
  return query;
}

describe('Public configuration during Supabase degradation', () => {
  it('waits for cold runtime routing and coalesces settings reads instead of hitting Supabase', async () => {
    let ready!: () => void;
    mocks.ensure.mockReturnValue(new Promise<void>(resolve => { ready = resolve; }));
    mocks.bundle.mockResolvedValue({ data: { site_config: { store_name: 'Collectibles' } } });
    const { fetchSettings } = await import('../hooks/useSiteSettings');
    const pending = [fetchSettings(), fetchSettings(), fetchSettings()];
    await waitFor(() => expect(mocks.ensure).toHaveBeenCalled());
    expect(mocks.publicFrom).not.toHaveBeenCalled();
    mocks.enabled.mockReturnValue(true); ready();

    expect(await Promise.all(pending)).toEqual(Array(3).fill({ store_name: 'Collectibles' }));
    expect(mocks.bundle).toHaveBeenCalledTimes(1);
    expect(mocks.publicFrom).not.toHaveBeenCalled();
    expect(mocks.mainFrom).not.toHaveBeenCalled();
  });

  it('keeps cached settings after an aborted anonymous read and can refresh after recovery', async () => {
    localStorage.setItem('site_settings_cache', JSON.stringify({ store_name: 'Last known configuration' }));
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const query = { select: () => query, abortSignal: vi.fn((signal: AbortSignal) => new Promise(resolve => {
      signal.addEventListener('abort', () => resolve({ data: null, error: { message: 'Timed out' } }), { once: true });
    })) };
    mocks.publicFrom.mockReturnValue(query);
    const { fetchSettings } = await import('../hooks/useSiteSettings');
    const pending = fetchSettings();
    await waitFor(() => expect(query.abortSignal).toHaveBeenCalled());
    controller.abort();

    expect(await pending).toEqual({ store_name: 'Last known configuration' });
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(mocks.mainFrom).not.toHaveBeenCalled();
    readResult({ data: [{ key: 'store_name', value: 'Recovered' }], error: null });
    expect(await fetchSettings(true)).toEqual({ store_name: 'Recovered' });
  });

  it('loads feature switches from D1 after runtime initialization', async () => {
    mocks.ensure.mockImplementation(async () => { mocks.enabled.mockReturnValue(true); });
    mocks.bundle.mockResolvedValue({ data: { feature_toggles: { marketplace: false } } });
    const { FeatureToggleProvider, useFeatures } = await import('../contexts/FeatureToggleContext');
    function State() { const { features, loading } = useFeatures(); return <output>{loading ? 'loading' : String(features.marketplaceEnabled)}</output>; }
    render(<FeatureToggleProvider><State /></FeatureToggleProvider>);

    await screen.findByText('false');
    expect(mocks.publicFrom).not.toHaveBeenCalled();
    expect(mocks.mainFrom).not.toHaveBeenCalled();
  });

  it('retains cached switches on failure without querying the nonexistent legacy table', async () => {
    localStorage.setItem('collectibles_feature_toggles_cache', JSON.stringify({ marketplaceEnabled: false }));
    readResult({ data: null, error: { message: 'Unavailable' } });
    const { FeatureToggleProvider, useFeatures } = await import('../contexts/FeatureToggleContext');
    function State() { const { features, loading } = useFeatures(); return <output>{loading ? 'loading' : String(features.marketplaceEnabled)}</output>; }
    render(<FeatureToggleProvider><State /></FeatureToggleProvider>);

    await screen.findByText('false');
    expect(mocks.publicFrom).toHaveBeenCalledTimes(1);
    expect(mocks.publicFrom).toHaveBeenCalledWith('feature_toggles');
    expect(mocks.mainFrom).not.toHaveBeenCalled();
  });

  it('continues to use the authenticated client for administrative updates', async () => {
    mocks.enabled.mockReturnValue(true);
    mocks.bundle.mockResolvedValue({ data: { feature_toggles: { marketplace: true } } });
    const eq = vi.fn().mockResolvedValue({ error: null });
    mocks.mainFrom.mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) });
    const { FeatureToggleProvider, useFeatures } = await import('../contexts/FeatureToggleContext');
    let update!: (id: string, enabled: boolean) => Promise<boolean>;
    function State() { const state = useFeatures(); update = state.updateFeatureToggle; return <output>{state.loading ? 'loading' : 'ready'}</output>; }
    render(<FeatureToggleProvider><State /></FeatureToggleProvider>);
    await screen.findByText('ready');
    await act(async () => { expect(await update('marketplace', false)).toBe(true); });

    expect(mocks.mainFrom).toHaveBeenCalledWith('feature_toggles');
    expect(eq).toHaveBeenCalledWith('id', 'marketplace');
    expect(mocks.publicFrom).not.toHaveBeenCalled();
  });
});
