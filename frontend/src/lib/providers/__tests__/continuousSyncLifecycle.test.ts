import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import workerApp, {
  type Env,
  type D1Database,
  type D1PreparedStatement,
} from '../../../../../cloudflare/collectibles-catalog-api/src/index';
import {
  PublicCatalogProvider,
  resetPublicCatalogCircuitBreaker,
} from '../PublicCatalogProvider';
import {
  computeSyncSignatureHmac,
  pushBatchToD1Worker,
  stripPrivateFields,
} from '../../../../../scripts/d1-sync/sync-supabase-to-d1.mjs';
import {
  calculateNextBackoff,
  enqueueOutboxEvents,
  processOutboxBatch,
  syncProductsToCloudflareD1,
} from '../../../../../supabase/functions/_shared/cloudflareCatalogSync';

/**
 * Mock D1 Database con capacidades completas para pruebas de ciclo de vida de sincronización continua
 */
function createSyncLifecycleMockDb(): D1Database & {
  productsMap: Map<string, any>;
  redirectsMap: Map<string, any>;
  settingsMap: Map<string, string>;
  auditLogs: any[];
} {
  const productsMap = new Map<string, any>();
  const redirectsMap = new Map<string, any>();
  const settingsMap = new Map<string, string>();
  const auditLogs: any[] = [];

  // Default active runtime config with productDetail & products enabled
  settingsMap.set(
    'runtime_routing_config',
    JSON.stringify({
      enabled: true,
      mode: 'active',
      domains: {
        products: true,
        productDetail: true,
        taxonomies: true,
        search: false,
        promotions: false,
        radar: false,
        settings: false,
        feeds: true,
      },
    })
  );

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

        if (normSql.includes('INSERT INTO public_products')) {
          const id = String(boundValues[0]);
          const incomingUpdatedAt = String(boundValues[74] || '');
          const existing = productsMap.get(id);

          // Simular SQLite WHERE excluded.updated_at >= public_products.updated_at
          if (normSql.includes('WHERE excluded.updated_at >= public_products.updated_at')) {
            if (existing && existing.updated_at && incomingUpdatedAt && incomingUpdatedAt < existing.updated_at) {
              return { success: true, results: [] as T[] };
            }
          }

          const slug = String(boundValues[1]);
          const title = String(boundValues[2]);
          const currency = String(boundValues[13]);
          const basePrice = Number(boundValues[15]);
          const finalPriceUyu = Number(boundValues[18] ?? basePrice);
          const status = String(boundValues[25] || 'published');
          const isActive = Number(boundValues[26] ?? 1);
          const stock = Number(boundValues[27] ?? 0);
          const stockStatus = String(boundValues[28] || (stock > 0 ? 'in_stock' : 'out_of_stock'));

          const record = {
            id,
            slug,
            title,
            currency,
            price_currency: currency,
            base_price: basePrice,
            final_price_usd: boundValues[17] != null ? Number(boundValues[17]) : null,
            final_price_uyu: finalPriceUyu,
            is_international: Number(boundValues[12] ?? 0),
            status,
            is_active: isActive,
            stock,
            stock_status: stockStatus,
            variants_json: String(boundValues[61] || '[]'),
            primary_image_url: boundValues[58] ? String(boundValues[58]) : null,
            images_json: String(boundValues[59] || '[]'),
            created_at: boundValues[73] || new Date().toISOString(),
            updated_at: boundValues[74] || new Date().toISOString(),
          };
          productsMap.set(id, record);
          return { success: true, results: [] as T[] };
        }

        if (normSql.includes('UPDATE public_products SET is_active = 0, status = \'archived\'')) {
          if (normSql.includes('AND (? >= updated_at OR updated_at IS NULL)')) {
            const updatedAt = String(boundValues[0]);
            const id = String(boundValues[1]);
            const prod = productsMap.get(id);
            if (prod) {
              if (!prod.updated_at || updatedAt >= prod.updated_at) {
                prod.is_active = 0;
                prod.status = 'archived';
                prod.updated_at = updatedAt;
                productsMap.set(id, prod);
              }
            }
            return { success: true, results: [] as T[] };
          } else {
            const id = String(boundValues[0]);
            const prod = productsMap.get(id);
            if (prod) {
              prod.is_active = 0;
              prod.status = 'archived';
              productsMap.set(id, prod);
            }
            return { success: true, results: [] as T[] };
          }
        }

        if (normSql.includes('INSERT INTO public_slug_redirects')) {
          const oldSlug = String(boundValues[0]);
          const newSlug = String(boundValues[1]);
          const productId = String(boundValues[2]);
          redirectsMap.set(oldSlug, { old_slug: oldSlug, new_slug: newSlug, product_id: productId });
          return { success: true, results: [] as T[] };
        }

        if (normSql.includes('INSERT INTO sync_audit_log')) {
          auditLogs.push({ batchId: boundValues[0], operation: boundValues[1], affected: boundValues[2] });
          return { success: true, results: [] as T[] };
        }

        return { success: true, results: [] as T[] };
      },
      async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
        const normSql = sql.replace(/\s+/g, ' ').trim();

        if (normSql.includes("FROM public_site_settings WHERE key = 'runtime_routing_config'")) {
          const val = settingsMap.get('runtime_routing_config');
          return { results: (val ? [{ value_json: val }] : []) as unknown as T[], success: true };
        }

        if (normSql.includes('FROM public_products WHERE (slug = ? OR id = ?) AND is_active = 1')) {
          const key = String(boundValues[0]);
          for (const prod of productsMap.values()) {
            if ((prod.slug === key || prod.id === key) && prod.is_active === 1) {
              return { results: [prod] as unknown as T[], success: true };
            }
          }
          return { results: [] as unknown as T[], success: true };
        }

        if (normSql.includes('FROM public_slug_redirects WHERE old_slug = ?')) {
          const oldSlug = String(boundValues[0]);
          const redir = redirectsMap.get(oldSlug);
          return { results: (redir ? [redir] : []) as unknown as T[], success: true };
        }

        if (normSql.includes('FROM public_products p WHERE p.is_active = 1 AND p.status = \'published\'')) {
          const activePublished = Array.from(productsMap.values()).filter(
            (p) => p.is_active === 1 && p.status === 'published'
          );
          return { results: activePublished as unknown as T[], success: true };
        }

        return { results: [] as unknown as T[], success: true };
      },
    };
  }

  return {
    prepare(sql: string) {
      return createStatement(sql);
    },
    async batch<T = any>(statements: D1PreparedStatement[]): Promise<any[]> {
      const results = [];
      for (const st of statements) {
        results.push(await st.run<T>());
      }
      return results;
    },
    async exec(sql: string): Promise<any> {
      return { count: 0, duration: 0 };
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },
    productsMap,
    redirectsMap,
    settingsMap,
    auditLogs,
  };
}

