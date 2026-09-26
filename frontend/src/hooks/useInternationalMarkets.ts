// frontend/src/hooks/useInternationalMarkets.ts

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { MarketRecord, MarketResolution, MarketStatus } from '../lib/marketEngine/marketTypes';
import { INITIAL_DEFAULT_MARKETS, resolveMarket } from '../lib/marketEngine/marketEngine';

export function useInternationalMarkets() {
  const [markets, setMarkets] = useState<MarketRecord[]>(INITIAL_DEFAULT_MARKETS);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchErr } = await supabase
        .from('international_markets')
        .select('*')
        .order('sort_order', { ascending: true });

      if (fetchErr) {
        console.warn('[useInternationalMarkets] Falling back to default markets:', fetchErr.message);
        setMarkets(INITIAL_DEFAULT_MARKETS);
      } else if (data && data.length > 0) {
        setMarkets(data as MarketRecord[]);
      } else {
        setMarkets(INITIAL_DEFAULT_MARKETS);
      }
    } catch (err: any) {
      console.error('[useInternationalMarkets] Error fetching markets:', err.message);
      setError(err.message);
      setMarkets(INITIAL_DEFAULT_MARKETS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  const updateMarketStatus = async (countryCode: string, newStatus: MarketStatus) => {
    try {
      const { error: updateErr } = await supabase
        .from('international_markets')
        .update({
          market_status: newStatus,
          public_enabled: newStatus === 'LIVE',
          checkout_enabled: newStatus === 'LIVE',
          updated_at: new Date().toISOString()
        })
        .eq('country_code', countryCode.toUpperCase());

      if (updateErr) throw updateErr;
      await fetchMarkets();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  };

  const updateMarketConfig = async (countryCode: string, updates: Partial<MarketRecord>) => {
    try {
      const { error: updateErr } = await supabase
        .from('international_markets')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('country_code', countryCode.toUpperCase());

      if (updateErr) throw updateErr;
      await fetchMarkets();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  };

  const getMarket = useCallback((countryCode: string): MarketResolution => {
    return resolveMarket(countryCode, markets);
  }, [markets]);

  return {
    markets,
    loading,
    error,
    refreshMarkets: fetchMarkets,
    updateMarketStatus,
    updateMarketConfig,
    getMarket
  };
}
