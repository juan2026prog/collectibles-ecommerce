/**
 * PublicCatalogProvider — Capa de Lectura Pública (Cloudflare Worker + D1 + Caché Local)
 *
 * Reglas arquitectónicas:
 * 1. Lee exclusivamente desde Cloudflare Worker (`collectibles-catalog-api`) cuando el flag
 *    correspondiente está activo.
 * 2. Almacena snapshots ligeros en memoria + sessionStorage/localStorage para resiliencia.
 * 3. PROHIBIDO el fallback en estampida desde el navegador hacia Supabase: si el Worker
 *    falla o está en mantenimiento, devuelve el último snapshot cacheado válido o degrada
 *    controladamente sin disparar consultas masivas a PostgreSQL.
 */

export type CatalogDomainFlag =
  | 'products'
  | 'productDetail'
  | 'taxonomies'
  | 'search'
  | 'promotions'
  | 'radar'
  | 'settings';

export interface PublicCatalogConfig {
  workerBaseUrl: string;
  enabledGlobal: boolean;
  domains: Record<CatalogDomainFlag, boolean>;
  timeoutMs: number;
}

const DEFAULT_WORKER_URL = 'https://collectibles-catalog-api.pixelsncodes-uy.workers.dev';
const SNAPSHOT_PREFIX = 'collectibles_d1_snap_v1:';
const memoryCache = new Map<string, { data: any; expiresAt: number; staleUntil: number }>();

let consecutiveWorkerFailures = 0;
let circuitOpenUntil = 0;
const MAX_FAILURES_BEFORE_CIRCUIT = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

function getEnvVar(key: string): string | undefined {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && key in (import.meta as any).env) {
      return String((import.meta as any).env[key] ?? '');
    }
  } catch {
    // ignore
  }
  if (typeof process !== 'undefined' && process.env && key in process.env) {
    return String(process.env[key] ?? '');
  }
  return undefined;
}

function parseBoolFlag(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val === '') return defaultVal;
  const norm = val.trim().toLowerCase();
  if (norm === '1' || norm === 'true' || norm === 'yes' || norm === 'on') return true;
  if (norm === '0' || norm === 'false' || norm === 'no' || norm === 'off') return false;
  return defaultVal;
}

export function getPublicCatalogConfig(): PublicCatalogConfig {
  const workerBaseUrl = (getEnvVar('VITE_CF_CATALOG_API_URL') || DEFAULT_WORKER_URL).replace(/\/+$/, '');
  const enabledGlobal = parseBoolFlag(getEnvVar('VITE_USE_CF_PUBLIC_CATALOG'), false);

  return {
    workerBaseUrl,
    enabledGlobal,
    domains: {
      products: parseBoolFlag(getEnvVar('VITE_CF_CATALOG_PRODUCTS'), enabledGlobal),
      productDetail: parseBoolFlag(getEnvVar('VITE_CF_CATALOG_PRODUCT_DETAIL'), enabledGlobal),
      taxonomies: parseBoolFlag(getEnvVar('VITE_CF_CATALOG_TAXONOMIES'), enabledGlobal),
      search: parseBoolFlag(getEnvVar('VITE_CF_CATALOG_SEARCH'), enabledGlobal),
      promotions: parseBoolFlag(getEnvVar('VITE_CF_CATALOG_PROMOTIONS'), enabledGlobal),
      radar: parseBoolFlag(getEnvVar('VITE_CF_CATALOG_RADAR'), enabledGlobal),
      settings: parseBoolFlag(getEnvVar('VITE_CF_CATALOG_SETTINGS'), enabledGlobal),
    },
    timeoutMs: Number(getEnvVar('VITE_CF_CATALOG_TIMEOUT_MS') || 4500),
  };
}

export function isCatalogDomainEnabled(domain: CatalogDomainFlag): boolean {
  const cfg = getPublicCatalogConfig();
  return Boolean(cfg.domains[domain]);
}

function readPersistentSnapshot<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(SNAPSHOT_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.staleUntil > Date.now()) {
      return parsed.data as T;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writePersistentSnapshot(key: string, data: unknown, ttlMs: number, staleMs: number): void {
  const now = Date.now();
  memoryCache.set(key, {
    data,
    expiresAt: now + ttlMs,
    staleUntil: now + staleMs,
  });

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        SNAPSHOT_PREFIX + key,
        JSON.stringify({ data, expiresAt: now + ttlMs, staleUntil: now + staleMs })
      );
    }
  } catch {
    // ignore quota errors
  }
}

export function resetPublicCatalogCircuitBreaker(): void {
  consecutiveWorkerFailures = 0;
  circuitOpenUntil = 0;
  memoryCache.clear();
}

