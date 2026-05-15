import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface FeatureToggles {
  marketplaceEnabled: boolean;
  affiliatesEnabled: boolean;
  artistCameoEnabled: boolean;
  mercadoLibreSyncEnabled: boolean;
}

const defaultFeatures: FeatureToggles = {
  marketplaceEnabled: true,
  affiliatesEnabled: true,
  artistCameoEnabled: false,
  mercadoLibreSyncEnabled: true,
};

const FeatureToggleContext = createContext<{
  features: FeatureToggles;
  loading: boolean;
}>({ features: defaultFeatures, loading: true });

export function FeatureToggleProvider({ children }: { children: React.ReactNode }) {
  const [features, setFeatures] = useState<FeatureToggles>(defaultFeatures);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadConfig() {
      try {
        // FUNC-HIGH-02: Try dedicated feature_toggles table first (authoritative source)
        const { data: toggleData, error: toggleError } = await supabase
          .from('feature_toggles')
          .select('id, is_enabled');

        if (!toggleError && toggleData && toggleData.length > 0) {
          // Build a map from id -> is_enabled
          const toggleMap = new Map(toggleData.map((t: any) => [t.id, t.is_enabled]));
          setFeatures({
            marketplaceEnabled: toggleMap.get('marketplace') ?? defaultFeatures.marketplaceEnabled,
            affiliatesEnabled: toggleMap.get('affiliates') ?? defaultFeatures.affiliatesEnabled,
            artistCameoEnabled: toggleMap.get('cameo') ?? defaultFeatures.artistCameoEnabled,
            mercadoLibreSyncEnabled: toggleMap.get('mercadolibre') ?? defaultFeatures.mercadoLibreSyncEnabled,
          });
        } else {
          // Fallback: try store_settings for backward compatibility
          const { data, error } = await supabase
            .from('store_settings')
            .select('*')
            .eq('id', 'default')
            .single();

          if (!error && data) {
            setFeatures({
              marketplaceEnabled: data.marketplace_enabled ?? true,
              affiliatesEnabled: data.affiliates_enabled ?? true,
              artistCameoEnabled: data.artist_cameo_enabled ?? false,
              mercadoLibreSyncEnabled: data.ml_sync_enabled ?? true,
            });
          }
          // If both fail, defaults are used (already set)
        }
      } catch {
        // Silent fail — defaults remain active
      }
      setLoading(false);
    }
    loadConfig();
  }, []);

  return (
    <FeatureToggleContext.Provider value={{ features, loading }}>
        {children}
    </FeatureToggleContext.Provider>
  );
}

export const useFeatures = () => useContext(FeatureToggleContext);
