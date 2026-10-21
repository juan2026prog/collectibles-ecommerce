/**
 * PublicCatalogProvider — Capa de Lectura Pública (Cloudflare Worker + D1 + Caché Local)
 *
 * Reglas arquitectónicas:
 * 1. Lee desde Cloudflare Worker (`collectibles-catalog-api`) cuando el dominio está activo
 *    (por configuración en runtime o por default de build).
 * 2. Soporta ACTIVACIÓN Y ROLLBACK REAL EN RUNTIME (< 1 segundo) sin requerir rebuild de Vite:
 *    - Si el Worker responde HTTP 503 o header `X-Catalog-Kill-Switch: active` (controlado vía
 *      `POST /api/v1/internal/runtime-mode` o secret `CATALOG_RUNTIME_ENABLED=false`), este
 *      proveedor desactiva inmediatamente (`runtimeKillSwitchActive = true`) el enrutamiento a D1
 *      en memoria y `sessionStorage`, ignorando cualquier constante `VITE_*` compilada en el bundle.
 *    - También permite activar/desactivar dominios en caliente vía `syncRuntimeConfig()` o
 *      `setRuntimeCatalogOverride()`.
 * 3. Almacena snapshots ligeros en memoria + localStorage para resiliencia ante fallos transitorios.
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
  runtimeKillSwitchActive: boolean;
  runtimeOverrideGlobal: boolean | null;
  domains: Record<CatalogDomainFlag, boolean>;
  timeoutMs: number;
}

export class CatalogKillSwitchError extends Error {
  public readonly killSwitchActive = true;
  constructor(message = 'Cloudflare D1 runtime kill-switch is active') {
    super(message);
    this.name = 'CatalogKillSwitchError';
  }
}

const DEFAULT_WORKER_URL = 'https://collectibles-catalog-api.pixelsncodes-uy.workers.dev';
const SNAPSHOT_PREFIX = 'collectibles_d1_snap_v1:';
const RUNTIME_CTRL_STORAGE_KEY = 'collectibles_d1_runtime_ctrl_v1';
const RUNTIME_KILL_SWITCH_TTL_MS = 5 * 60 * 1000; // 5 min cooldown before re-probing

const memoryCache = new Map<string, { data: any; expiresAt: number; staleUntil: number }>();

let consecutiveWorkerFailures = 0;
let circuitOpenUntil = 0;
const MAX_FAILURES_BEFORE_CIRCUIT = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

interface RuntimeControlState {
  killSwitchActive: boolean;
  killSwitchExpiresAt: number;
  killSwitchReason?: string;
  overrideGlobal: boolean | null;
  domainOverrides: Partial<Record<CatalogDomainFlag, boolean>>;
  updatedAt: number;
}

let runtimeState: RuntimeControlState = loadRuntimeControlState();

function loadRuntimeControlState(): RuntimeControlState {
  const initial: RuntimeControlState = {
    killSwitchActive: false,
    killSwitchExpiresAt: 0,
    overrideGlobal: null,
    domainOverrides: {},
    updatedAt: 0,
  };
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(RUNTIME_CTRL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const now = Date.now();
          const killActive = Boolean(parsed.killSwitchActive) && Number(parsed.killSwitchExpiresAt || 0) > now;
          return {
            killSwitchActive: killActive,
            killSwitchExpiresAt: killActive ? Number(parsed.killSwitchExpiresAt) : 0,
            killSwitchReason: parsed.killSwitchReason,
            overrideGlobal: typeof parsed.overrideGlobal === 'boolean' ? parsed.overrideGlobal : null,
            domainOverrides: parsed.domainOverrides && typeof parsed.domainOverrides === 'object' ? parsed.domainOverrides : {},
            updatedAt: Number(parsed.updatedAt || 0),
          };
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return initial;
}

function persistRuntimeControlState(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(RUNTIME_CTRL_STORAGE_KEY, JSON.stringify(runtimeState));
    }
  } catch {
    // ignore storage errors
  }
}

export function setRuntimeKillSwitch(active: boolean, reason = 'manual-runtime-rollback', ttlMs = RUNTIME_KILL_SWITCH_TTL_MS): void {
  runtimeState = {
    ...runtimeState,
    killSwitchActive: active,
    killSwitchExpiresAt: active ? Date.now() + ttlMs : 0,
    killSwitchReason: active ? reason : undefined,
    updatedAt: Date.now(),
  };
  persistRuntimeControlState();
}

export function isRuntimeKillSwitchActive(): boolean {
  if (!runtimeState.killSwitchActive) return false;
  if (runtimeState.killSwitchExpiresAt > 0 && Date.now() > runtimeState.killSwitchExpiresAt) {
    runtimeState.killSwitchActive = false;
    runtimeState.killSwitchExpiresAt = 0;
    persistRuntimeControlState();
    return false;
  }
  return true;
}

export function setRuntimeCatalogOverride(
  enabledGlobal: boolean | null,
  domainOverrides: Partial<Record<CatalogDomainFlag, boolean>> = {}
): void {
  runtimeState = {
    ...runtimeState,
    killSwitchActive: enabledGlobal === false ? true : false,
    killSwitchExpiresAt: enabledGlobal === false ? Date.now() + RUNTIME_KILL_SWITCH_TTL_MS : 0,
    overrideGlobal: enabledGlobal,
    domainOverrides: { ...domainOverrides },
    updatedAt: Date.now(),
  };
  persistRuntimeControlState();
}

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
  const buildEnabledGlobal = parseBoolFlag(getEnvVar('VITE_USE_CF_PUBLIC_CATALOG'), false);
  const killActive = isRuntimeKillSwitchActive();

  const effectiveGlobal = killActive
    ? false
    : runtimeState.overrideGlobal !== null
      ? runtimeState.overrideGlobal
      : buildEnabledGlobal;

  const resolveDomain = (domain: CatalogDomainFlag, envKey: string): boolean => {
    if (killActive) return false;
    if (domain in runtimeState.domainOverrides && typeof runtimeState.domainOverrides[domain] === 'boolean') {
      return Boolean(runtimeState.domainOverrides[domain]);
    }
    if (runtimeState.overrideGlobal === false) {
      return false;
    }
    const defaultVal = (domain === 'search' || domain === 'radar' || domain === 'promotions' || domain === 'settings')
      ? false
      : effectiveGlobal;
    return parseBoolFlag(getEnvVar(envKey), defaultVal);
  };

  return {
    workerBaseUrl,
    enabledGlobal: effectiveGlobal,
    runtimeKillSwitchActive: killActive,
    runtimeOverrideGlobal: runtimeState.overrideGlobal,
    domains: {
      products: resolveDomain('products', 'VITE_CF_CATALOG_PRODUCTS'),
      productDetail: resolveDomain('productDetail', 'VITE_CF_CATALOG_PRODUCT_DETAIL'),
      taxonomies: resolveDomain('taxonomies', 'VITE_CF_CATALOG_TAXONOMIES'),
      search: resolveDomain('search', 'VITE_CF_CATALOG_SEARCH'),
      promotions: resolveDomain('promotions', 'VITE_CF_CATALOG_PROMOTIONS'),
      radar: resolveDomain('radar', 'VITE_CF_CATALOG_RADAR'),
      settings: resolveDomain('settings', 'VITE_CF_CATALOG_SETTINGS'),
    },
    timeoutMs: Number(getEnvVar('VITE_CF_CATALOG_TIMEOUT_MS') || 4500),
  };
}

export function isCatalogDomainEnabled(domain: CatalogDomainFlag): boolean {
  if (isRuntimeKillSwitchActive()) return false;
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
  runtimeState = {
    killSwitchActive: false,
    killSwitchExpiresAt: 0,
    overrideGlobal: null,
    domainOverrides: {},
    updatedAt: 0,
  };
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(RUNTIME_CTRL_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Consulta `/api/v1/runtime-config` en el Worker para sincronizar el estado de activación/rollback
 * en caliente sin necesidad de recompilar variables `VITE_*`.
 */
