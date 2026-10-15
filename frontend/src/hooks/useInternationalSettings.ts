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
  fixed_markup_usd?: number;
  financial_fee_percent?: number;
  financial_fee_fixed_usd?: number;
  financial_fee_tax_rate?: number;
  florida_sales_tax_percent?: number;
  sales_tax_percent?: number;
  international_operating_limit_usd?: number;
  international_safety_reserve_usd?: number;
  never_sell_at_loss: boolean;
  auto_purchase_enabled?: boolean;
  only_prime?: boolean;
  urubox_price_per_kg?: number;
  urubox_handling_fee?: number;
}


const CACHE_TTL = 60000;
const caches = new Map<string, { data: InternationalSettings; expires: number }>();
const pending = new Map<string, Promise<InternationalSettings | null>>();
const listeners = new Set<(scope: string, data: InternationalSettings | null) => void>();
let authRevision = 0;

function formatSettings(data: any, publicOnly: boolean): InternationalSettings {
  return {
    ...(publicOnly ? {} : data), id: 1,
    international_public_enabled: data.international_public_enabled === true,
    international_purchases_enabled: data.international_purchases_enabled ?? true,
    international_capacity_enabled: publicOnly ? true : (data.international_capacity_enabled ?? true),
    target_margin_percent: publicOnly ? 15 : Number(data.target_margin_percent ?? 15),
    min_absolute_profit_usd: publicOnly ? 3.99 : Number(data.min_absolute_profit_usd ?? 3.99),
    min_profit_usd: publicOnly ? 3.99 : Number(data.min_profit_usd ?? 3.99),
    zinc_fee_usd: publicOnly ? 1 : Number(data.zinc_fee_usd ?? 1),
    never_sell_at_loss: publicOnly ? true : (data.never_sell_at_loss ?? true)
  };
}

export async function fetchInternationalSettings(forceRefresh = false, isAdminContext = false): Promise<InternationalSettings | null> {
  const session = isAdminContext ? (await supabase.auth.getSession()).data.session : null;
  if (isAdminContext && !session?.user?.id) return null;
  const scope = isAdminContext ? 'admin:' + session!.user.id : 'public';
  const requestRevision = authRevision;
  const cached = caches.get(scope);
  if (!forceRefresh && cached && cached.expires > Date.now()) return cached.data;
  if (pending.has(scope)) return pending.get(scope)!;
  const operation = (async () => {
    try {
      const result = isAdminContext
        ? await supabase.from('international_sync_settings').select('*').eq('id', 1).abortSignal(AbortSignal.timeout(5000)).maybeSingle()
        : await supabase.rpc('get_international_public_status').abortSignal(AbortSignal.timeout(5000));
      if (result.error || !result.data) throw new Error('Settings unavailable');
      if (isAdminContext && requestRevision !== authRevision) return null;
      const data = formatSettings(result.data, !isAdminContext);
      caches.set(scope, { data, expires: Date.now() + CACHE_TTL });
      listeners.forEach(listener => listener(scope, data));
      return data;
    } catch {
      // An admin permission failure never falls back to a public entry with financial defaults.
      return isAdminContext ? null : cached?.data || null;
    } finally { if (pending.get(scope) === operation) pending.delete(scope); }
  })();
  pending.set(scope, operation);
  return operation;
}

export function useInternationalSettings(enableRealtime = false, isAdminContext = false) {
  const [settings, setSettings] = useState<InternationalSettings | null>(() => isAdminContext ? null : caches.get('public')?.data || null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true, revision = 0, scope = isAdminContext ? '' : 'public';
    async function refresh(force = false) {
      const current = ++revision;
      if (isAdminContext) {
        const { data } = await supabase.auth.getSession();
        scope = data.session?.user?.id ? 'admin:' + data.session.user.id : '';
      }
      const data = await fetchInternationalSettings(force, isAdminContext);
      if (active && current === revision) { setSettings(data); setLoaded(true); }
    }
    const listener = (key: string, data: InternationalSettings | null) => {
      if (active && key === scope) setSettings(data);
    };
    listeners.add(listener);
    refresh();
    const timer = setInterval(() => refresh(), CACHE_TTL);
    const auth = isAdminContext ? supabase.auth.onAuthStateChange(() => {
      authRevision++; revision++; scope = ''; setSettings(null); setLoaded(false);
      for (const key of caches.keys()) if (key.startsWith('admin:')) caches.delete(key);
      for (const key of pending.keys()) if (key.startsWith('admin:')) pending.delete(key);
      setTimeout(() => { if (active) refresh(true); }, 0);
    }).data.subscription : null;
    const channel = enableRealtime && isAdminContext ? supabase.channel('international-settings-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'international_sync_settings', filter: 'id=eq.1' }, () => refresh(true))
      .subscribe() : null;
    return () => {
      active = false; revision++; clearInterval(timer); listeners.delete(listener); auth?.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [enableRealtime, isAdminContext]);
  return {
    settings, loaded, publicEnabled: settings?.international_public_enabled === true,
    purchasesEnabled: settings?.international_purchases_enabled ?? true,
    capacityEnabled: settings?.international_capacity_enabled ?? true,
    refetch: () => fetchInternationalSettings(true, isAdminContext)
  };
}
