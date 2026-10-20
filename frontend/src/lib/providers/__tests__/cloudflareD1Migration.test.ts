import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import workerApp, {
  mapD1RowToPublicProduct,
  sanitizePublicRecord,
  FORBIDDEN_PRIVATE_FIELDS,
  type Env,
  type D1Database,
  type D1PreparedStatement,
} from '../../../../../cloudflare/collectibles-catalog-api/src/index';
import {
  PublicCatalogProvider,
  CatalogKillSwitchError,
  fetchFromCloudflareCatalog,
  resetPublicCatalogCircuitBreaker,
  isCatalogDomainEnabled,
  isRuntimeKillSwitchActive,
  setRuntimeCatalogOverride,
  syncRuntimeConfig,
} from '../PublicCatalogProvider';
import { CommerceOperationsProvider } from '../CommerceOperationsProvider';
import { ExternalSourcingProvider } from '../ExternalSourcingProvider';
import { resolveProductPrice, resolveProductNativeCurrency } from '../../priceResolver';
import { createCheckoutOrder } from '../../payments';
import {
  transformLocalProductForD1,
  transformInternationalProductForD1,
  buildKeysetHeaderQuery,
  buildHydrateProductsByPkQuery,
  SYNC_LIMITS,
} from '../../../../../scripts/d1-sync/sync-supabase-to-d1.mjs';

/**
 * Mock en memoria de Cloudflare D1 para pruebas de integración extremo a extremo
 * (incluye soporte para `public_site_settings` con `runtime_routing_config` y `diff-check`).
 */
