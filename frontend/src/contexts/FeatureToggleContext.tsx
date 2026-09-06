import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface FeatureToggles {
  marketplaceEnabled: boolean;
  affiliatesEnabled: boolean;
  artistCameoEnabled: boolean;
  mercadoLibreSyncEnabled: boolean;
  aiSearchEnabled: boolean;
  radarEnabled: boolean;
  releaseCalendarEnabled: boolean;
  collectorVaultEnabled: boolean;
  collectorVaultUserPhotosEnabled: boolean;
  collectorVaultCatalogSearchEnabled: boolean;
  collectorCompareEnabled: boolean;
  collectorAcademyEnabled: boolean;
  customsFranchiseEnabled: boolean;
  importHubEnabled: boolean;
}

const defaultFeatures: FeatureToggles = {
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
};

interface FeatureToggleContextType {
  features: FeatureToggles;
  loading: boolean;
  updateFeatureToggle: (id: string, is_enabled: boolean) => Promise<boolean>;
  refreshFeatures: () => Promise<void>;
}

const FeatureToggleContext = createContext<FeatureToggleContextType>({
  features: defaultFeatures,
  loading: true,
  updateFeatureToggle: async () => false,
  refreshFeatures: async () => {},
});

const FEATURE_TOGGLES_CACHE_KEY = 'collectibles_feature_toggles_cache';

function getCachedFeatures(): FeatureToggles {
  try {
    const raw = localStorage.getItem(FEATURE_TOGGLES_CACHE_KEY);
    if (raw) {
      return { ...defaultFeatures, ...JSON.parse(raw) };
    }
  } catch {}
  return defaultFeatures;
}

function setCachedFeatures(f: FeatureToggles) {
  try {
    localStorage.setItem(FEATURE_TOGGLES_CACHE_KEY, JSON.stringify(f));
  } catch {}
}

