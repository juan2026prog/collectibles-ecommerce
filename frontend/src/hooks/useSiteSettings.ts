import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Module-level cache so multiple components share the same settings
 * without re-fetching from Supabase on every mount.
 */
let _cache: Record<string, string> | null = null;
try {
  const local = localStorage.getItem('site_settings_cache');
  if (local) _cache = JSON.parse(local);
} catch (e) {}
let _promise: Promise<Record<string, string>> | null = null;
const _listeners = new Set<(s: Record<string, string>) => void>();

function fetchSettings(): Promise<Record<string, string>> {
  if (_promise) return _promise;
  _promise = supabase
    .from('public_site_config')
    .select('*')
    .then(({ data }) => {
      const s: Record<string, string> = {};
      data?.forEach((d: any) => (s[d.key] = d.value));
      _cache = s;
      try { localStorage.setItem('site_settings_cache', JSON.stringify(s)); } catch (e) {}
      _listeners.forEach(fn => fn(s));
      _promise = null; // Clear promise so the next call/mount fetches again
      return s;
    })
    .catch((err) => {
      _promise = null; // Clear promise on error too
      throw err;
    });
  return _promise;
}

/**
 * Shared hook that returns site_settings with a module-level cache.
 * - `settings` – the key/value map from the `site_settings` table.
 * - `loaded`   – true once the first fetch has completed.
 *
 * On first mount (any component) it fires a single Supabase query.
 * Subsequent mounts receive the cached result synchronously.
 */
export function useSiteSettings() {
  const [settings, setSettings] = useState<Record<string, string>>(_cache || {});
  const [loaded, setLoaded] = useState(!!_cache);

  useEffect(() => {
    const listener = (s: Record<string, string>) => {
      setSettings(s);
      setLoaded(true);
    };
    _listeners.add(listener);

    if (_cache) {
      setSettings(_cache);
      setLoaded(true);
    }

    fetchSettings().catch(() => {});

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  /* ── Side-effects: update <head> tags when settings arrive ── */
  useEffect(() => {
    if (!loaded) return;

    // Dynamic favicon
    const faviconUrl = settings['appearance_favicon'];
    if (faviconUrl) {
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
    if (storeName && document.title === 'Collectibles' || document.title === 'frontend') {
      document.title = storeName;
    }
  }, [loaded, settings]);

  return { settings, loaded };
}

/**
 * Updates a single setting in the cache and notifies all listeners.
 */
export function updateCachedSetting(key: string, value: string) {
  if (!_cache) _cache = {};
  _cache[key] = value;
  try {
    localStorage.setItem('site_settings_cache', JSON.stringify(_cache));
  } catch (e) {}
  _listeners.forEach(fn => fn({ ..._cache }));
}

/**
 * Updates multiple settings in the cache and notifies all listeners.
 */
export function updateCachedSettings(map: Record<string, string>) {
  if (!_cache) _cache = {};
  Object.assign(_cache, map);
  try {
    localStorage.setItem('site_settings_cache', JSON.stringify(_cache));
  } catch (e) {}
  _listeners.forEach(fn => fn({ ..._cache }));
}

/**
 * Clears the cache.
 */
export function clearCachedSettings() {
  _cache = null;
  try {
    localStorage.removeItem('site_settings_cache');
  } catch (e) {}
  _listeners.forEach(fn => fn({}));
}