export async function fetchFromCloudflareCatalog<T>(
  endpointPath: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: { ttlMs?: number; staleMs?: number; fetcher?: typeof fetch }
): Promise<{ data: T; fromCache: boolean; staleFallback: boolean }> {
  const cfg = getPublicCatalogConfig();
  const ttlMs = options?.ttlMs ?? 60_000;
  const staleMs = options?.staleMs ?? 3_600_000; // 1h stale snapshot protection
  const fetchImpl = options?.fetcher ?? fetch;

  const url = new URL(`${cfg.workerBaseUrl}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const cacheKey = url.pathname + url.search;
  const now = Date.now();
  const memEntry = memoryCache.get(cacheKey);

  if (memEntry && memEntry.expiresAt > now) {
    return { data: memEntry.data as T, fromCache: true, staleFallback: false };
  }

  // Si el circuit breaker está abierto, servir snapshot sin bloquear la interfaz ni golpear Supabase
  if (circuitOpenUntil > now) {
    const fallback = (memEntry && memEntry.staleUntil > now ? memEntry.data : null) ?? readPersistentSnapshot<T>(cacheKey);
    if (fallback !== null) {
      return { data: fallback as T, fromCache: true, staleFallback: true };
    }
    throw new Error('Public catalog circuit breaker is open and no local snapshot is available.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Catalog-Client': 'collectibles-web-v1',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Cloudflare Catalog API responded with HTTP ${res.status}`);
    }

    const json = (await res.json()) as T;
    consecutiveWorkerFailures = 0;
    circuitOpenUntil = 0;
    writePersistentSnapshot(cacheKey, json, ttlMs, staleMs);

    return { data: json, fromCache: false, staleFallback: false };
  } catch (error) {
    consecutiveWorkerFailures += 1;
    if (consecutiveWorkerFailures >= MAX_FAILURES_BEFORE_CIRCUIT) {
      circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    }

    // Servir snapshot previo si existe (jamás hacer estampida directa a Supabase)
    const fallback = (memEntry && memEntry.staleUntil > now ? memEntry.data : null) ?? readPersistentSnapshot<T>(cacheKey);
    if (fallback !== null) {
      return { data: fallback as T, fromCache: true, staleFallback: true };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const PublicCatalogProvider = {
  isDomainEnabled: isCatalogDomainEnabled,

  async getProducts(
    filters: Record<string, string | number | boolean | undefined | null> = {},
    fetcher?: typeof fetch
  ) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      products: any[];
      pagination: { total: number; page: number; limit: number; total_pages: number; has_more: boolean };
    }>('/api/v1/products', filters, { ttlMs: 45_000, fetcher });
  },

  async getProductBySlug(slug: string, fetcher?: typeof fetch) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      product: any;
      wave_products?: any[];
      redirected_from?: string;
      canonical_slug?: string;
    }>(`/api/v1/products/${encodeURIComponent(slug)}`, undefined, { ttlMs: 60_000, fetcher });
  },

  async getTaxonomies(brandId?: string, fetcher?: typeof fetch) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      categories: any[];
      brands: any[];
      licenses: any[];
      themes: any[];
      license_themes: any[];
      product_groups: any[];
      brand_category_ids?: string[];
    }>('/api/v1/taxonomies', brandId ? { brand_id: brandId } : undefined, { ttlMs: 300_000, fetcher });
  },

  async searchCatalog(query: string, limit = 8, fetcher?: typeof fetch) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      query: string;
      products: any[];
      stores: any[];
      brands: any[];
      categories: any[];
    }>('/api/v1/search', { q: query, limit }, { ttlMs: 30_000, fetcher });
  },

  async getPromotions(fetcher?: typeof fetch) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      promotions: any[];
    }>('/api/v1/promotions', undefined, { ttlMs: 120_000, fetcher });
  },

  async getRadarReleases(limit = 50, fetcher?: typeof fetch) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      releases: any[];
    }>('/api/v1/radar', { limit }, { ttlMs: 180_000, fetcher });
  },

  async getRadarReleaseBySlug(slug: string, fetcher?: typeof fetch) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      release: any;
    }>(`/api/v1/radar/${encodeURIComponent(slug)}`, undefined, { ttlMs: 180_000, fetcher });
  },

  async getPublicSettingsBundle(fetcher?: typeof fetch) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      site_config: Record<string, any>;
      feature_toggles: Record<string, boolean>;
      international_status: { international_enabled: boolean; pause_message: string | null };
      international_markets: any[];
      banners: any[];
      badges: any[];
    }>('/api/v1/settings', undefined, { ttlMs: 180_000, fetcher });
  },
};
