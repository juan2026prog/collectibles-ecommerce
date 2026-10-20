import { describe, it, expect, beforeEach, vi } from 'vitest';
import workerApp, { mapD1RowToPublicProduct, type Env, type D1Database, type D1PreparedStatement } from '../../../../../cloudflare/collectibles-catalog-api/src/index';
import {
  PublicCatalogProvider,
  fetchFromCloudflareCatalog,
  resetPublicCatalogCircuitBreaker,
} from '../PublicCatalogProvider';
import { CommerceOperationsProvider } from '../CommerceOperationsProvider';
import { ExternalSourcingProvider } from '../ExternalSourcingProvider';
import {
  transformLocalProductForD1,
  transformInternationalProductForD1,
} from '../../../../../scripts/d1-sync/sync-supabase-to-d1.mjs';

/**
 * Mock ligero en memoria de Cloudflare D1 para verificar el Worker y el flujo extremo a extremo.
 */
function createMockD1Database(seedData?: {
  products?: Record<string, any>[];
  categories?: Record<string, any>[];
  brands?: Record<string, any>[];
  promotions?: Record<string, any>[];
  radar?: Record<string, any>[];
  redirects?: Record<string, any>[];
}): D1Database & { syncedBatches: any[] } {
  const products = [...(seedData?.products || [])];
  const categories = [...(seedData?.categories || [])];
  const brands = [...(seedData?.brands || [])];
  const promotions = [...(seedData?.promotions || [])];
  const radar = [...(seedData?.radar || [])];
  const redirects = [...(seedData?.redirects || [])];
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
        syncedBatches.push({ sql, boundValues });
        return { success: true, results: [] as T[] };
      },
      async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
        const normSql = sql.replace(/\s+/g, ' ').trim();

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
  id: 'prod-local-uyu-1',
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
  search_text: 'funko pop batman 80th anniversary fk-bat-80',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
};