export function FeatureToggleProvider({ children }: { children: React.ReactNode }) {
  const [features, setFeatures] = useState<FeatureToggles>(getCachedFeatures);
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async () => {
    try {
      // Try dedicated feature_toggles table first (authoritative source)
      const { data: toggleData, error: toggleError } = await supabase
        .from('feature_toggles')
        .select('id, is_enabled');

      if (!toggleError && toggleData && toggleData.length > 0) {
        // Build a map from id -> is_enabled
        const toggleMap = new Map(toggleData.map((t: any) => [t.id, t.is_enabled]));
        const loaded: FeatureToggles = {
          marketplaceEnabled: toggleMap.get('marketplace') ?? defaultFeatures.marketplaceEnabled,
          affiliatesEnabled: toggleMap.get('affiliates') ?? defaultFeatures.affiliatesEnabled,
          artistCameoEnabled: toggleMap.get('cameo') ?? defaultFeatures.artistCameoEnabled,
          mercadoLibreSyncEnabled: toggleMap.get('mercadolibre') ?? defaultFeatures.mercadoLibreSyncEnabled,
          aiSearchEnabled: toggleMap.get('ai_search') ?? defaultFeatures.aiSearchEnabled,
          radarEnabled: toggleMap.get('radar') ?? defaultFeatures.radarEnabled,
          releaseCalendarEnabled: toggleMap.get('radar') ?? defaultFeatures.releaseCalendarEnabled,
          collectorVaultEnabled: toggleMap.get('vault') ?? defaultFeatures.collectorVaultEnabled,
          collectorVaultUserPhotosEnabled: toggleMap.get('vault_user_photos') ?? defaultFeatures.collectorVaultUserPhotosEnabled,
          collectorVaultCatalogSearchEnabled: toggleMap.get('vault_catalog_search') ?? defaultFeatures.collectorVaultCatalogSearchEnabled,
          collectorCompareEnabled: toggleMap.get('compare') ?? defaultFeatures.collectorCompareEnabled,
          collectorAcademyEnabled: toggleMap.get('academy') ?? defaultFeatures.collectorAcademyEnabled,
          customsFranchiseEnabled: toggleMap.get('customs') ?? toggleMap.get('import_hub') ?? defaultFeatures.customsFranchiseEnabled,
          importHubEnabled: toggleMap.get('import_hub') ?? toggleMap.get('customs') ?? defaultFeatures.importHubEnabled,
        };
        setFeatures(loaded);
        setCachedFeatures(loaded);
      } else {
        // Fallback: try store_settings for backward compatibility
        const { data, error } = await supabase
          .from('store_settings')
          .select('*')
          .eq('id', 'default')
          .single();

        if (!error && data) {
          const loaded: FeatureToggles = {
            ...defaultFeatures,
            marketplaceEnabled: data.marketplace_enabled ?? true,
            affiliatesEnabled: data.affiliates_enabled ?? true,
            artistCameoEnabled: data.artist_cameo_enabled ?? false,
            mercadoLibreSyncEnabled: data.ml_sync_enabled ?? true,
          };
          setFeatures(loaded);
          setCachedFeatures(loaded);
        }
      }
    } catch {
      // Silent fail — cached or defaults remain active
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateFeatureToggle = useCallback(async (id: string, is_enabled: boolean): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('feature_toggles')
        .update({ is_enabled, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('Failed to update feature toggle:', error);
        return false;
      }

      // Optimistically update internal state
      setFeatures(prev => {
        const next = { ...prev };
        if (id === 'marketplace') next.marketplaceEnabled = is_enabled;
        if (id === 'affiliates') next.affiliatesEnabled = is_enabled;
        if (id === 'cameo') next.artistCameoEnabled = is_enabled;
        if (id === 'mercadolibre') next.mercadoLibreSyncEnabled = is_enabled;
        if (id === 'ai_search') next.aiSearchEnabled = is_enabled;
        if (id === 'radar') {
          next.radarEnabled = is_enabled;
          next.releaseCalendarEnabled = is_enabled;
        }
        if (id === 'vault') next.collectorVaultEnabled = is_enabled;
        if (id === 'vault_user_photos' || id === 'collector_vault_user_photos_enabled') next.collectorVaultUserPhotosEnabled = is_enabled;
        if (id === 'vault_catalog_search' || id === 'collector_vault_catalog_search_enabled') next.collectorVaultCatalogSearchEnabled = is_enabled;
        if (id === 'compare') next.collectorCompareEnabled = is_enabled;
        if (id === 'academy') next.collectorAcademyEnabled = is_enabled;
        if (id === 'customs') {
          next.customsFranchiseEnabled = is_enabled;
          next.importHubEnabled = is_enabled;
        }
        if (id === 'import_hub') {
          next.importHubEnabled = is_enabled;
          next.customsFranchiseEnabled = is_enabled;
        }
        setCachedFeatures(next);
        return next;
      });

      return true;
    } catch (err) {
      console.error('Error updating feature toggle:', err);
      return false;
    }
  }, []);

  const isFeatureEnabled = useCallback((featureKey: string): boolean => {
    switch (featureKey) {
      case 'collector_vault_user_photos_enabled':
      case 'vault_user_photos':
        return features.collectorVaultUserPhotosEnabled;
      case 'collector_vault_catalog_search_enabled':
      case 'vault_catalog_search':
        return features.collectorVaultCatalogSearchEnabled;
      case 'collector_vault_enabled':
      case 'vault':
        return features.collectorVaultEnabled;
      case 'marketplace':
        return features.marketplaceEnabled;
      case 'affiliates':
        return features.affiliatesEnabled;
      case 'cameo':
        return features.artistCameoEnabled;
      default:
        return true;
    }
  }, [features]);

  const value = useMemo(() => ({
    features,
    loading,
    updateFeatureToggle,
    isFeatureEnabled,
    refreshFeatures: loadConfig
  }), [features, loading, updateFeatureToggle, isFeatureEnabled, loadConfig]);

  return (
    <FeatureToggleContext.Provider value={value as any}>
      {children}
    </FeatureToggleContext.Provider>
  );
}

export const useFeatures = () => useContext(FeatureToggleContext);
export const useFeatureToggle = () => useContext(FeatureToggleContext) as FeatureToggleContextType & {
  isFeatureEnabled: (key: string) => boolean;
};

