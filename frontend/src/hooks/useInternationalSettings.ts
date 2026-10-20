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


import { PublicCatalogProvider } from '../lib/providers/PublicCatalogProvider';

const ADMIN_CACHE_TTL = 60000;
const PUBLIC_CACHE_TTL = 15 * 60 * 1000; // 15 minutos en navegación pública para evitar martillar Supabase
const caches = new Map<string, { data: InternationalSettings; expires: number }>();
const pending = new Map<string, Promise<InternationalSettings | null>>();
const listeners = new Set<(scope: string, data: InternationalSettings | null) => void>();
let authRevision = 0;

function formatSettings(data: any, publicOnly: boolean): InternationalSettings {
  return {
    ...(publicOnly ? {} : data), id: 1,
    international_public_enabled: data.international_public_enabled === true || data.international_enabled === true,
    international_purchases_enabled: data.international_purchases_enabled ?? true,
    international_capacity_enabled: publicOnly ? true : (data.international_capacity_enabled ?? true),
    target_margin_percent: publicOnly ? 15 : Number(data.target_margin_percent ?? 15),
    min_absolute_profit_usd: publicOnly ? 3.99 : Number(data.min_absolute_profit_usd ?? 3.99),
    min_profit_usd: publicOnly ? 3.99 : Number(data.min_profit_usd ?? 3.99),
    zinc_fee_usd: publicOnly ? 1 : Number(data.zinc_fee_usd ?? 1),
    never_sell_at_loss: publicOnly ? true : (data.never_sell_at_loss ?? true)
  };
}

const SESSION_CACHE_KEY = 'collectibles_intl_public_settings_v1';

function isAutomatedCrawlerAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /(meta-externalagent|facebookexternalhit|facebot|Googlebot|AdsBot-Google|Mediapartners-Google|bingbot|Applebot|Linespider|ByteSpider|PetalBot|SemrushBot|AhrefsBot|MJ12bot|YandexBot|DuckDuckBot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Discordbot|HeadlessChrome|PhantomJS|Prerender)/i.test(ua);
}

export async function fetchInternationalSettings(forceRefresh = false, isAdminContext = false): Promise<InternationalSettings | null> {
  if (!isAdminContext && isAutomatedCrawlerAgent()) {
    const safeBotDefault = formatSettings({ international_public_enabled: false, international_purchases_enabled: false }, true);
    caches.set('public', { data: safeBotDefault, expires: Date.now() + PUBLIC_CACHE_TTL });
    return safeBotDefault;
  }
  const sessionRes = isAdminContext ? await supabase.auth?.getSession?.().catch(() => null) : null;
  const session = sessionRes?.data?.session || null;
  if (isAdminContext && !session?.user?.id) return null;
  const scope = isAdminContext ? 'admin:' + session!.user.id : 'public';
  const ttl = isAdminContext ? ADMIN_CACHE_TTL : PUBLIC_CACHE_TTL;
  const requestRevision = authRevision;
  const cached = caches.get(scope);
  if (!forceRefresh && cached && cached.expires > Date.now()) return cached.data;
  if (!forceRefresh && !isAdminContext && typeof sessionStorage !== 'undefined') {
    try {
      const rawSession = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        if (parsed?.data && parsed?.expires > Date.now()) {
          caches.set(scope, parsed);
          return parsed.data;
        }
      }
    } catch {
      // Ignore storage error
    }
  }
  if (pending.has(scope)) return pending.get(scope)!;
  const operation = (async () => {
    try {
      if (!isAdminContext && PublicCatalogProvider.isDomainEnabled('settings')) {
        const bundle = await PublicCatalogProvider.getPublicSettingsBundle();
        const statusData = bundle.data?.international_status || { international_enabled: true };
        const data = formatSettings(statusData, true);
        const entry = { data, expires: Date.now() + ttl };
        caches.set(scope, entry);
        if (typeof sessionStorage !== 'undefined') {
          try { sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(entry)); } catch {}
        }
        listeners.forEach(listener => listener(scope, data));
        return data;
      }

      const result = isAdminContext
        ? await supabase.from('international_sync_settings').select('*').eq('id', 1).abortSignal(AbortSignal.timeout(5000)).maybeSingle()
        : await supabase.rpc('get_international_public_status').abortSignal(AbortSignal.timeout(5000));
      if (result.error || !result.data) throw new Error('Settings unavailable');
      if (isAdminContext && requestRevision !== authRevision) return null;
      const data = formatSettings(result.data, !isAdminContext);
      const entry = { data, expires: Date.now() + ttl };
      caches.set(scope, entry);
      if (!isAdminContext && typeof sessionStorage !== 'undefined') {
        try { sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(entry)); } catch {}
      }
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
        try {
          const sessionRes = await supabase.auth?.getSession?.();
          scope = sessionRes?.data?.session?.user?.id ? 'admin:' + sessionRes.data.session.user.id : '';
        } catch {}
      }
      const data = await fetchInternationalSettings(force, isAdminContext);
      if (active && current === revision) { setSettings(data); setLoaded(true); }
    }
    const listener = (key: string, data: InternationalSettings | null) => {
      if (active && key === scope) setSettings(data);
    };
    listeners.add(listener);
    refresh();
    // Solo hacer polling periódico en contexto administrativo, jamás cada 60s en cada pestaña pública
    const timer = isAdminContext ? setInterval(() => refresh(), ADMIN_CACHE_TTL) : null;
    const auth = isAdminContext && supabase.auth?.onAuthStateChange ? supabase.auth.onAuthStateChange(() => {
      authRevision++; revision++; scope = ''; setSettings(null); setLoaded(false);
      for (const key of caches.keys()) if (key.startsWith('admin:')) caches.delete(key);
      for (const key of pending.keys()) if (key.startsWith('admin:')) pending.delete(key);
      setTimeout(() => { if (active) refresh(true); }, 0);
    })?.data?.subscription : null;
    const channel = enableRealtime && isAdminContext && typeof supabase.channel === 'function' ? supabase.channel('international-settings-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'international_sync_settings', filter: 'id=eq.1' }, () => refresh(true))
      .subscribe() : null;
    return () => {
      active = false; revision++; if (timer) clearInterval(timer); listeners.delete(listener); auth?.unsubscribe();
      if (channel && typeof supabase.removeChannel === 'function') supabase.removeChannel(channel);
    };
  }, [enableRealtime, isAdminContext]);
  return {
    settings, loaded, publicEnabled: settings?.international_public_enabled === true,
    purchasesEnabled: settings?.international_purchases_enabled ?? true,
    capacityEnabled: settings?.international_capacity_enabled ?? true,
    refetch: () => fetchInternationalSettings(true, isAdminContext)
  };
}