function createMockD1Database(seedData?: {
  products?: Record<string, any>[];
  categories?: Record<string, any>[];
  brands?: Record<string, any>[];
  promotions?: Record<string, any>[];
  radar?: Record<string, any>[];
  redirects?: Record<string, any>[];
  settings?: Record<string, any>;
  banners?: Record<string, any>[];
  badges?: Record<string, any>[];
}): D1Database & { syncedBatches: any[]; settingsStore: Map<string, string> } {
  const products = [...(seedData?.products || [])];
  const categories = [...(seedData?.categories || [])];
  const brands = [...(seedData?.brands || [])];
  const promotions = [...(seedData?.promotions || [])];
  const radar = [...(seedData?.radar || [])];
  const redirects = [...(seedData?.redirects || [])];
  const banners = [...(seedData?.banners || [])];
  const badges = [...(seedData?.badges || [])];
  const settingsStore = new Map<string, string>();
  if (seedData?.settings) {
    for (const [k, v] of Object.entries(seedData.settings)) {
      settingsStore.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }
  const syncedBatches: any[] = [];

  function createStatement(sql: string, boundValues: unknown[] = []): D1PreparedStatement {
    return {
      bind(...values: unknown[]) {
        return createStatement(sql, values);
      },
      async first<T = any>(): Promise<T | null> {
        const allRes = await this.all<T>();
        return allRes.results[0] ?? null;
      },
      async run<T = any>() {
        const normSql = sql.replace(/\s+/g, ' ').trim();
        syncedBatches.push({ sql: normSql, boundValues });
        if (normSql.includes("INSERT INTO public_site_settings (key, value_json, updated_at) VALUES ('runtime_routing_config'")) {
          settingsStore.set('runtime_routing_config', String(boundValues[0] || '{}'));
        }
        return { success: true, results: [] as T[] };
      },
      async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
        const normSql = sql.replace(/\s+/g, ' ').trim();

        if (normSql.includes("FROM public_site_settings WHERE key = 'runtime_routing_config'")) {
          const val = settingsStore.get('runtime_routing_config');
          return {
            results: (val ? [{ value_json: val }] : []) as unknown as T[],
            success: true,
          };
        }
        if (normSql.includes('SELECT key, value_json, updated_at FROM public_site_settings')) {
          const rows = Array.from(settingsStore.entries()).map(([key, value_json]) => ({
            key,
            value_json,
            updated_at: '2026-10-20T12:00:00Z',
          }));
          return { results: rows as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_banners')) {
          return { results: banners as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_badges')) {
          return { results: badges as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_products WHERE id IN')) {
          const idsSet = new Set(boundValues.map((v) => String(v)));
          const found = products.filter((p) => idsSet.has(String(p.id)));
          return { results: found as unknown as T[], success: true };
        }
        if (normSql.includes('COUNT(*) as total_products FROM public_products')) {
          return { results: [{ total_products: products.length } as unknown as T], success: true };
        }
        if (normSql.includes('FROM sync_state')) {
          return {
            results: [
              {
                entity_type: 'local_products',
                last_sync_at: '2026-10-20T12:00:00Z',
                last_sync_status: 'ok',
              } as unknown as T,
            ],
            success: true,
          };
        }
        if (normSql.includes('COUNT(*) as total FROM public_products')) {
          const isIntlFilter = normSql.includes('p.is_international = 1')
            ? 1
            : normSql.includes('p.is_international = 0')
              ? 0
              : null;
          const filtered = isIntlFilter === null ? products : products.filter((p) => p.is_international === isIntlFilter);
          return { results: [{ total: filtered.length } as unknown as T], success: true };
        }
        if (normSql.includes('FROM public_products WHERE (slug = ? OR id = ?)')) {
          const key = String(boundValues[0] || '');
          const found = products.find((p) => p.slug === key || p.id === key);
          return { results: (found ? [found] : []) as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_slug_redirects WHERE old_slug = ?')) {
          const key = String(boundValues[0] || '');
          const found = redirects.find((r) => r.old_slug === key);
          return { results: (found ? [found] : []) as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_products') && normSql.includes('WHERE wave_name = ?')) {
          const wave = String(boundValues[0] || '');
          const excludeId = String(boundValues[1] || '');
          const found = products.filter((p) => p.wave_name === wave && p.id !== excludeId);
          return { results: found as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_products')) {
          const isIntlFilter = normSql.includes('p.is_international = 1')
            ? 1
            : normSql.includes('p.is_international = 0')
              ? 0
              : null;
          const filtered = isIntlFilter === null ? products : products.filter((p) => p.is_international === isIntlFilter);
          return { results: filtered as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_categories')) {
          return { results: categories as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_brands')) {
          return { results: brands as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_promotions')) {
          return { results: promotions as unknown as T[], success: true };
        }
        if (normSql.includes('FROM public_radar_releases')) {
          return { results: radar as unknown as T[], success: true };
        }
        if (normSql.includes('INSERT INTO') || normSql.includes('UPDATE public_products')) {
          syncedBatches.push({ sql: normSql, boundValues });
          return { results: [], success: true };
        }
        return { results: [], success: true };
      },
    };
  }

  return {
    syncedBatches,
    settingsStore,
    prepare(query: string) {
      return createStatement(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const out: Array<{ results?: T[]; success: boolean }> = [];
      for (const stmt of statements) {
        const res = await stmt.all<T>();
        out.push({ results: res.results, success: true });
      }
      return out;
    },
    async exec() {
      return { count: 1, duration: 1 };
    },
  };
}

const SAMPLE_LOCAL_PRODUCT = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'funko-pop-batman-80th',
  title: 'Funko Pop! Batman 80th Anniversary',
  sku: 'FK-BAT-80',
  catalog_source: 'local',
  source_provider: 'platform',
  source_market: 'UY',
  is_international: 0,
  currency: 'UYU',
  price_currency: 'UYU',
  base_price: 1490,
  compare_at_price: 1790,
  final_price_usd: null,
  final_price_uyu: 1490,
  status: 'published',
  is_active: 1,
  stock: 4,
  stock_status: 'in_stock',
  condition: 'new',
  is_featured: 1,
  category_id: 'cat-funko',
  category_name: 'Funko Pop',
  category_slug: 'funko-pop',
  brand_id: 'brand-funko',
  brand_name: 'Funko',
  brand_slug: 'funko',
  vendor_id: 'vendor-uy-1',
  vendor_name: 'Montevideo Toys',
  vendor_slug: 'montevideo-toys',
  vendor_status: 'active',
  vendor_ships_to_argentina: 1,
  primary_image_url: 'https://collectibles.uy/img/batman.webp',
  images_json: JSON.stringify([{ id: 'img-1', url: 'https://collectibles.uy/img/batman.webp', is_primary: true }]),
  variants_json: JSON.stringify([{ id: 'var-bat-1', sku: 'FK-BAT-80', price_adjustment: 0, inventory_count: 4 }]),
  search_text: 'funko pop batman 80th anniversary fk-bat-80',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
};

const SAMPLE_INTL_PRODUCT = {
  id: '00000000-0000-4000-8000-000000000002',
  slug: 'marvel-legends-wolverine-asin-b0999',
  title: 'Marvel Legends Series Wolverine 85th Anniversary',
  sku: 'B0999X',
  asin: 'B0999X',
  external_product_id: 'B0999X',
  catalog_source: 'international',
  source_provider: 'zinc',
  source_market: 'US',
  is_international: 1,
  currency: 'USD',
  price_currency: 'USD',
  base_price: 42.5,
  compare_at_price: 49.99,
  final_price_usd: 42.5,
  final_price_uyu: 1870,
  urubox_estimated_cost_usd: 12.0,
  total_estimated_cost_usd: 54.5,
  amazon_prime: 1,
  status: 'published',
  is_active: 1,
  stock: 5,
  stock_status: 'in_stock',
  condition: 'new',
  is_featured: 0,
  category_id: 'cat-action',
  category_name: 'Figuras de Acción',
  category_slug: 'figuras-de-accion',
  brand_id: 'brand-hasbro',
  brand_name: 'Hasbro',
  brand_slug: 'hasbro',
  primary_image_url: 'https://m.media-amazon.com/images/I/wolverine.jpg',
  images_json: JSON.stringify([{ url: 'https://m.media-amazon.com/images/I/wolverine.jpg', is_primary: true }]),
  search_text: 'marvel legends series wolverine 85th anniversary b0999x hasbro',
  created_at: '2026-10-05T10:00:00Z',
  updated_at: '2026-10-20T11:00:00Z',
};

describe('Migración Collectibles a Cloudflare D1 + Workers — Suite de Integración y Verificación', () => {
  beforeEach(() => {
    resetPublicCatalogCircuitBreaker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Caso 1: Cobertura pública total con Supabase caído -> D1 sirve productos, fichas, taxonomías, facetas, settings, promociones, radar y feeds; Checkout bloquea confirmación', async () => {
    const db = createMockD1Database({
      products: [SAMPLE_LOCAL_PRODUCT, SAMPLE_INTL_PRODUCT],
      categories: [{ id: 'cat-funko', name: 'Funko Pop', slug: 'funko-pop', is_active: 1 }],
      brands: [{ id: 'brand-funko', name: 'Funko', slug: 'funko', is_active: 1, status: 'approved' }],
      promotions: [{ id: 'promo-1', name: '10% OFF Figuras', type: 'percentage', value: 10, is_active: 1, priority: 10 }],
      radar: [{ id: 'rad-1', title: 'Batman Returns Wave', slug: 'batman-returns-wave', release_date: '2026-12-01', hype_score: 95, hero_image_url: 'https://collectibles.uy/img/batman-radar.webp' }],
      settings: {
        public_site_config: { store_name: 'Collectibles.uy', exchange_rate_uyu: '43.5' },
        feature_toggles: { marketplace: true, radar: true },
      },
      banners: [{ id: 'ban-1', title: 'Hero D1', is_active: 1, sort_order: 1 }],
      badges: [{ id: 'hot', slug: 'hot', label: 'HOT', bg_color: '#ef4444', text_color: '#fff', is_active: 1 }],
    });
    const env: Env = { DB: db, ENVIRONMENT: 'test' };

    // 1. Listado público de productos (/api/v1/products y /api/public-catalog compatible)
    const listRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/products'), env);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.source).toBe('cloudflare-d1');
    expect(listBody.count).toBe(2);
    expect(listBody.products).toHaveLength(2);

    const compatRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/public-catalog?mode=facets'), env);
    expect(compatRes.status).toBe(200);
    const compatBody = await compatRes.json();
    expect(compatBody.facets.totalCatalogProducts).toBe(2);
    expect(compatBody.taxonomies.categories).toHaveLength(1);

    // 2. Ficha pública de producto
    const detailRes = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/products/funko-pop-batman-80th'),
      env
    );
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.product.title).toBe('Funko Pop! Batman 80th Anniversary');
    expect(detailBody.product.currency).toBe('UYU');
    expect(detailBody.product.images).toHaveLength(1);

    // 3. Taxonomías, promociones, radar y settings/banners/badges
    const taxRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/taxonomies'), env);
    expect(taxRes.status).toBe(200);
    const promoRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/promotions'), env);
    expect(promoRes.status).toBe(200);
    const radarRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/radar'), env);
    expect(radarRes.status).toBe(200);
    const settingsRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/settings'), env);
    expect(settingsRes.status).toBe(200);
    const settingsBody = await settingsRes.json();
    expect(settingsBody.site_config.store_name).toBe('Collectibles.uy');
    expect(settingsBody.banners).toHaveLength(1);
    expect(settingsBody.badges).toHaveLength(1);

    // 4. Con Supabase caído (HTTP 504), Checkout falla de forma cerrada y preserva el carrito
    const deadSupabaseClient: any = {
      from: () => ({
        select: () => ({
          in: async () => ({ data: null, error: { message: '504 Gateway Timeout - PostgreSQL Unhealthy' } }),
        }),
      }),
    };

    const checkoutCheck = await CommerceOperationsProvider.validateCartBeforeCheckout(
      [{ product_id: SAMPLE_LOCAL_PRODUCT.id, title: SAMPLE_LOCAL_PRODUCT.title, quantity: 1, price: 1490, currency: 'UYU' }],
      deadSupabaseClient
    );

    expect(checkoutCheck.valid).toBe(false);
    expect(checkoutCheck.supabaseReachable).toBe(false);
    expect(checkoutCheck.userMessage).toContain('Tu carrito está guardado');
  });

  it('Caso 2: Cloudflare D1 con fallo de red transitorio -> Circuit Breaker sirve snapshot cacheado sin estampida a Supabase', async () => {
    let workerHealthy = true;
    const mockFetcher = vi.fn(async () => {
      if (!workerHealthy) {
        return new Response('Upstream Network Timeout', { status: 502 });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          products: [mapD1RowToPublicProduct(SAMPLE_LOCAL_PRODUCT)],
          pagination: { total: 1, page: 1, limit: 24, total_pages: 1, has_more: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const first = await fetchFromCloudflareCatalog('/api/v1/products', { page: 1 }, {
      ttlMs: 1,
      staleMs: 60_000,
      fetcher: mockFetcher as any,
    });
    expect(first.fromCache).toBe(false);
    expect(first.staleFallback).toBe(false);

    await new Promise((r) => setTimeout(r, 10));
    workerHealthy = false;

    const fallback = await fetchFromCloudflareCatalog<any>('/api/v1/products', { page: 1 }, {
      ttlMs: 1,
      staleMs: 60_000,
      fetcher: mockFetcher as any,
    });

    expect(fallback.fromCache).toBe(true);
    expect(fallback.staleFallback).toBe(true);
    expect(fallback.data.products).toHaveLength(1);
    expect(fallback.data.products[0].slug).toBe('funko-pop-batman-80th');
  });

  it('Caso 3: Cambio de precio o agotamiento de stock entre navegación en D1 y confirmación de compra en Supabase', async () => {
    const liveSupabaseWithChangedStockAndPrice: any = {
      from: (table: string) => ({
        select: () => ({
          in: async () => {
            if (table === 'products') {
              return {
                data: [
                  {
                    id: SAMPLE_LOCAL_PRODUCT.id,
                    title: 'Funko Pop! Batman 80th Anniversary',
                    status: 'published',
                    is_active: true,
                    base_price: 1890,
                    currency: 'UYU',
                    stock: 1,
                    is_preorder: false,
                    is_international: false,
                    vendors: { id: 'vendor-uy-1', store_name: 'Montevideo Toys', status: 'active' },
                  },
                ],
                error: null,
              };
            }
            return { data: [], error: null };
          },
        }),
      }),
    };

    const stockCheck = await CommerceOperationsProvider.validateCartBeforeCheckout(
      [{ product_id: SAMPLE_LOCAL_PRODUCT.id, title: 'Funko Pop! Batman 80th Anniversary', quantity: 2, price: 1490, currency: 'UYU' }],
      liveSupabaseWithChangedStockAndPrice
    );

    expect(stockCheck.valid).toBe(false);
    expect(stockCheck.discrepancies[0].reason).toBe('insufficient_stock');
    expect(stockCheck.discrepancies[0].availableStock).toBe(1);

    const priceCheck = await CommerceOperationsProvider.validateCartBeforeCheckout(
      [{ product_id: SAMPLE_LOCAL_PRODUCT.id, title: 'Funko Pop! Batman 80th Anniversary', quantity: 1, price: 1490, currency: 'UYU' }],
      liveSupabaseWithChangedStockAndPrice
    );

    expect(priceCheck.valid).toBe(false);
    expect(priceCheck.discrepancies[0].reason).toBe('price_changed');
    expect(priceCheck.discrepancies[0].actualPrice).toBe(1890);
  });

  it('Caso 4: Compatibilidad estricta de precios UYU/USD entre D1 y priceResolver del frontend', () => {
    const localD1Product = mapD1RowToPublicProduct(SAMPLE_LOCAL_PRODUCT, true);
    const intlD1Product = mapD1RowToPublicProduct(SAMPLE_INTL_PRODUCT, true);

    // Verificar compatibilidad con resolveProductNativeCurrency y resolveProductPrice
    expect(resolveProductNativeCurrency(localD1Product)).toBe('UYU');
    const localResolved = resolveProductPrice(localD1Product);
    expect(localResolved.currency).toBe('UYU');
    expect(localResolved.finalPrice).toBe(1490);

    expect(resolveProductNativeCurrency(intlD1Product)).toBe('USD');
    const intlResolved = resolveProductPrice(intlD1Product);
    expect(intlResolved.currency).toBe('USD');
    expect(intlResolved.finalPrice).toBe(42.5);
    expect(intlD1Product.international_products).toHaveLength(1);
    expect(intlD1Product.international_products[0].final_price_usd).toBe(42.5);

    const cachedDiscovery = ExternalSourcingProvider.cacheDiscoveryResults('spawn', [
      { asin: 'B099', title: 'Spawn Deluxe', final_price_usd: 49.99, source_provider: 'amazon' },
    ]);
    expect(cachedDiscovery[0].currency).toBe('USD');
    expect(cachedDiscovery[0].ephemeral).toBe(true);
  });

  it('Caso 5: Seguridad del endpoint privado de sincronización y sanitización estricta de campos privados/financieros', async () => {
    const db = createMockD1Database({
      products: [SAMPLE_LOCAL_PRODUCT],
      redirects: [{ old_slug: 'batman-viejo-slug', new_slug: 'funko-pop-batman-80th', product_id: SAMPLE_LOCAL_PRODUCT.id }],
    });
    const env: Env = {
      DB: db,
      CATALOG_SYNC_SECRET: 'super-secret-sync-token-minimum-24-chars',
    };

    // 1. Rechazo de métodos de escritura en rutas públicas (405)
    const postPublic = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/products', { method: 'POST' }),
      env
    );
    expect(postPublic.status).toBe(405);

    // 2. Rechazo de token inválido con comparación SHA-256 en tiempo constante (401)
    const unauthorizedSync = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/internal/sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
        body: JSON.stringify({ upsert_products: [] }),
      }),
      env
    );
    expect(unauthorizedSync.status).toBe(401);

    // 3. Rechazo de replay attack con X-Sync-Timestamp expirado (> 5 minutos)
    const expiredTimestamp = String(Date.now() - 10 * 60 * 1000);
    const replayRes = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/internal/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super-secret-sync-token-minimum-24-chars',
          'X-Sync-Timestamp': expiredTimestamp,
        },
        body: JSON.stringify({ upsert_products: [] }),
      }),
      env
    );
    expect(replayRes.status).toBe(401);

    // 4. Rechazo de lote que excede el tope de 50 registros (400 Bad Request)
    const oversizedBatch = Array.from({ length: 55 }, (_, i) => ({ ...SAMPLE_LOCAL_PRODUCT, id: `p-${i}` }));
    const tooManyRes = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/internal/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super-secret-sync-token-minimum-24-chars',
        },
        body: JSON.stringify({ upsert_products: oversizedBatch }),
      }),
      env
    );
    expect(tooManyRes.status).toBe(400);

    // 5. Confirmación de que ningún campo privado/financiero se filtra a D1
    const dirtyRecord = {
      id: 'prod-sec-1',
      title: 'Producto Seguro',
      base_price: 1200,
      real_cost_usd: 15.5,
      expected_profit_usd: 22.0,
      acquisition_cost_usd: 14.0,
      credentials_encrypted: 'enc_secret_123',
      access_token: 'tok_live_999',
      buyer_email: 'private@user.com',
      tax_id: '219999990019',
    };
    const sanitized = sanitizePublicRecord(dirtyRecord);
    for (const forbidden of FORBIDDEN_PRIVATE_FIELDS) {
      expect(sanitized).not.toHaveProperty(forbidden);
    }
    expect(sanitized.id).toBe('prod-sec-1');
    expect(sanitized.base_price).toBe(1200);

    // También verificar que transformInternationalProductForD1 jamás incluye costos internos ni márgenes
    const intlFromRaw = transformInternationalProductForD1({
      id: 'intl-sec-1',
      title: 'Test Intl',
      final_price_usd: 45,
      real_cost_usd: 18,
      expected_profit_usd: 15,
      acquisition_cost_usd: 18,
    });
    expect(intlFromRaw).not.toHaveProperty('real_cost_usd');
    expect(intlFromRaw).not.toHaveProperty('expected_profit_usd');
    expect(intlFromRaw).not.toHaveProperty('acquisition_cost_usd');
  });

  it('Caso 6 (Integración): Activación y Rollback REAL en Runtime (< 1s) sin recompilar variables VITE_*', async () => {
    const db = createMockD1Database({
      products: [SAMPLE_LOCAL_PRODUCT],
    });
    const env: Env = {
      DB: db,
      CATALOG_SYNC_SECRET: 'super-secret-sync-token-minimum-24-chars',
    };
    const workerFetcher: typeof fetch = (input, init) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      return workerApp.fetch(req, env);
    };

    // 1. Activar en caliente vía override de runtime (incluso con VITE_USE_CF_PUBLIC_CATALOG = false en build)
    setRuntimeCatalogOverride(true);
    expect(isCatalogDomainEnabled('products')).toBe(true);
    expect(isRuntimeKillSwitchActive()).toBe(false);

    const activeRes = await PublicCatalogProvider.getProducts({}, workerFetcher);
    expect(activeRes.data.products).toHaveLength(1);

    // 2. Ejecutar ROLLBACK EN RUNTIME en el Worker vía POST /api/v1/internal/runtime-mode (sin rebuild de Vite)
    const disableRes = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/internal/runtime-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super-secret-sync-token-minimum-24-chars',
        },
        body: JSON.stringify({
          enabled: false,
          reason: 'Simulación de rollback inmediato en producción',
        }),
      }),
      env
    );
    expect(disableRes.status).toBe(200);
    const disableBody = await disableRes.json();
    expect(disableBody.runtime_config.enabled).toBe(false);
    expect(disableBody.runtime_config.mode).toBe('disabled');

    // 3. El siguiente request del frontend detecta X-Catalog-Kill-Switch: active / HTTP 503
    // y desactiva inmediatamente el proveedor en memoria y sessionStorage (< 1s)
    resetPublicCatalogCircuitBreaker();
    setRuntimeCatalogOverride(true); // Simulando que el bundle tenía el flag activo
    await expect(PublicCatalogProvider.getProducts({}, workerFetcher)).rejects.toThrow(CatalogKillSwitchError);

    // Inmediatamente después, isCatalogDomainEnabled devuelve false para TODOS los dominios sin requerir rebuild
    expect(isRuntimeKillSwitchActive()).toBe(true);
    expect(isCatalogDomainEnabled('products')).toBe(false);
    expect(isCatalogDomainEnabled('productDetail')).toBe(false);
    expect(isCatalogDomainEnabled('taxonomies')).toBe(false);
    expect(isCatalogDomainEnabled('settings')).toBe(false);

    // 4. Reactivar en caliente desde el Worker y sincronizar runtime-config
    await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/internal/runtime-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super-secret-sync-token-minimum-24-chars',
        },
        body: JSON.stringify({ enabled: true }),
      }),
      env
    );
    const synced = await syncRuntimeConfig(workerFetcher);
    expect(synced.enabled).toBe(true);
    expect(isRuntimeKillSwitchActive()).toBe(false);
    expect(isCatalogDomainEnabled('products')).toBe(true);
  });

  it('Caso 7 (Integración): Sincronización Zero-Write por PK Keyset + diff-check para proteger Supabase Nano', async () => {
    // 1. Verificar que el SQL generado por lote usa paginación keyset por PK (id=gt.<cursor>&order=id.asc)
    // y NUNCA usa ORDER BY updated_at ni joins laterales pesados
    const headerQuery = buildKeysetHeaderQuery('00000000-0000-4000-8000-000000000001', 50, 'products');
    expect(headerQuery).toContain('id=gt.00000000-0000-4000-8000-000000000001');
    expect(headerQuery).toContain('order=id.asc');
    expect(headerQuery).not.toContain('order=updated_at');

    const hydrateQuery = buildHydrateProductsByPkQuery([SAMPLE_LOCAL_PRODUCT.id], 'products');
    expect(hydrateQuery).toContain(`id=in.(${SAMPLE_LOCAL_PRODUCT.id})`);
    expect(hydrateQuery).not.toContain('product_images(');
    expect(hydrateQuery).not.toContain('categories(');

    // 2. Verificar que /api/v1/internal/diff-check filtra registros sin cambios y detecta bajas
    const db = createMockD1Database({
      products: [SAMPLE_LOCAL_PRODUCT],
    });
    const env: Env = {
      DB: db,
      CATALOG_SYNC_SECRET: 'super-secret-sync-token-minimum-24-chars',
    };

    const diffRes = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/internal/diff-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super-secret-sync-token-minimum-24-chars',
        },
        body: JSON.stringify({
          items: [
            // Mismo updated_at, precio y stock -> NO debe requerir hidratación
            {
              id: SAMPLE_LOCAL_PRODUCT.id,
              updated_at: SAMPLE_LOCAL_PRODUCT.updated_at,
              status: 'published',
              is_active: true,
              base_price: 1490,
              stock: 4,
            },
            // Producto nuevo que no está en D1 -> SÍ debe requerir hidratación
            {
              id: '00000000-0000-4000-8000-000000000099',
              updated_at: '2026-10-20T13:00:00Z',
              status: 'published',
              is_active: true,
              base_price: 2100,
              stock: 2,
            },
          ],
        }),
      }),
      env
    );

    expect(diffRes.status).toBe(200);
    const diffBody = await diffRes.json();
    expect(diffBody.changed_ids).toEqual(['00000000-0000-4000-8000-000000000099']);
    expect(diffBody.checked).toBe(2);

    // Verificar límites estrictos configurados
    expect(SYNC_LIMITS.HYDRATE_BATCH_SIZE).toBeLessThanOrEqual(15);
    expect(SYNC_LIMITS.MAX_RESPONSE_BYTES).toBe(512 * 1024);
    expect(SYNC_LIMITS.HARD_LATENCY_ABORT_MS).toBe(2000);
  });

  it('Caso 8 (Integración E2E Simulada): Navegación en D1 -> Carrito -> Validación Autoritativa -> Creación de Orden Simulada (sin pagos reales)', async () => {
    const db = createMockD1Database({
      products: [SAMPLE_LOCAL_PRODUCT],
    });
    const env: Env = { DB: db, ENVIRONMENT: 'test' };
    const workerFetcher: typeof fetch = (input, init) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      return workerApp.fetch(req, env);
    };

    // Paso 1: Usuario navega ficha de producto desde Cloudflare D1
    setRuntimeCatalogOverride(true);
    const pdpRes = await PublicCatalogProvider.getProductBySlug('funko-pop-batman-80th', workerFetcher);
    const browsedProduct = pdpRes.data.product;
    expect(browsedProduct.id).toBe(SAMPLE_LOCAL_PRODUCT.id);

    // Paso 2: Resolver precio y moneda nativa como lo hace ProductDetail.tsx al agregar al carrito
    const pricing = resolveProductPrice(browsedProduct);
    expect(pricing.currency).toBe('UYU');
    expect(pricing.finalPrice).toBe(1490);

    const cartItem = {
      product_id: browsedProduct.id,
      variant_id: browsedProduct.variants?.[0]?.id || browsedProduct.id,
      vendor_id: browsedProduct.vendor_id,
      title: browsedProduct.title,
      quantity: 2,
      price: pricing.finalPrice,
      currency: pricing.currency,
    };

    // Paso 3: Validar stock y precio autoritativo contra Supabase antes de crear la orden
    const simulatedSupabase: any = {
      from: (table: string) => ({
        select: () => ({
          in: async () => {
            if (table === 'products') {
              return {
                data: [
                  {
                    id: SAMPLE_LOCAL_PRODUCT.id,
                    title: SAMPLE_LOCAL_PRODUCT.title,
                    status: 'published',
                    is_active: true,
                    base_price: 1490,
                    currency: 'UYU',
                    stock: 4,
                    is_preorder: false,
                    is_international: false,
                    vendors: { id: 'vendor-uy-1', store_name: 'Montevideo Toys', status: 'active' },
                  },
                ],
                error: null,
              };
            }
            return { data: [], error: null };
          },
        }),
      }),
    };

    const validation = await CommerceOperationsProvider.validateCartBeforeCheckout([cartItem], simulatedSupabase);
    expect(validation.valid).toBe(true);
    expect(validation.discrepancies).toHaveLength(0);

    // Paso 4: Simular creación de orden transaccional vía createCheckoutOrder (interceptando fetch sin pagos reales)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('/functions/v1/create-order')) {
        return new Response(
          JSON.stringify({
            success: true,
            order: {
              id: 'ord-sim-2026-0001',
              order_number: 'COL-2026-0001',
              status: 'pending_payment',
              currency: 'UYU',
              total_amount: 2980,
              items_count: 2,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected external call during simulated checkout: ${urlStr}`);
    });

    const createdOrder = await createCheckoutOrder({
      items: [
        {
          product_id: cartItem.product_id,
          variant_id: cartItem.variant_id,
          vendor_id: cartItem.vendor_id,
          quantity: cartItem.quantity,
          price: cartItem.price,
          title: cartItem.title,
        },
      ],
      payment_method: 'mercadopago',
      currency: 'UYU',
      shipping_method: 'dac_agency',
      shipping_address: {
        first_name: 'Juan',
        last_name: 'Coleccionista',
        city: 'Montevideo',
        department: 'Montevideo',
        country: 'UY',
        ci: '41234567',
      },
      customer_email: 'test-simulado@collectibles.uy',
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      accepted_terms_version: 'v1.0',
    });

    expect(createdOrder.id).toBe('ord-sim-2026-0001');
    expect(createdOrder.total_amount).toBe(2980);
    expect(createdOrder.currency).toBe('UYU');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
