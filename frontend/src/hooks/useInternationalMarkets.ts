// frontend/src/hooks/useInternationalMarkets.ts

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { MarketRecord, MarketResolution, MarketStatus } from '../lib/marketEngine/marketTypes';
import { INITIAL_DEFAULT_MARKETS, resolveMarket } from '../lib/marketEngine/marketEngine';

export interface AuditLogEntry {
  id: string;
  actor_id?: string;
  actor_email?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  country_code?: string;
  before_state?: any;
  after_state?: any;
  reason?: string;
  created_at: string;
}

export function useInternationalMarkets() {
  const [markets, setMarkets] = useState<MarketRecord[]>(INITIAL_DEFAULT_MARKETS);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

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

  const fetchAuditLogs = useCallback(async () => {
    try {
      setLoadingLogs(true);
      const { data, error: logsErr } = await supabase
        .from('skypostal_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (logsErr) {
        console.warn('[useInternationalMarkets] skypostal_audit_logs query fallback:', logsErr.message);
      } else if (data) {
        setAuditLogs(data as AuditLogEntry[]);
      }
    } catch (err: any) {
      console.warn('[useInternationalMarkets] Could not load audit logs from DB:', err.message);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const logAuditAction = async (entry: Omit<AuditLogEntry, 'id' | 'created_at'>) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      
      const payload = {
        actor_id: user?.id || 'admin-local',
        actor_email: user?.email || 'admin@collectibles.uy',
        action: entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        country_code: entry.country_code || null,
        before_state: entry.before_state || null,
        after_state: entry.after_state || null,
        reason: entry.reason || null
      };

      const { data, error: insertErr } = await supabase
        .from('skypostal_audit_logs')
        .insert(payload)
        .select()
        .single();

      if (!insertErr && data) {
        setAuditLogs(prev => [data as AuditLogEntry, ...prev]);
      }
    } catch (err: any) {
      console.warn('[useInternationalMarkets] Failed to write audit log to DB:', err.message);
    }
  };

  useEffect(() => {
    fetchMarkets();
    fetchAuditLogs();
  }, [fetchMarkets, fetchAuditLogs]);

  const updateMarketStatus = async (countryCode: string, newStatus: MarketStatus, reason?: string) => {
    try {
      const code = countryCode.toUpperCase();
      const beforeMarket = markets.find(m => m.country_code === code);

      const { error: updateErr } = await supabase
        .from('international_markets')
        .update({
          market_status: newStatus,
          public_enabled: newStatus === 'LIVE',
          checkout_enabled: newStatus === 'LIVE',
          updated_at: new Date().toISOString()
        })
        .eq('country_code', code);

      if (updateErr) throw updateErr;

      await logAuditAction({
        action: 'MARKET_STATUS_CHANGED',
        entity_type: 'MARKET',
        entity_id: code,
        country_code: code,
        before_state: { status: beforeMarket?.market_status },
        after_state: { status: newStatus },
        reason: reason || `Market ${code} status changed to ${newStatus}`
      });

      await fetchMarkets();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  };

  const updateMarketConfig = async (countryCode: string, updates: Partial<MarketRecord>, reason?: string) => {
    try {
      const code = countryCode.toUpperCase();
      const beforeMarket = markets.find(m => m.country_code === code);

      const { error: updateErr } = await supabase
        .from('international_markets')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('country_code', code);

      if (updateErr) throw updateErr;

      await logAuditAction({
        action: 'MARKET_CONFIG_UPDATED',
        entity_type: 'MARKET',
        entity_id: code,
        country_code: code,
        before_state: beforeMarket?.metadata || null,
        after_state: updates.metadata || updates,
        reason: reason || `Updated configuration for ${code}`
      });

      await fetchMarkets();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  };

  const updateGlobalMarkup = async (newMarkupPercent: number) => {
    try {
      // Persist global markup in metadata of lead market or all skypostal markets
      const skypostalMarkets = markets.filter(m => m.logistics_mode === 'SKYPOSTAL');
      
      for (const m of skypostalMarkets) {
        const updatedMeta = { ...m.metadata, custom_markup_percent: newMarkupPercent };
        await supabase
          .from('international_markets')
          .update({ metadata: updatedMeta, updated_at: new Date().toISOString() })
          .eq('country_code', m.country_code);
      }

      await logAuditAction({
        action: 'MARKUP_CONFIGURED',
        entity_type: 'PRICING',
        entity_id: 'GLOBAL',
        country_code: 'ALL',
        after_state: { markup_percent: newMarkupPercent },
        reason: `Commercial markup updated to ${newMarkupPercent}% across SkyPostal markets.`
      });

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
    auditLogs,
    loadingLogs,
    refreshMarkets: fetchMarkets,
    refreshAuditLogs: fetchAuditLogs,
    updateMarketStatus,
    updateMarketConfig,
    updateGlobalMarkup,
    logAuditAction,
    getMarket
  };
}
