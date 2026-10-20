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
            final_price_uyu: finalPriceUyu,
            status,
            is_active: isActive,
            stock,
            stock_status: stockStatus,
            variants_json: String(boundValues[61] || '[]'),
            primary_image_url: boundValues[58] ? String(boundValues[58]) : null,
            images_json: String(boundValues[59] || '[]'),
            created_at: boundValues[74] || new Date().toISOString(),
            updated_at: boundValues[75] || new Date().toISOString(),
          };
          productsMap.set(id, record);
          return { success: true, results: [] as T[] };
        }

        if (normSql.includes('UPDATE public_products SET is_active = 0, status = \'archived\'')) {
          const id = String(boundValues[0]);
          const prod = productsMap.get(id);
          if (prod) {
            prod.is_active = 0;
            prod.status = 'archived';
            productsMap.set(id, prod);
          }
          return { success: true, results: [] as T[] };
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
});