export async function syncRuntimeConfig(fetcher: typeof fetch = fetch): Promise<{
  enabled: boolean;
  mode: string;
  domains: Partial<Record<CatalogDomainFlag, boolean>>;
}> {
  const cfg = getPublicCatalogConfig();
  try {
    const res = await fetcher(`${cfg.workerBaseUrl}/api/v1/runtime-config`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Catalog-Client': 'collectibles-web-v1' },
    });

    const killHeader = res.headers?.get?.('X-Catalog-Kill-Switch');
    const json = await res.json().catch(() => ({} as any));

    if (killHeader === 'active' || json?.enabled === false || res.status === 503) {
      setRuntimeKillSwitch(true, json?.reason || 'worker-runtime-config-disabled');
      return { enabled: false, mode: 'disabled', domains: {} };
    }

    if (typeof json?.enabled === 'boolean') {
      const liveDomains: Partial<Record<CatalogDomainFlag, boolean>> = {
        products: Boolean(json.domains?.products),
        productDetail: Boolean(json.domains?.productDetail),
        taxonomies: Boolean(json.domains?.taxonomies),
        search: Boolean(json.domains?.search),
        radar: Boolean(json.domains?.radar),
        promotions: Boolean(json.domains?.promotions),
        settings: Boolean(json.domains?.settings),
      };
      setRuntimeCatalogOverride(json.enabled, liveDomains);
      return {
        enabled: json.enabled,
        mode: json.mode || (json.enabled ? 'active' : 'disabled'),
        domains: liveDomains,
      };
    }
  } catch (err) {
    // Fail-safe silencioso: si el worker no responde o hay error transitorio de red, no romper la app
    console.warn('[PublicCatalogProvider] syncRuntimeConfig caught error; using current state:', err);
  }

  return { enabled: cfg.enabledGlobal, mode: cfg.enabledGlobal ? 'active' : 'disabled', domains: cfg.domains };
}

