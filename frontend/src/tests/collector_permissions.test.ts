import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCollectorPermissions } from '../hooks/useCollectorPermissions';
import * as AuthContext from '../contexts/AuthContext';
import * as FeatureToggleContext from '../contexts/FeatureToggleContext';
import * as useSiteSettingsModule from '../hooks/useSiteSettings';

describe('useCollectorPermissions Hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows access to all enabled modules when collector_plugins_admin_only is false (public mode)', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      session: null,
      signUp: vi.fn(),
      signIn: vi.fn(),
      signInWithGoogle: vi.fn(),
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    });

    vi.spyOn(FeatureToggleContext, 'useFeatures').mockReturnValue({
      features: {
        marketplaceEnabled: true,
        affiliatesEnabled: true,
        artistCameoEnabled: false,
        mercadoLibreSyncEnabled: true,
        aiSearchEnabled: true,
        radarEnabled: true,
        releaseCalendarEnabled: true,
        collectorVaultEnabled: true,
        collectorVaultUserPhotosEnabled: false,
        collectorVaultCatalogSearchEnabled: true,
        collectorCompareEnabled: true,
        collectorAcademyEnabled: true,
        customsFranchiseEnabled: true,
        importHubEnabled: true,
      },
      loading: false,
      updateFeatureToggle: vi.fn(),
      refreshFeatures: vi.fn(),
    });

    vi.spyOn(useSiteSettingsModule, 'useSiteSettings').mockReturnValue({
      settings: { collector_plugins_admin_only: 'false' },
      loaded: true,
    });

    const { result } = renderHook(() => useCollectorPermissions());

    expect(result.current.isPluginsAdminOnly).toBe(false);
    expect(result.current.canAccessCollectorPlugins).toBe(true);
    expect(result.current.isModuleVisible('ai_search')).toBe(true);
    expect(result.current.isModuleVisible('radar')).toBe(true);
    expect(result.current.isModuleVisible('vault')).toBe(true);
    expect(result.current.isModuleVisible('compare')).toBe(true);
    expect(result.current.isModuleVisible('academy')).toBe(true);
    expect(result.current.isModuleVisible('import_hub')).toBe(true);
  });

  it('hides all collector modules from regular users/visitors when collector_plugins_admin_only is true', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 'usr-1', email: 'user@collectibles.uy' } as any,
      profile: { id: 'usr-1', email: 'user@collectibles.uy', is_admin: false } as any,
      loading: false,
      session: null,
      signUp: vi.fn(),
      signIn: vi.fn(),
      signInWithGoogle: vi.fn(),
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    });

    vi.spyOn(FeatureToggleContext, 'useFeatures').mockReturnValue({
      features: {
        marketplaceEnabled: true,
        affiliatesEnabled: true,
        artistCameoEnabled: false,
        mercadoLibreSyncEnabled: true,
        aiSearchEnabled: true,
        radarEnabled: true,
        releaseCalendarEnabled: true,
        collectorVaultEnabled: true,
        collectorVaultUserPhotosEnabled: false,
        collectorVaultCatalogSearchEnabled: true,
        collectorCompareEnabled: true,
        collectorAcademyEnabled: true,
        customsFranchiseEnabled: true,
        importHubEnabled: true,
      },
      loading: false,
      updateFeatureToggle: vi.fn(),
      refreshFeatures: vi.fn(),
    });

    vi.spyOn(useSiteSettingsModule, 'useSiteSettings').mockReturnValue({
      settings: { collector_plugins_admin_only: 'true' },
      loaded: true,
    });

    const { result } = renderHook(() => useCollectorPermissions());

    expect(result.current.isPluginsAdminOnly).toBe(true);
    expect(result.current.canAccessCollectorPlugins).toBe(false);
    expect(result.current.isModuleVisible('ai_search')).toBe(false);
    expect(result.current.isModuleVisible('radar')).toBe(false);
    expect(result.current.isModuleVisible('vault')).toBe(false);
    expect(result.current.isModuleVisible('compare')).toBe(false);
    expect(result.current.isModuleVisible('academy')).toBe(false);
    expect(result.current.isModuleVisible('import_hub')).toBe(false);
  });

  it('shows all enabled collector modules for authenticated administrators in admin-only beta mode', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 'admin-1', email: 'admin@collectibles.uy' } as any,
      profile: { id: 'admin-1', email: 'admin@collectibles.uy', is_admin: true } as any,
      loading: false,
      session: null,
      signUp: vi.fn(),
      signIn: vi.fn(),
      signInWithGoogle: vi.fn(),
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    });

    vi.spyOn(FeatureToggleContext, 'useFeatures').mockReturnValue({
      features: {
        marketplaceEnabled: true,
        affiliatesEnabled: true,
        artistCameoEnabled: false,
        mercadoLibreSyncEnabled: true,
        aiSearchEnabled: true,
        radarEnabled: true,
        releaseCalendarEnabled: true,
        collectorVaultEnabled: true,
        collectorVaultUserPhotosEnabled: false,
        collectorVaultCatalogSearchEnabled: true,
        collectorCompareEnabled: true,
        collectorAcademyEnabled: true,
        customsFranchiseEnabled: true,
        importHubEnabled: true,
      },
      loading: false,
      updateFeatureToggle: vi.fn(),
      refreshFeatures: vi.fn(),
    });

    vi.spyOn(useSiteSettingsModule, 'useSiteSettings').mockReturnValue({
      settings: { collector_plugins_admin_only: 'true' },
      loaded: true,
    });

    const { result } = renderHook(() => useCollectorPermissions());

    expect(result.current.isPluginsAdminOnly).toBe(true);
    expect(result.current.canAccessCollectorPlugins).toBe(true);
    expect(result.current.isModuleVisible('ai_search')).toBe(true);
    expect(result.current.isModuleVisible('radar')).toBe(true);
    expect(result.current.isModuleVisible('vault')).toBe(true);
    expect(result.current.isModuleVisible('compare')).toBe(true);
    expect(result.current.isModuleVisible('academy')).toBe(true);
    expect(result.current.isModuleVisible('import_hub')).toBe(true);
  });
});
