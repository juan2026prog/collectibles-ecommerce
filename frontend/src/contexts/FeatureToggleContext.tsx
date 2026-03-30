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
      // Intenta leer de una tabla 'store_settings' global que el admin controla
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
