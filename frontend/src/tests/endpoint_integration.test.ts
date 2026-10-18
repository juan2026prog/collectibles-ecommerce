import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCatalogHandler } from '../../../api/_lib/public-catalog-handler.js';
import { createCatalogRepository, prepareCatalog } from '../../../api/_lib/public-catalog.js';
import { createMerchantFeedHandler, resetMerchantFeedCache } from '../../../api/merchant-feed.js';

const fixtureCatalog = () => ({
  categories: [
    { id: 'cat-1', name: 'Figuras', slug: 'figuras', parent_id: null },
    { id: 'cat-sub', name: 'Anime', slug: 'anime', parent_id: 'cat-1' },
  ],
  brands: [
    { id: 'brand-1', name: 'Bandai', slug: 'bandai' },
  ],
  licenses: [
    { id: 'lic-1', name: 'Dragon Ball', slug: 'dragon-ball' },
  ],
  themes: [
    { id: 'th-1', name: 'Shonen', slug: 'shonen' },
  ],
  licenseThemes: [
    { license_id: 'lic-1', theme_id: 'th-1' },
  ],
  groups: [],
  internationalEnabled: true,
  local: [
    {
      id: 'p-local-1',
      title: 'Goku Ultra Instinct',
      slug: 'goku-ui',
      description: 'Figura de colección Bandai',
      status: 'published',
      is_active: true,
      category_id: 'cat-sub',
      brand_id: 'brand-1',
      license_id: 'lic-1',
      base_price: 2500,
      condition: 'new',
      badge: 'Destacado',
      is_featured: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'p-local-2',
      title: 'Vegeta SSJ Blue',
      slug: 'vegeta-blue',
      description: 'Figura articulada',
      status: 'published',
      is_active: true,
      category_id: 'cat-sub',
      brand_id: 'brand-1',
      license_id: 'lic-1',
      base_price: 3200,
      condition: 'used',
      badge: null,
      is_featured: false,
      created_at: '2026-01-02T00:00:00Z',
    },
  ],
  international: [
    {
      id: 'p-intl-1',
      title: 'Luffy Gear 5',
      description: 'Importado One Piece',
      status: 'published',
      brand: 'Bandai',
      final_price_usd: 50,
      collectibles_category_id: 'cat-1',
      collectibles_subcategory_id: 'cat-sub',
      created_at: '2026-01-03T00:00:00Z',
    },
  ],
});