const SAMPLE_INTL_PRODUCT = {
  id: 'prod-intl-usd-1',
  slug: 'marvel-legends-wolverine-asin-b0999',
  title: 'Marvel Legends Series Wolverine 85th Anniversary',
  sku: 'B0999X',
  asin: 'B0999X',
  external_product_id: 'B0999X',
  catalog_source: 'international',
  source_provider: 'amazon',
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

describe('Migración Collectibles a Cloudflare D1 + Workers — Suite de Verificación', () => {
  beforeEach(() => {
    resetPublicCatalogCircuitBreaker();
  });

  it('Caso 1: Supabase caído y Cloudflare D1 activo -> navegación pública funciona y Checkout bloquea confirmación de forma segura', async () => {
    const db = createMockD1Database({
      products: [SAMPLE_LOCAL_PRODUCT, SAMPLE_INTL_PRODUCT],
      categories: [{ id: 'cat-funko', name: 'Funko Pop', slug: 'funko-pop', is_active: 1 }],
      brands: [{ id: 'brand-funko', name: 'Funko', slug: 'funko', is_active: 1, status: 'approved' }],
      promotions: [{ id: 'promo-1', name: '10% OFF Figuras', type: 'percentage', value: 10, is_active: 1, priority: 10 }],
      radar: [{ id: 'rad-1', title: ' Batman Returns Wave', slug: 'batman-returns-wave', release_date: '2026-12-01', hype_score: 95 }],
    });
    const env: Env = { DB: db, ENVIRONMENT: 'test' };

    // 1. Listado público de productos responde 200 desde D1 sin tocar Supabase
    const listRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/products'), env);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.source).toBe('cloudflare-d1');
    expect(listBody.products).toHaveLength(2);

    // 2. Ficha pública de producto responde 200 desde D1
    const detailRes = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/products/funko-pop-batman-80th'),
      env
    );
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.product.title).toBe('Funko Pop! Batman 80th Anniversary');
    expect(detailBody.product.currency).toBe('UYU');

    // 3. Taxonomías, promociones y radar responden 200 desde D1
    const taxRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/taxonomies'), env);
    expect(taxRes.status).toBe(200);
    const promoRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/promotions'), env);
    expect(promoRes.status).toBe(200);
    const radarRes = await workerApp.fetch(new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/radar'), env);
    expect(radarRes.status).toBe(200);

    // 4. Con Supabase caído (HTTP 504 / error de conexión), el Checkout falla de forma cerrada y preserva el carrito
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

  it('Caso 2: Cloudflare D1 caído y Supabase activo -> Circuit Breaker sirve snapshot cacheado sin estampida a Supabase', async () => {
    let workerHealthy = true;
    const mockFetcher = vi.fn(async () => {
      if (!workerHealthy) {
        return new Response('Worker Error', { status: 503 });
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

    // Primera lectura con Worker sano: llena snapshot local pero con TTL corto (1ms) y ventana stale amplia (60s)
    const first = await fetchFromCloudflareCatalog('/api/v1/products', { page: 1 }, {
      ttlMs: 1,
      staleMs: 60_000,
      fetcher: mockFetcher as any,
    });
    expect(first.fromCache).toBe(false);
    expect(first.staleFallback).toBe(false);

    // Esperar expiración del TTL primario y simular caída de Cloudflare Worker
    await new Promise((r) => setTimeout(r, 10));
    workerHealthy = false;

    const fallback = await fetchFromCloudflareCatalog<any>('/api/v1/products', { page: 1 }, {
      ttlMs: 1,
      staleMs: 60_000,
      fetcher: mockFetcher as any,
    });

    // Debe devolver el snapshot local válido sin hacer fallback directo a Supabase
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
                    id: 'prod-local-uyu-1',
                    title: 'Funko Pop! Batman 80th Anniversary',
                    status: 'published',
                    is_active: true,
                    base_price: 1890, // Subió de 1490 a 1890 en Supabase
                    currency: 'UYU',
                    stock: 1, // Solo queda 1 en stock real (el usuario pidió 2)
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

    // Usuario intenta comprar 2 unidades al precio viejo de D1 (1490 UYU)
    const stockCheck = await CommerceOperationsProvider.validateCartBeforeCheckout(
      [{ product_id: 'prod-local-uyu-1', title: 'Funko Pop! Batman 80th Anniversary', quantity: 2, price: 1490, currency: 'UYU' }],
      liveSupabaseWithChangedStockAndPrice
    );

    expect(stockCheck.valid).toBe(false);
    expect(stockCheck.discrepancies[0].reason).toBe('insufficient_stock');
    expect(stockCheck.discrepancies[0].availableStock).toBe(1);

    // Usuario ajusta cantidad a 1 pero mantiene precio viejo de D1 (1490 vs 1890 en Supabase)
    const priceCheck = await CommerceOperationsProvider.validateCartBeforeCheckout(
      [{ product_id: 'prod-local-uyu-1', title: 'Funko Pop! Batman 80th Anniversary', quantity: 1, price: 1490, currency: 'UYU' }],
      liveSupabaseWithChangedStockAndPrice
    );

    expect(priceCheck.valid).toBe(false);
    expect(priceCheck.discrepancies[0].reason).toBe('price_changed');
    expect(priceCheck.discrepancies[0].actualPrice).toBe(1890);
  });

  it('Caso 4: Integridad estricta de monedas (UYU para local Uruguay, USD para internacional) y no persistencia masiva de búsquedas externas', () => {
    const localTransformed = transformLocalProductForD1({
      id: 'loc-1',
      slug: 'spider-man-uru',
      title: 'Figura Spider-Man Stock Local',
      base_price: 2500,
      currency: 'UYU',
      stock: 3,
      status: 'published',
      is_active: true,
    });

    const intlTransformed = transformInternationalProductForD1({
      id: 'intl-1',
      asin: 'B012345678',
      external_product_id: 'B012345678',
      title: 'McFarlane Spawn Amazon US',
      final_price_usd: 34.99,
      final_price_uyu: 1540,
      availability: 'in_stock',
      status: 'published',
    });

    // Local en UYU, Internacional en USD
    expect(localTransformed.currency).toBe('UYU');
    expect(localTransformed.price_currency).toBe('UYU');
    expect(localTransformed.is_international).toBe(false);
    expect(localTransformed.base_price).toBe(2500);

    expect(intlTransformed.currency).toBe('USD');
    expect(intlTransformed.price_currency).toBe('USD');
    expect(intlTransformed.is_international).toBe(true);
    expect(intlTransformed.base_price).toBe(34.99);
    expect(intlTransformed.final_price_usd).toBe(34.99);
    expect(intlTransformed.final_price_uyu).toBe(1540);

    // Descubrimiento externo (Amazon/eBay) es efímero en memoria y siempre en USD
    const cachedDiscovery = ExternalSourcingProvider.cacheDiscoveryResults('spawn', [
      { asin: 'B099', title: 'Spawn Deluxe', final_price_usd: 49.99, source_provider: 'amazon' },
    ]);
    expect(cachedDiscovery[0].currency).toBe('USD');
    expect(cachedDiscovery[0].ephemeral).toBe(true);
  });

  it('Caso 5: Seguridad del Worker (bloqueo de escrituras públicas, redirección de slugs, feeds y autenticación del canal de sync)', async () => {
    const db = createMockD1Database({
      products: [SAMPLE_LOCAL_PRODUCT],
      redirects: [{ old_slug: 'batman-viejo-slug', new_slug: 'funko-pop-batman-80th', product_id: SAMPLE_LOCAL_PRODUCT.id }],
    });
    const env: Env = {
      DB: db,
      CATALOG_SYNC_SECRET: 'super-secret-sync-token-minimum-24-chars',
    };

    // 1. Intento de escritura en endpoint público -> 405 Method Not Allowed
    const postPublic = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/products', { method: 'POST' }),
      env
    );
    expect(postPublic.status).toBe(405);

    // 2. Intento de sincronización sin token válido -> 401 Unauthorized
    const unauthorizedSync = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/internal/sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
        body: JSON.stringify({ upsert_products: [] }),
      }),
      env
    );
    expect(unauthorizedSync.status).toBe(401);

    // 3. Sincronización autenticada válida -> 200 OK e idempotente
    const validSync = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/internal/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super-secret-sync-token-minimum-24-chars',
        },
        body: JSON.stringify({
          batch_id: 'test-batch-001',
          upsert_products: [SAMPLE_LOCAL_PRODUCT],
          unpublish_product_ids: ['prod-deleted-99'],
          cursor: { entity_type: 'local_products', last_updated_at: '2026-10-20T12:00:00Z', last_id: SAMPLE_LOCAL_PRODUCT.id },
        }),
      }),
      env
    );
    expect(validSync.status).toBe(200);
    const syncBody = await validSync.json();
    expect(syncBody.ok).toBe(true);
    expect(syncBody.records_affected).toBe(2);

    // 4. Redirección automática de slug antiguo
    const redirectedRes = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/products/batman-viejo-slug'),
      env
    );
    expect(redirectedRes.status).toBe(200);
    const redirectedBody = await redirectedRes.json();
    expect(redirectedBody.redirected_from).toBe('batman-viejo-slug');
    expect(redirectedBody.canonical_slug).toBe('funko-pop-batman-80th');

    // 5. Feeds XML/CSV y Sitemap generados desde D1 sin tocar Supabase
    const merchantRes = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/feeds/merchant.xml'),
      env
    );
    expect(merchantRes.status).toBe(200);
    const merchantXml = await merchantRes.text();
    expect(merchantXml).toContain('<g:price>1490.00 UYU</g:price>');

    const sitemapRes = await workerApp.fetch(
      new Request('https://collectibles-catalog-api.pixelsncodes-uy.workers.dev/api/v1/sitemap.xml'),
      env
    );
    expect(sitemapRes.status).toBe(200);
    expect(await sitemapRes.text()).toContain('https://collectibles.uy/producto/funko-pop-batman-80th');
  });
});
