import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const SETTINGS_CACHE_KEY = 'site_settings_cache';
const SETTINGS_TIMESTAMP_KEY = 'site_settings_timestamp';
const SETTINGS_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Module-level cache so multiple components share the same settings
 * without re-fetching from Supabase on every mount.
 */
let _cache: Record<string, string> | null = null;
let _cachedAt: number = 0;

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const local = localStorage.getItem(SETTINGS_CACHE_KEY);
    const ts = localStorage.getItem(SETTINGS_TIMESTAMP_KEY);
    if (local) {
      _cache = JSON.parse(local);
      _cachedAt = ts ? Number(ts) : 0;
    }
  }
} catch (e) {}

let _promise: Promise<Record<string, string>> | null = null;
const _listeners = new Set<(s: Record<string, string>) => void>();

// Broadcast channel for multi-tab synchronization
let _broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    _broadcastChannel = new BroadcastChannel('site_settings_sync');
    _broadcastChannel.onmessage = (event) => {
      if (event.data?.type === 'SETTINGS_UPDATED' && event.data?.payload) {
        _cache = event.data.payload;
        _cachedAt = Date.now();
        _listeners.forEach((fn) => fn(_cache || {}));
      } else if (event.data?.type === 'SETTINGS_INVALIDATE') {
        _cachedAt = 0;
        fetchSettings(true).catch(() => {});
      }
    };
  } catch (e) {}
}

function broadcastUpdate(payload: Record<string, string>) {
  try {
    _broadcastChannel?.postMessage({ type: 'SETTINGS_UPDATED', payload });
  } catch (e) {}
}

function broadcastInvalidate() {
  try {
    _broadcastChannel?.postMessage({ type: 'SETTINGS_INVALIDATE' });
  } catch (e) {}
}

export function isCacheStale(): boolean {
  if (!_cache) return true;
  return Date.now() - _cachedAt > SETTINGS_TTL_MS;
}

export function fetchSettings(force: boolean = false): Promise<Record<string, string>> {
  const isFresh = _cache && Object.keys(_cache).length > 0 && !isCacheStale();

  // Fresh cache hit
  if (!force && isFresh && _cache) {
    return Promise.resolve(_cache);
  }

  // Ongoing in-flight request
  if (_promise) return _promise;

  // Stale-While-Revalidate: If we have stale cache, trigger background fetch
  _promise = Promise.resolve(
    supabase
      .from('public_site_config')
      .select('*')
  )
    .then(({ data, error }) => {
      if (error) throw error;
      const s: Record<string, string> = {};
      data?.forEach((d: any) => {
        if (d && d.key) {
          s[d.key] = d.value;
        }
      });
      _cache = s;
      _cachedAt = Date.now();

      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(s));
          localStorage.setItem(SETTINGS_TIMESTAMP_KEY, String(_cachedAt));
        }
      } catch (e) {}

      _listeners.forEach((fn) => fn(s));
      _promise = null;
      return s;
    })
    .catch((err) => {
      console.warn('Failed to refresh site settings from Supabase, serving cached fallback:', err);
      _promise = null;
      return _cache || {};
    });

  return _promise;
}

/**
 * Shared hook that returns site_settings with a module-level cache and stale-while-revalidate TTL.
 * - `settings` – the key/value map from the `public_site_config` table.
 * - `loaded`   – true once initial settings are available.
 * - `refresh`  – forces an immediate background fetch from the backend.
 */
export function useSiteSettings() {
  const [settings, setSettings] = useState<Record<string, string>>(_cache || {});
  const [loaded, setLoaded] = useState(!!_cache && Object.keys(_cache).length > 0);

  const refresh = useCallback(() => {
    return fetchSettings(true);
  }, []);

  useEffect(() => {
    const listener = (s: Record<string, string>) => {
      setSettings(s);
      setLoaded(true);
    };
    _listeners.add(listener);

    if (_cache && Object.keys(_cache).length > 0) {
      setSettings(_cache);
      setLoaded(true);
      // If stale, trigger background revalidation
      if (isCacheStale()) {
        fetchSettings(true).catch(() => {});
      }
    } else {
      fetchSettings().catch(() => {});
    }

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  /* ── Side-effects: update <head> tags when settings arrive ── */
  useEffect(() => {
    if (!loaded) return;

    // Dynamic favicon
    const faviconUrl = settings['appearance_favicon'];
    if (faviconUrl && typeof document !== 'undefined') {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
      link.type = faviconUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/x-icon';
    }

    // Dynamic document title (only set the base; SEO component overrides per-page)
    const storeName = settings['store_name'];
    if (typeof document !== 'undefined' && storeName && (document.title === 'Collectibles' || document.title === 'frontend')) {
      document.title = storeName;
    }
  }, [loaded, settings]);

  return { settings, loaded, refresh };
}

/**
 * Updates a single setting in the cache and notifies all listeners across components & tabs.
 */
export function updateCachedSetting(key: string, value: string) {
  if (!_cache) _cache = {};
  _cache[key] = value;
  _cachedAt = Date.now();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(_cache));
      localStorage.setItem(SETTINGS_TIMESTAMP_KEY, String(_cachedAt));
    }
  } catch (e) {}
  _listeners.forEach((fn) => fn({ ..._cache }));
  broadcastUpdate(_cache);
}

/**
 * Updates multiple settings in the cache and notifies all listeners across components & tabs.
 */
export function updateCachedSettings(map: Record<string, string>) {
  if (!_cache) _cache = {};
  Object.assign(_cache, map);
  _cachedAt = Date.now();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(_cache));
      localStorage.setItem(SETTINGS_TIMESTAMP_KEY, String(_cachedAt));
    }
  } catch (e) {}
  _listeners.forEach((fn) => fn({ ..._cache }));
  broadcastUpdate(_cache);
}

/**
 * Clears and invalidates the site settings cache.
 */
export function clearCachedSettings() {
  _cache = null;
  _cachedAt = 0;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(SETTINGS_CACHE_KEY);
      localStorage.removeItem(SETTINGS_TIMESTAMP_KEY);
    }
  } catch (e) {}
  _listeners.forEach((fn) => fn({}));
  broadcastInvalidate();
}

/**
 * Explicit invalidation alias for SWR.
 */
export function invalidateSiteSettingsCache() {
  clearCachedSettings();
}