const createMockResponse = () => {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    send(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('End-to-End Serverless Endpoint Integration Tests', () => {
  beforeEach(() => {
    resetMerchantFeedCache();
    vi.restoreAllMocks();
  });

  describe('/api/public-catalog Endpoint Integration', () => {
    it('handles complete search, facet aggregation, and card hydration flow (200 OK)', async () => {
      const catalog = prepareCatalog(fixtureCatalog());
      const client = {
        rpc: async () => ({ data: [], error: null }),
        from(table: string) {
          const builder: any = {
            select: () => builder,
            in: () => builder,
            eq: () => builder,
            then(resolve: any) {
              if (table === 'products') {
                return resolve({
                  data: [
                    {
                      id: 'p-local-1',
                      title: 'Goku Ultra Instinct',
                      slug: 'goku-ui',
                      base_price: 2500,
                      images: [{ id: 'img-1', url: 'https://cdn.example.com/goku.jpg', is_primary: true }],
                      variants: [{ id: 'var-1', sku: 'GOKU-UI', price_adjustment: 0, inventory_count: 5 }],
                    },
                  ],
                  error: null,
                });
              }
              return resolve({ data: [], error: null });
            },
          };
          return builder;
        },
      };

      const handler = createCatalogHandler(() => ({
        get: async () => ({ catalog, stale: false, age_ms: 1000 }),
        client,
      } as any));

      const req = {
        method: 'GET',
        query: { search: 'goku', limit: '10', offset: '0' },
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers['X-Catalog-Snapshot']).toBe('fresh');
      expect(res.headers['X-Catalog-Stale-Severity']).toBe('fresh');
      expect(res.headers['X-Catalog-Version']).toBe('2026-10-stability-2');
      expect(res.body.count).toBe(1);
      expect(res.body.products[0].title).toBe('Goku Ultra Instinct');
      expect(res.body.products[0].variants[0].inventory_count).toBe(5);
      expect(res.body.snapshot_meta).toEqual({
        stale: false,
        age_seconds: 1,
        severity: 'fresh',
        checkout_revalidation_required: false,
        cards_degraded: false,
      });
    });

    it('rejects unsupported HTTP methods with 405 Method Not Allowed', async () => {
      const handler = createCatalogHandler();
      const res = createMockResponse();

      await handler({ method: 'POST', query: {} }, res);

      expect(res.statusCode).toBe(405);
      expect(res.headers['Allow']).toBe('GET, HEAD');
      expect(res.body).toEqual({ error: 'Method not allowed' });
    });

    it('rejects invalid or abusive query parameters with 400 Bad Request', async () => {
      const handler = createCatalogHandler();
      const res = createMockResponse();

      await handler({ method: 'GET', query: { limit: 'invalid-non-number' } }, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid catalog filters' });
    });

    it('handles card query timeouts with graceful degradation (200 OK + cards-fallback)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const catalog = prepareCatalog(fixtureCatalog());
      const client = {
        rpc: async () => ({ data: [], error: null }),
        from() {
          const builder: any = {
            select: () => builder,
            in: () => builder,
            eq: () => builder,
            abortSignal: () => builder,
            then(_: any, reject: any) {
              return reject(new Error('Query timeout (57014)'));
            },
          };
          return builder;
        },
      };

      const handler = createCatalogHandler(() => ({
        get: async () => ({ catalog, stale: true, age_ms: 120000 }),
        client,
      } as any));

      const req = {
        method: 'GET',
        query: { availability: 'all' },
      };
      const res = createMockResponse();

      await handler(req, res);

      // Must degrade gracefully to 200 OK without failing the page
      expect(res.statusCode).toBe(200);
      expect(res.headers['X-Catalog-Degraded']).toBe('cards-fallback');
      expect(res.headers['X-Catalog-Stale-Severity']).toBe('soft');
      expect(res.headers['CDN-Cache-Control']).toBe('public, s-maxage=30, stale-while-revalidate=60');
      expect(res.body.products).toHaveLength(3); // 2 local + 1 intl
      // Truthful degraded attributes
      expect(res.body.products[0]).toMatchObject({
        is_degraded: true,
        stock_verified: false,
        base_price: 2500,
      });
      expect(res.body.snapshot_meta).toMatchObject({
        stale: true,
        cards_degraded: true,
        severity: 'soft',
        checkout_revalidation_required: true,
      });
    });
  });

  describe('/api/merchant-feed Endpoint Integration', () => {
    it('returns full XML feed for GET and empty body for HEAD', async () => {
      const mockClient = {
        from(table: string) {
          const builder: any = {
            select: () => builder,
            eq: () => builder,
            range: () => builder,
            then(resolve: any) {
              if (table === 'products') {
                return resolve({
                  data: [{ id: 'p1', title: 'Product One', slug: 'p1', base_price: 100 }],
                  error: null,
                });
              }
              return resolve({ data: [], error: null });
            },
          };
          return builder;
        },
      };

      const handler = createMerchantFeedHandler(() => mockClient);

      // GET request
      const getRes = createMockResponse();
      await handler({ method: 'GET' }, getRes);
      expect(getRes.statusCode).toBe(200);
      expect(getRes.body).toContain('<rss version="2.0"');

      // HEAD request
      const headRes = createMockResponse();
      await handler({ method: 'HEAD' }, headRes);
      expect(headRes.statusCode).toBe(200);
      expect(headRes.body).toBe('');
      expect(headRes.headers['Content-Type']).toBe('application/xml; charset=utf-8');
    });

    it('returns 503 Service Unavailable when cold start experiences database failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      resetMerchantFeedCache();

      const failingClient = {
        from() {
          const builder: any = {
            select: () => builder,
            eq: () => builder,
            range: () => builder,
            then(_: any, reject: any) {
              return reject(new Error('Connection timeout to Supabase'));
            },
          };
          return builder;
        },
      };

      const handler = createMerchantFeedHandler(() => failingClient);
      const res = createMockResponse();

      await handler({ method: 'GET' }, res);

      expect(res.statusCode).toBe(503);
      expect(res.headers['Retry-After']).toBe('300');
      expect(res.body).toContain('Merchant feed temporarily unavailable');
    });
  });
});
