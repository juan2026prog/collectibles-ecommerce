import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import {
  createMerchantFeedHandler,
  resetMerchantFeedCache,
  generateMerchantFeedXml,
} from '../../../api/merchant-feed.js';

describe('Merchant Feed Resilience and Circuit Breakers', () => {
  beforeEach(() => {
    resetMerchantFeedCache();
    vi.restoreAllMocks();
  });

  const createMockResponse = () => {
    const res: any = {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(key: string, value: string) {
        this.headers[key] = value;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: string) {
        this.body = payload;
        return this;
      },
      json(payload: any) {
        this.body = JSON.stringify(payload);
        return this;
      },
    };
    return res;
  };

  it('generates a valid RSS XML feed from database products with 200 OK', async () => {
    const mockClient = {
      from(table: string) {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          range: () => builder,
          then(resolve: any) {
            if (table === 'products') {
              return resolve({
                data: [
                  {
                    id: 'prod-1',
                    title: 'Goku Super Saiyan Figure',
                    slug: 'goku-super-saiyan',
                    description: 'Figura de colección 18cm',
                    base_price: 1500,
                    condition: 'new',
                    brand_id: 'brand-1',
                  },
                ],
                error: null,
              });
            }
            if (table === 'product_images') {
              return resolve({
                data: [
                  {
                    product_id: 'prod-1',
                    url: 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/product-images/goku.jpg',
                    is_primary: true,
                  },
                ],
                error: null,
              });
            }
            if (table === 'brands') {
              return resolve({
                data: [{ id: 'brand-1', name: 'Bandai' }],
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
    const res = createMockResponse();

    await handler({ method: 'GET' }, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/xml; charset=utf-8');
    expect(res.headers['X-Feed-Source']).toBe('fresh');
    expect(res.headers['CDN-Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=14400');
    expect(res.body).toContain('<title>Collectibles Uruguay - Google Merchant Feed</title>');
    expect(res.body).toContain('<g:title>Goku Super Saiyan Figure</g:title>');
    expect(res.body).toContain('<g:price>1500.00 UYU</g:price>');
    expect(res.body).toContain('<g:brand>Bandai</g:brand>');
  });

  it('serves from in-memory cache on subsequent requests without querying database', async () => {
    let queryCount = 0;
    const mockClient = {
      from(table: string) {
        queryCount++;
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          range: () => builder,
          then(resolve: any) {
            return resolve({ data: [], error: null });
          },
        };
        return builder;
      },
    };

    const handler = createMerchantFeedHandler(() => mockClient);

    // First request: hits database
    const res1 = createMockResponse();
    await handler({ method: 'GET' }, res1);
    expect(res1.statusCode).toBe(200);
    expect(res1.headers['X-Feed-Source']).toBe('fresh');
    const initialQueryCount = queryCount;
    expect(initialQueryCount).toBeGreaterThan(0);

    // Second request: served from in-memory cache
    const res2 = createMockResponse();
    await handler({ method: 'GET' }, res2);
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['X-Feed-Source']).toBe('memory-cache');
    expect(queryCount).toBe(initialQueryCount); // No additional queries made!
  });

  it('deduplicates in-flight concurrent requests so database is only queried once', async () => {
    let productQueries = 0;
    const mockClient = {
      from(table: string) {
        if (table === 'products') productQueries++;
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          range: () => builder,
          then(resolve: any) {
            // Simulate slight network latency
            return new Promise(r => setTimeout(() => r(resolve({ data: [], error: null })), 20));
          },
        };
        return builder;
      },
    };

    const handler = createMerchantFeedHandler(() => mockClient);

    // Fire 5 concurrent requests simultaneously
    const resList = [createMockResponse(), createMockResponse(), createMockResponse(), createMockResponse(), createMockResponse()];
    await Promise.all(resList.map(res => handler({ method: 'GET' }, res)));

    for (const res of resList) {
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<title>Collectibles Uruguay - Google Merchant Feed</title>');
    }
    // Only 1 fetch cycle was executed
    expect(productQueries).toBe(1);
  });

  it('falls back to stale cached XML with 200 OK when database fails during refresh', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = false;
    const mockClient = {
      from(table: string) {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          range: () => builder,
          then(resolve: any, reject: any) {
            if (fail) {
              return reject(new Error('Connection terminated unexpectedly: 57014'));
            }
            if (table === 'products') {
              return resolve({
                data: [{ id: 'p-cached', title: 'Cached Product', slug: 'cached-p', base_price: 990, brand_id: null }],
                error: null,
              });
            }
            if (table === 'product_images') {
              return resolve({
                data: [{ product_id: 'p-cached', url: 'https://cobtsgkwcftvexaarwmo.supabase.co/img.jpg', is_primary: true }],
                error: null,
              });
            }
            return resolve({ data: [], error: null });
          },
        };
        return builder;
      },
    };

    const handlerWithStale = createMerchantFeedHandler(() => mockClient);
    // Execute with fail=false first to prime memory and disk cache
    fail = false;
    await handlerWithStale({ method: 'GET' }, createMockResponse());

    // Now fail=true and simulate cache expiry:
    fail = true;
    const resFallback = createMockResponse();
    const realDateNow = Date.now;
    try {
      Date.now = () => realDateNow() + 20 * 60 * 1000; // 20 mins later (>15m TTL)
      await handlerWithStale({ method: 'GET' }, resFallback);
      expect(resFallback.statusCode).toBe(200);
      expect(resFallback.headers['X-Feed-Source']).toBe('stale-cache-fallback');
      expect(resFallback.body).toContain('Cached Product');
    } finally {
      Date.now = realDateNow;
    }
  });

  it('recovers from /tmp disk cache when RAM is empty and database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Write disk snapshot manually to simulate a cold lambda container in the same microVM
    const diskPath = '/tmp/collectibles_merchant_feed.xml';
    const sampleDiskXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Collectibles Uruguay - Google Merchant Feed</title>
    <link>https://collectibles.uy</link>
    <description>Feed dinámico oficial de productos de Collectibles Uruguay</description>
    <item>
      <g:id>prod-disk-1</g:id>
      <g:title>Disk Recovered Product</g:title>
    </item>
  </channel>
</rss>`;
    fs.writeFileSync(diskPath, sampleDiskXml, 'utf8');

    // Create handler with completely failing database on cold start
    const failingClient = {
      from() {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          range: () => builder,
          then(_: any, reject: any) {
            return reject(new Error('PostgreSQL down'));
          },
        };
        return builder;
      },
    };

    const handler = createMerchantFeedHandler(() => failingClient);
    const res = createMockResponse();

    await handler({ method: 'GET' }, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Feed-Source']).toBe('disk-cache-fallback');
    expect(res.body).toContain('Disk Recovered Product');
  });

  it('returns HTTP 503 instead of 200 with empty feed when cold start has NO previous feed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Ensure both RAM and disk are completely clean
    resetMerchantFeedCache();

    const failingClient = {
      from() {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          range: () => builder,
          then(_: any, reject: any) {
            return reject(new Error('PostgreSQL host unreachable: ECONNREFUSED'));
          },
        };
        return builder;
      },
    };

    const handler = createMerchantFeedHandler(() => failingClient);
    const res = createMockResponse();

    await handler({ method: 'GET' }, res);

    // CRITICAL: Must return 503 so Google Merchant preserves existing indexed products
    // instead of receiving an empty 200 OK feed and unindexing everything!
    expect(res.statusCode).toBe(503);
    expect(res.headers['Retry-After']).toBe('300');
    expect(res.headers['Cache-Control']).toBe('no-store, no-cache, must-revalidate');
    expect(res.body).toContain('Merchant feed temporarily unavailable');
  });

  it('clears in-memory and disk cache when purge query parameter is passed', async () => {
    const mockClient = {
      from() {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          range: () => builder,
          then(resolve: any) {
            return resolve({
              data: [{ id: 'p-fresh', title: 'Fresh Product', slug: 'p-fresh', base_price: 100 }],
              error: null,
            });
          },
        };
        return builder;
      },
    };

    const handler = createMerchantFeedHandler(() => mockClient);
    // 1. Initial request (populates memory cache)
    await handler({ method: 'GET' }, createMockResponse());

    // 2. Request with purge=true
    const purgeRes = createMockResponse();
    await handler({ method: 'GET', query: { purge: 'true' } }, purgeRes);

    expect(purgeRes.statusCode).toBe(200);
    expect(purgeRes.headers['X-Feed-Source']).toBe('fresh');
  });
});
