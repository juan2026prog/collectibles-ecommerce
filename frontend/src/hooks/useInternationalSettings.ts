import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface InternationalSettings {
  id: number;
  international_public_enabled: boolean;
  international_purchases_enabled: boolean;
  international_capacity_enabled: boolean;
  target_margin_percent: number;
  min_absolute_profit_usd: number;
  min_profit_usd: number;
  zinc_fee_usd: number;
  sales_tax_percent?: number;
  international_operating_limit_usd?: number;
  international_safety_reserve_usd?: number;
  never_sell_at_loss: boolean;
  auto_purchase_enabled?: boolean;
  only_prime?: boolean;
  urubox_price_per_kg?: number;
  urubox_handling_fee?: number;
}

let _cachedSettings: InternationalSettings | null = null;
let _pendingPromise: Promise<InternationalSettings | null> | null = null;
const _listeners = new Set<(s: InternationalSettings | null) => void>();
let _realtimeSubscribed = false;

function setupRealtimeSubscription() {
  if (_realtimeSubscribed) return;
  _realtimeSubscribed = true;

  try {
    supabase
      .channel('public:international_sync_settings_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'international_sync_settings', filter: 'id=eq.1' },
        (payload: any) => {
          if (payload.new) {
            const data = payload.new;
            _cachedSettings = {
              ...data,
              international_public_enabled: !!data.international_public_enabled,
              international_purchases_enabled: data.international_purchases_enabled ?? true,
              international_capacity_enabled: data.international_capacity_enabled ?? true,
              target_margin_percent: Number(data.target_margin_percent || 15),
              min_absolute_profit_usd: Number(data.min_absolute_profit_usd || 2),
              min_profit_usd: Number(data.min_profit_usd || 3.99),
              zinc_fee_usd: Number(data.zinc_fee_usd || 1),
              never_sell_at_loss: data.never_sell_at_loss ?? true
            };
            _listeners.forEach(fn => fn(_cachedSettings));
          }
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('Realtime subscription not available for international settings:', err);
  }
}

export async function fetchInternationalSettings(forceRefresh = false): Promise<InternationalSettings | null> {
  if (_cachedSettings && !forceRefresh) return _cachedSettings;
  if (_pendingPromise && !forceRefresh) return _pendingPromise;

  _pendingPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('international_sync_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        console.warn('Could not fetch international settings:', error.message);
        return _cachedSettings;
      }

      if (data) {
        _cachedSettings = {
          ...data,
          international_public_enabled: !!data.international_public_enabled,
          international_purchases_enabled: data.international_purchases_enabled ?? true,
          international_capacity_enabled: data.international_capacity_enabled ?? true,
          target_margin_percent: Number(data.target_margin_percent || 15),
          min_absolute_profit_usd: Number(data.min_absolute_profit_usd || 2),
          min_profit_usd: Number(data.min_profit_usd || 3.99),
          zinc_fee_usd: Number(data.zinc_fee_usd || 1),
          never_sell_at_loss: data.never_sell_at_loss ?? true
        };
        _listeners.forEach(fn => fn(_cachedSettings));
      }
      return _cachedSettings;
    } catch (e) {
      console.warn('Error fetching international settings:', e);
      return _cachedSettings;
    } finally {
      _pendingPromise = null;
    }
  })();

  return _pendingPromise;
}

export function useInternationalSettings() {
  const [settings, setSettings] = useState<InternationalSettings | null>(_cachedSettings);
  const [loaded, setLoaded] = useState(!!_cachedSettings);

  useEffect(() => {
    setupRealtimeSubscription();

    const listener = (s: InternationalSettings | null) => {
      setSettings(s);
      setLoaded(true);
    };
    _listeners.add(listener);

    if (!_cachedSettings) {
      fetchInternationalSettings().then(s => {
        setSettings(s);
        setLoaded(true);
      });
    } else {
      setSettings(_cachedSettings);
      setLoaded(true);
    }

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  const publicEnabled = !!settings?.international_public_enabled;
  const purchasesEnabled = settings ? (settings.international_purchases_enabled ?? true) : true;
  const capacityEnabled = settings ? (settings.international_capacity_enabled ?? true) : true;

  return {
    settings,
    loaded,
    publicEnabled,
    purchasesEnabled,
    capacityEnabled,
    refetch: () => fetchInternationalSettings(true)
  };
}