// Auto-inicialización silenciosa al cargar el script en el navegador
if (typeof window !== 'undefined') {
  syncRuntimeConfig().catch(() => {});
}

export async function fetchFromCloudflareCatalog<T>(
  endpointPath: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: { ttlMs?: number; staleMs?: number; fetcher?: typeof fetch }
): Promise<{ data: T; fromCache: boolean; staleFallback: boolean }> {
  if (isRuntimeKillSwitchActive()) {
    throw new CatalogKillSwitchError();
  }

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

    // Detección instantánea de Kill-Switch en runtime (< 1s):
    // Si el Worker devuelve X-Catalog-Kill-Switch: active o HTTP 503 con kill_switch_active,
    // apagamos inmediatamente el enrutamiento en memoria/sessionStorage y lanzamos CatalogKillSwitchError
    const killSwitchHeader = res.headers?.get?.('X-Catalog-Kill-Switch');
    const catalogModeHeader = res.headers?.get?.('X-Catalog-Mode');
    if (killSwitchHeader === 'active' || catalogModeHeader === 'disabled') {
      setRuntimeKillSwitch(true, 'worker-kill-switch-header');
      throw new CatalogKillSwitchError('Cloudflare D1 deactivated at runtime via X-Catalog-Kill-Switch');
    }

    if (res.status === 503) {
      const errBody = await res.json().catch(() => ({} as any));
      if (errBody?.kill_switch_active || errBody?.mode === 'disabled') {
        setRuntimeKillSwitch(true, errBody?.reason || 'worker-503-disabled');
        throw new CatalogKillSwitchError('Cloudflare D1 deactivated at runtime via 503 response');
      }
    }

    if (!res.ok) {
      throw new Error(`Cloudflare Catalog API responded with HTTP ${res.status}`);
    }

    const json = (await res.json()) as T;
    consecutiveWorkerFailures = 0;
    circuitOpenUntil = 0;
    writePersistentSnapshot(cacheKey, json, ttlMs, staleMs);

    return { data: json, fromCache: false, staleFallback: false };
  } catch (error) {
    // Si es un rollback deliberado por kill-switch en runtime, no servir caché vieja de D1:
    // propagar inmediatamente para que el caller use el canal de fallback controlado.
    if (error instanceof CatalogKillSwitchError) {
      throw error;
    }

    consecutiveWorkerFailures += 1;
    if (consecutiveWorkerFailures >= MAX_FAILURES_BEFORE_CIRCUIT) {
      circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    }

    // Servir snapshot previo si existe ante errores de red/timeout transitorios (jamás hacer estampida directa a Supabase)
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
  isRuntimeKillSwitchActive,
  setRuntimeKillSwitch,
  setRuntimeCatalogOverride,
  syncRuntimeConfig,

  async getProducts(
    filters: Record<string, string | number | boolean | undefined | null> = {},
    fetcher?: typeof fetch
  ) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      count: number;
      totalCount: number;
      products: any[];
      image_variants?: any[];
      pagination: { total: number; page: number; limit: number; total_pages: number; has_more: boolean };
    }>('/api/v1/products', filters, { ttlMs: 45_000, fetcher });
  },

  async getPublicCatalogCompatible(
    filters: Record<string, string | number | boolean | undefined | null> = {},
    fetcher?: typeof fetch
  ) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      products: any[];
      image_variants: any[];
      count: number;
      facets: any;
      taxonomies?: any;
      snapshot_meta: any;
    }>('/api/public-catalog', filters, { ttlMs: 45_000, fetcher });
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
      facets: {
        categoryFacets: Record<string, number>;
        brandFacets: any[];
        licenseFacets: any[];
        themeFacets: any[];
        availabilityCounts: { all: number; local: number; international: number };
        conditionCounts: { all: number; new: number; used: number; loose: number };
        totalCatalogProducts: number;
      };
      taxonomies: {
        categories: any[];
        brands: any[];
        licenses: any[];
        themes: any[];
      };
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

  async getBanners(fetcher?: typeof fetch) {
    return fetchFromCloudflareCatalog<{
      ok: boolean;
      banners: any[];
    }>('/api/v1/banners', undefined, { ttlMs: 180_000, fetcher });
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