describe('ETAPA 6: Ciclo de Vida Completo de Sincronización Continua Supabase → Cloudflare D1', () => {
  const SYNC_SECRET = 'test-secret-at-least-32-chars-long-phase-6-lifecycle';
  let mockDb: ReturnType<typeof createSyncLifecycleMockDb>;
  let env: Env;

  beforeEach(() => {
    resetPublicCatalogCircuitBreaker();
    mockDb = createSyncLifecycleMockDb();
    env = {
      DB: mockDb,
      CATALOG_SYNC_SECRET: SYNC_SECRET,
      PUBLIC_SITE_URL: 'https://collectibles.uy',
    };
  });

  afterEach(() => {
    resetPublicCatalogCircuitBreaker();
    vi.restoreAllMocks();
  });

  it('1. ALTA DE PRODUCTO: Se sincroniza nuevo producto comercial y queda inmediatamente accesible en D1', async () => {
    const newProduct = {
      id: 'test-auto-prod-001',
      slug: 'figura-coleccionable-test-cyberpunk',
      title: 'Figura Coleccionable Test Cyberpunk 2077',
      currency: 'UYU',
      base_price: 2990,
      final_price_uyu: 2990,
      stock: 5,
      stock_status: 'in_stock',
      status: 'published',
      is_active: true,
      variants: [
        { id: 'var-uuid-auto-001', sku: 'CYBER-001', name: 'Standard', inventory_count: 5, price_adjustment: 0, is_active: true },
      ],
      primary_image_url: 'https://images.collectibles.uy/cyberpunk-test.jpg',
      images: [{ id: 'img-1', url: 'https://images.collectibles.uy/cyberpunk-test.jpg', is_primary: true }],
    };

    const pushRes = await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-test-alta-001',
        upsert_products: [newProduct],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    expect(pushRes.ok).toBe(true);
    expect(pushRes.records_affected).toBeGreaterThanOrEqual(1);

    // Consulta en el Worker del PDP
    const pdpRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-coleccionable-test-cyberpunk'),
      env
    );
    expect(pdpRes.status).toBe(200);
    const pdpData = await pdpRes.json();
    expect(pdpData.ok).toBe(true);
    expect(pdpData.product.title).toBe('Figura Coleccionable Test Cyberpunk 2077');
    expect(pdpData.product.base_price).toBe(2990);
    expect(pdpData.product.stock).toBe(5);
    expect(pdpData.product.stock_status).toBe('in_stock');
  });

  it('2. CAMBIO DE PRECIO: Se propaga nuevo precio a D1 preservando integridad comercial', async () => {
    // Producto existente a 2990 UYU
    mockDb.productsMap.set('test-auto-prod-001', {
      id: 'test-auto-prod-001',
      slug: 'figura-coleccionable-test-cyberpunk',
      title: 'Figura Coleccionable Test Cyberpunk 2077',
      currency: 'UYU',
      base_price: 2990,
      final_price_uyu: 2990,
      stock: 5,
      stock_status: 'in_stock',
      status: 'published',
      is_active: 1,
      variants_json: '[]',
      images_json: '[]',
    });

    // Actualización de precio a 3490 UYU
    const priceUpdate = {
      id: 'test-auto-prod-001',
      slug: 'figura-coleccionable-test-cyberpunk',
      title: 'Figura Coleccionable Test Cyberpunk 2077',
      currency: 'UYU',
      base_price: 3490,
      final_price_uyu: 3490,
      stock: 5,
      stock_status: 'in_stock',
      status: 'published',
      is_active: true,
    };

    await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-test-precio-002',
        upsert_products: [priceUpdate],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    const pdpRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-coleccionable-test-cyberpunk'),
      env
    );
    const pdpData = await pdpRes.json();
    expect(pdpData.product.base_price).toBe(3490);
    expect(pdpData.product.final_price_uyu).toBe(3490);
  });

  it('3. CAMBIO DE STOCK Y AGOTAMIENTO: Propaga disminución de stock y paso a out_of_stock', async () => {
    // 3.1. Disminución de stock a 2 unidades
    const stockDown = {
      id: 'test-auto-prod-001',
      slug: 'figura-coleccionable-test-cyberpunk',
      title: 'Figura Coleccionable Test Cyberpunk 2077',
      currency: 'UYU',
      base_price: 3490,
      final_price_uyu: 3490,
      stock: 2,
      stock_status: 'in_stock',
      status: 'published',
      is_active: true,
    };

    await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-test-stock-003',
        upsert_products: [stockDown],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    let pdpRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-coleccionable-test-cyberpunk'),
      env
    );
    let pdpData = await pdpRes.json();
    expect(pdpData.product.stock).toBe(2);
    expect(pdpData.product.stock_status).toBe('in_stock');

    // 3.2. Agotamiento a 0 unidades
    const stockZero = {
      ...stockDown,
      stock: 0,
      stock_status: 'out_of_stock',
    };

    await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-test-agotamiento-004',
        upsert_products: [stockZero],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    pdpRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-coleccionable-test-cyberpunk'),
      env
    );
    pdpData = await pdpRes.json();
    expect(pdpData.product.stock).toBe(0);
    expect(pdpData.product.stock_status).toBe('out_of_stock');
  });

  it('4. DESPUBLICACIÓN INMEDIATA: Retira el producto de listados y devuelve 404 en la ficha', async () => {
    // Producto actualmente publicado en D1
    mockDb.productsMap.set('test-auto-prod-001', {
      id: 'test-auto-prod-001',
      slug: 'figura-coleccionable-test-cyberpunk',
      title: 'Figura Coleccionable Test Cyberpunk 2077',
      is_active: 1,
      status: 'published',
    });

    // Señal de despublicación / baja inmediata
    const unpublishRes = await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-test-unpublish-005',
        unpublish_product_ids: ['test-auto-prod-001'],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    expect(unpublishRes.ok).toBe(true);

    // Consulta en el Worker: debe responder 404 porque is_active = 0
    const pdpRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-coleccionable-test-cyberpunk'),
      env
    );
    expect(pdpRes.status).toBe(404);
  });

  it('5. FALLO TEMPORAL DE CLOUDFLARE Y RECUPERACIÓN POSTERIOR: Circuit Breaker protege Supabase con snapshot cacheado', async () => {
    // Guardar snapshot previo en el proveedor del frontend
    const mockFetcherSuccess = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ok: true,
        source: 'cloudflare-d1',
        product: { id: 'test-auto-prod-001', slug: 'figura-coleccionable-test-cyberpunk', base_price: 3490 },
      }),
    });

    // 1. Petición exitosa que puebla caché
    const initial = await PublicCatalogProvider.getProductBySlug('figura-coleccionable-test-cyberpunk', mockFetcherSuccess as any);
    expect(initial.fromCache).toBe(false);
    expect(initial.data.product.base_price).toBe(3490);

    // 2. Avanzar tiempo más allá de ttlMs (60s) para que expire la caché fresca pero siga dentro de staleUntil (1h)
    vi.useFakeTimers();
    vi.advanceTimersByTime(65_000);

    // Simulación de 3 fallos de red consecutivos de Cloudflare
    const mockFetcherFail = vi.fn().mockRejectedValue(new Error('Network connection timeout to Cloudflare Edge'));

    for (let i = 0; i < 3; i++) {
      try {
        await PublicCatalogProvider.getProductBySlug('figura-coleccionable-test-cyberpunk', mockFetcherFail as any);
      } catch {
        // Ignorar fallo de red
      }
    }

    // 3. Con Circuit Breaker abierto y red caída, devuelve snapshot cacheado stale sin saturar Supabase
    const fallback = await PublicCatalogProvider.getProductBySlug('figura-coleccionable-test-cyberpunk', mockFetcherFail as any);
    expect(fallback.fromCache).toBe(true);
    expect(fallback.staleFallback).toBe(true);
    expect(fallback.data.product.base_price).toBe(3490);

    vi.useRealTimers();

    // 4. Recuperación: al resetear el circuit breaker y restablecerse Cloudflare, sirve datos frescos
    resetPublicCatalogCircuitBreaker();
    const mockFetcherRecovered = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ok: true,
        source: 'cloudflare-d1',
        product: { id: 'test-auto-prod-001', slug: 'figura-coleccionable-test-cyberpunk', base_price: 3990 },
      }),
    });

    const recovered = await PublicCatalogProvider.getProductBySlug('figura-coleccionable-test-cyberpunk', mockFetcherRecovered as any);
    expect(recovered.fromCache).toBe(false);
    expect(recovered.data.product.base_price).toBe(3990);
  });

  it('6. ELIMINACIÓN Y CAMBIO DE SLUG: Redirección 301 SEO preservada en D1', async () => {
    // Producto con nuevo slug
    mockDb.productsMap.set('test-auto-prod-001', {
      id: 'test-auto-prod-001',
      slug: 'cyberpunk-figura-edicion-definitiva',
      title: 'Cyberpunk Figura Edición Definitiva',
      is_active: 1,
      status: 'published',
      base_price: 3990,
      final_price_uyu: 3990,
      currency: 'UYU',
      variants_json: '[]',
      images_json: '[]',
    });

    // Upsert de redirección del slug antiguo
    await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-test-slug-redir-006',
        upsert_slug_redirects: [
          {
            old_slug: 'figura-coleccionable-test-cyberpunk',
            new_slug: 'cyberpunk-figura-edicion-definitiva',
            product_id: 'test-auto-prod-001',
          },
        ],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    // Consulta con el slug antiguo: el Worker debe resolver la redirección
    const redirRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-coleccionable-test-cyberpunk'),
      env
    );
    expect(redirRes.status).toBe(200);
    const redirData = await redirRes.json();
    expect(redirData.ok).toBe(true);
    expect(redirData.redirected_from).toBe('figura-coleccionable-test-cyberpunk');
    expect(redirData.canonical_slug).toBe('cyberpunk-figura-edicion-definitiva');
    expect(redirData.product.title).toBe('Cyberpunk Figura Edición Definitiva');
  });

  it('7. MONOTONIC VERSIONING EN UPSERT: Evento tardío/desfasado con updated_at menor es descartado sin sobreescribir', async () => {
    // Estado inicial en D1 con versión T2 (12:00:00Z) y precio 5000 UYU
    const initialProduct = {
      id: 'test-monotonic-prod-007',
      slug: 'figura-coleccionable-test-monotonic',
      title: 'Figura Monotonic Test',
      currency: 'UYU',
      base_price: 5000,
      final_price_uyu: 5000,
      stock: 3,
      stock_status: 'in_stock',
      status: 'published',
      is_active: true,
      updated_at: '2026-10-21T12:00:00.000Z',
    };

    await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-monotonic-t2',
        upsert_products: [initialProduct],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    // 1. Llega un reintento tardío desfasado con versión anterior T1 (11:00:00Z) y precio obsoleto 3000 UYU
    const staleProduct = {
      ...initialProduct,
      base_price: 3000,
      final_price_uyu: 3000,
      updated_at: '2026-10-21T11:00:00.000Z', // Timestamp ANTERIOR
    };

    await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-monotonic-stale-t1',
        upsert_products: [staleProduct],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    // El precio debe PERMANECER en 5000 (el update desfasado fue ignorado por SQLite WHERE)
    let pdpRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-coleccionable-test-monotonic'),
      env
    );
    let pdpData = await pdpRes.json();
    expect(pdpData.product.base_price).toBe(5000);

    // 2. Llega un evento posterior válido T3 (13:00:00Z) con nuevo precio 6000 UYU
    const newerProduct = {
      ...initialProduct,
      base_price: 6000,
      final_price_uyu: 6000,
      updated_at: '2026-10-21T13:00:00.000Z', // Timestamp POSTERIOR
    };

    await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-monotonic-newer-t3',
        upsert_products: [newerProduct],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    // Ahora sí se actualiza a 6000
    pdpRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-coleccionable-test-monotonic'),
      env
    );
    pdpData = await pdpRes.json();
    expect(pdpData.product.base_price).toBe(6000);
  });

  it('8. MONOTONIC VERSIONING EN DESPUBLICACIÓN: Despublicación con versión obsoleta no anula publicación más reciente', async () => {
    // Producto publicado a las 12:00:00Z
    mockDb.productsMap.set('test-unpub-prod-008', {
      id: 'test-unpub-prod-008',
      slug: 'figura-unpub-test',
      title: 'Figura Unpublish Test',
      is_active: 1,
      status: 'published',
      updated_at: '2026-10-21T12:00:00.000Z',
    });

    // 1. Intento de despublicación con timestamp obsoleto (11:00:00Z)
    await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-unpub-stale',
        unpublish_product_ids: [
          { id: 'test-unpub-prod-008', updated_at: '2026-10-21T11:00:00.000Z' },
        ],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    // Sigue activo porque la versión despublicada era más vieja que la publicación actual
    let pdpRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-unpub-test'),
      env
    );
    expect(pdpRes.status).toBe(200);

    // 2. Despublicación con timestamp posterior (13:00:00Z)
    await pushBatchToD1Worker({
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      dryRun: false,
      payload: {
        batch_id: 'batch-unpub-valid',
        unpublish_product_ids: [
          { id: 'test-unpub-prod-008', updated_at: '2026-10-21T13:00:00.000Z' },
        ],
      },
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    // Ahora sí queda archivado y devuelve 404
    pdpRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-unpub-test'),
      env
    );
    expect(pdpRes.status).toBe(404);
  });

  it('9. OUTBOX EXPONENTIAL BACKOFF Y DEAD LETTER QUEUE: Escalamiento seguro a 5 intentos', async () => {
    // 1. Comprobar progresión exponencial del calculador de retroceso
    const t0 = Date.now();
    const b1 = new Date(calculateNextBackoff(1, 15)).getTime() - t0;
    const b2 = new Date(calculateNextBackoff(2, 15)).getTime() - t0;
    const b3 = new Date(calculateNextBackoff(3, 15)).getTime() - t0;
    const b4 = new Date(calculateNextBackoff(4, 15)).getTime() - t0;
    const b5 = new Date(calculateNextBackoff(5, 15)).getTime() - t0;

    expect(Math.round(b1 / 1000)).toBe(15);
    expect(Math.round(b2 / 1000)).toBe(30);
    expect(Math.round(b3 / 1000)).toBe(60);
    expect(Math.round(b4 / 1000)).toBe(120);
    expect(Math.round(b5 / 1000)).toBe(240);

    // 2. Simulación de mock Supabase client con tabla outbox
    const outboxStore: any[] = [
      {
        id: 'outbox-uuid-1',
        event_type: 'stock_adjusted',
        entity_id: 'prod-fail-001',
        version_timestamp: '2026-10-21T12:00:00Z',
        attempts: 4,
        max_attempts: 5,
        status: 'failed',
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      },
    ];

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'd1_catalog_outbox') {
          return {
            select: () => ({
              in: () => ({
                lte: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: outboxStore, error: null }),
                  }),
                }),
              }),
            }),
            update: (patch: any) => ({
              eq: (col: string, val: any) => {
                const row = outboxStore.find((r) => r.id === val);
                if (row) Object.assign(row, patch);
                return Promise.resolve({ data: row, error: null });
              },
              in: (col: string, vals: any[]) => {
                for (const row of outboxStore) {
                  if (vals.includes(row.id)) Object.assign(row, patch);
                }
                return Promise.resolve({ data: outboxStore, error: null });
              },
            }),
          };
        }
        if (table === 'products') {
          return {
            select: () => ({
              in: () => Promise.resolve({ data: [], error: { message: 'Network Timeout' } }),
            }),
          };
        }
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      },
    };

    // Procesar lote con fallo simulado
    const batchRes = await processOutboxBatch(mockSupabase as any, { batchSize: 10 });
    expect(batchRes.ok).toBe(false);
    expect(batchRes.deadLetters).toBe(1);

    // El registro debe haber pasado a dead_letter porque attempts alcanzó max_attempts (5)
    expect(outboxStore[0].status).toBe('dead_letter');
    expect(outboxStore[0].attempts).toBe(5);
  });

  it('10. DEDUPLICACIÓN DE EVENTOS EN LOTE OUTBOX: Múltiples eventos para un producto se unifican', async () => {
    // 3 eventos en rápida sucesión para el mismo producto ID
    const outboxEvents = [
      {
        id: 'ev-1',
        event_type: 'stock_adjusted',
        entity_id: 'prod-dedup-001',
        version_timestamp: '2026-10-21T12:00:00Z',
        attempts: 0,
        max_attempts: 5,
        status: 'pending',
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      },
      {
        id: 'ev-2',
        event_type: 'stock_adjusted',
        entity_id: 'prod-dedup-001',
        version_timestamp: '2026-10-21T12:00:05Z',
        attempts: 0,
        max_attempts: 5,
        status: 'pending',
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      },
      {
        id: 'ev-3',
        event_type: 'price_changed',
        entity_id: 'prod-dedup-001',
        version_timestamp: '2026-10-21T12:00:10Z', // Más reciente
        attempts: 0,
        max_attempts: 5,
        status: 'pending',
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      },
    ];

    let queriedProductIds: string[] = [];

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'd1_catalog_outbox') {
          return {
            select: () => ({
              in: () => ({
                lte: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: outboxEvents, error: null }),
                  }),
                }),
              }),
            }),
            update: (patch: any) => ({
              in: (col: string, vals: any[]) => {
                for (const row of outboxEvents) {
                  if (vals.includes(row.id)) Object.assign(row, patch);
                }
                return Promise.resolve({ data: outboxEvents, error: null });
              },
              eq: (col: string, val: any) => {
                const row = outboxEvents.find((r) => r.id === val);
                if (row) Object.assign(row, patch);
                return Promise.resolve({ data: row, error: null });
              },
            }),
          };
        }
        if (table === 'products') {
          return {
            select: () => ({
              in: (col: string, ids: string[]) => {
                queriedProductIds = ids;
                return Promise.resolve({
                  data: [
                    {
                      id: 'prod-dedup-001',
                      slug: 'prod-dedup-slug',
                      title: 'Producto Deduplicado',
                      base_price: 4500,
                      status: 'published',
                      is_active: true,
                      updated_at: '2026-10-21T12:00:10Z',
                    },
                  ],
                  error: null,
                });
              },
            }),
          };
        }
        if (table === 'product_variants' || table === 'product_images') {
          return {
            select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
          };
        }
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      },
    };

    const res = await processOutboxBatch(mockSupabase as any, {
      batchSize: 10,
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    // Se procesaron los 3 eventos en el lote outbox
    expect(res.processed).toBe(3);
    // Pero en la base se consultó el producto una sola vez (deduplicación efectiva)
    expect(queriedProductIds).toEqual(['prod-dedup-001']);
  });

  it('11. PRESERVACIÓN DE MONEDA Y PRECIOS: USD para internacional (con conversión UYU) y UYU para local', async () => {
    // 1. Producto local en UYU
    const localProduct = {
      id: 'prod-local-uyu-011',
      slug: 'figura-artesanal-uruguaya',
      title: 'Figura Artesanal Uruguaya',
      base_price: 1850,
      is_international: false,
      status: 'published',
      is_active: true,
      updated_at: '2026-10-21T12:00:00Z',
    };

    // 2. Producto internacional en USD
    const intlProduct = {
      id: 'prod-intl-usd-011',
      slug: 'figura-importada-japon-011',
      title: 'Figura Importada Japón',
      base_price: 120, // 120 USD
      is_international: true,
      status: 'published',
      is_active: true,
      updated_at: '2026-10-21T12:00:00Z',
    };

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'products') {
          return {
            select: () => ({
              in: (col: string, ids: string[]) => {
                const found = [localProduct].filter((p) => ids.includes(p.id));
                return Promise.resolve({ data: found, error: null });
              },
            }),
          };
        }
        if (table === 'international_products') {
          return {
            select: () => ({
              in: (col: string, ids: string[]) => {
                return Promise.resolve({
                  data: [
                    {
                      id: 'prod-intl-usd-011',
                      slug: 'figura-importada-japon-011',
                      title: 'Figura Importada Japón',
                      base_price_usd: 120,
                      final_price_usd: 120,
                      final_price_uyu: 5220, // 120 * 43.5
                      currency: 'USD',
                      availability: 'in_stock',
                      status: 'published',
                    },
                  ],
                  error: null,
                });
              },
            }),
          };
        }
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      },
    };

    const syncRes = await syncProductsToCloudflareD1(
      ['prod-local-uyu-011', 'prod-intl-usd-011'],
      mockSupabase as any,
      {
        workerUrl: 'https://catalog.worker.internal',
        syncSecret: SYNC_SECRET,
        fetcher: ((url: string, init: any) =>
          workerApp.fetch(new Request(url, init), env)) as any,
      }
    );

    expect(syncRes.ok).toBe(true);
    expect(syncRes.recordsSynced).toBe(2);

    // Verificar en D1: Local = UYU
    const localRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-artesanal-uruguaya'),
      env
    );
    const localData = await localRes.json();
    expect(localData.product.currency).toBe('UYU');
    expect(localData.product.base_price).toBe(1850);
    expect(localData.product.final_price_uyu).toBe(1850);
    expect(localData.product.final_price_usd).toBeNull();

    // Verificar en D1: Internacional = USD con conversión UYU
    const intlRes = await workerApp.fetch(
      new Request('https://catalog.worker.internal/api/v1/products/figura-importada-japon-011'),
      env
    );
    const intlData = await intlRes.json();
    expect(intlData.product.currency).toBe('USD');
    expect(intlData.product.base_price).toBe(120);
    expect(intlData.product.final_price_usd).toBe(120);
    expect(intlData.product.final_price_uyu).toBe(5220);
    expect(intlData.product.is_international).toBe(true);
  });

  it('12. RESERVA ATÓMICA DE EVENTOS: FOR UPDATE SKIP LOCKED evita colisiones concurrentes', async () => {
    const queue = [
      { id: 'ev-atom-1', event_type: 'stock_adjusted', entity_id: 'prod-atom-1', version_timestamp: '2026-10-21T12:00:00Z', status: 'pending', next_attempt_at: new Date(Date.now() - 1000).toISOString() },
      { id: 'ev-atom-2', event_type: 'stock_adjusted', entity_id: 'prod-atom-2', version_timestamp: '2026-10-21T12:00:00Z', status: 'pending', next_attempt_at: new Date(Date.now() - 1000).toISOString() },
    ];

    let reservedByWorker1: any[] = [];
    let reservedByWorker2: any[] = [];

    const mockSupabase = {
      rpc: (fn: string, args: any) => {
        if (fn === 'claim_d1_outbox_batch') {
          // Simula FOR UPDATE SKIP LOCKED: reserva las disponibles que no estén en processing
          const available = queue.filter((r) => r.status === 'pending');
          const claimed = available.slice(0, args.p_batch_size);
          for (const item of claimed) {
            item.status = 'processing';
          }
          if (args.p_worker_id === 'worker-alpha') reservedByWorker1 = claimed;
          if (args.p_worker_id === 'worker-beta') reservedByWorker2 = claimed;
          return Promise.resolve({ data: claimed, error: null });
        }
        return Promise.resolve({ data: null, error: 'unknown_function' });
      },
      from: (table: string) => ({
        select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
        update: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    };

    // Worker 1 reclama 1 fila
    await processOutboxBatch(mockSupabase as any, {
      batchSize: 1,
      workerId: 'worker-alpha',
      syncSecret: SYNC_SECRET,
    });

    // Worker 2 reclama concurrentemente
    await processOutboxBatch(mockSupabase as any, {
      batchSize: 1,
      workerId: 'worker-beta',
      syncSecret: SYNC_SECRET,
    });

    // Subconjuntos disjuntos: ningún worker procesó la misma fila
    expect(reservedByWorker1.length).toBe(1);
    expect(reservedByWorker2.length).toBe(1);
    expect(reservedByWorker1[0].id).not.toBe(reservedByWorker2[0].id);
  });

  it('13. RECUPERACIÓN AUTOMÁTICA DE EVENTOS ATASCADOS (Heartbeat Timeout > 5m)', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const stuckEvents = [
      {
        id: 'ev-stuck-001',
        event_type: 'stock_adjusted',
        entity_id: 'prod-stuck-001',
        version_timestamp: '2026-10-21T12:00:00Z',
        status: 'processing', // Atascado
        locked_at: tenMinutesAgo,
        locked_by: 'dead-worker-pid-999',
        next_attempt_at: tenMinutesAgo,
      },
    ];

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'd1_catalog_outbox') {
          return {
            update: (patch: any) => ({
              eq: (col: string, val: any) => ({
                lte: (c2: string, v2: any) => {
                  // Simula recuperación: si status='processing' y locked_at <= 5m ago
                  for (const r of stuckEvents) {
                    if (r.status === 'processing') Object.assign(r, patch);
                  }
                  return Promise.resolve({ data: stuckEvents, error: null });
                },
              }),
              in: (col: string, vals: any[]) => {
                for (const r of stuckEvents) {
                  if (vals.includes(r.id)) Object.assign(r, patch);
                }
                return Promise.resolve({ data: stuckEvents, error: null });
              },
            }),
            select: () => ({
              in: () => ({
                lte: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: stuckEvents, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'products') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'prod-stuck-001',
                      slug: 'prod-stuck-slug',
                      title: 'Producto Recuperado',
                      base_price: 3500,
                      status: 'published',
                      is_active: true,
                      updated_at: '2026-10-21T12:00:00Z',
                    },
                  ],
                  error: null,
                }),
            }),
          };
        }
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      },
    };

    const res = await processOutboxBatch(mockSupabase as any, {
      batchSize: 10,
      workerUrl: 'https://catalog.worker.internal',
      syncSecret: SYNC_SECRET,
      fetcher: ((url: string, init: any) =>
        workerApp.fetch(new Request(url, init), env)) as any,
    });

    expect(res.ok).toBe(true);
    expect(res.processed).toBe(1);
    expect(stuckEvents[0].status).toBe('synced');
  });
});
