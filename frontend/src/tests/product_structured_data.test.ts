import { describe, it, expect } from 'vitest';
import seoPrerenderHandler from '../../../api/seo-prerender.js';

function createMockReqRes(query = {}) {
  const req = { query };
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let body = '';

  const res = {
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    send: (content: string) => {
      body = content;
      return res;
    },
    end: (content?: string) => {
      if (content) body = content;
      return res;
    }
  };

  return { req, res, getStatusCode: () => statusCode, getHeaders: () => headers, getBody: () => body };
}

describe('Product Structured Data Cleanliness & Single Entity Test Suite', { timeout: 20000 }, () => {
  it('Product page prerenders EXACTLY 1 Product entity and EXACTLY 1 BreadcrumbList entity with 0 duplicates', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({
      type: 'producto',
      slug: 'figura-de-acci-n-glamrock-fred-security-breach-47490-de-funko-4336'
    });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();

    const jsonLdMatches = [...body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    expect(jsonLdMatches.length).toBeGreaterThanOrEqual(2);

    let productCount = 0;
    let breadcrumbCount = 0;
    let productSchema: any = null;

    for (const m of jsonLdMatches) {
      const parsed = JSON.parse(m[1]);
      if (parsed['@type'] === 'Product') {
        productCount++;
        productSchema = parsed;
      } else if (parsed['@type'] === 'BreadcrumbList') {
        breadcrumbCount++;
      }
    }

    expect(productCount).toBe(1);
    expect(breadcrumbCount).toBe(1);

    // Verify required Product fields
    expect(productSchema.name).toBeDefined();
    expect(productSchema.description).toBeDefined();
    expect(productSchema.image).toBeDefined();
    expect(productSchema.sku).toBeDefined();
    expect(productSchema.url).toBeDefined();
    expect(productSchema.offers).toBeDefined();

    // Verify NO fake reviews or ratings
    expect(productSchema.review).toBeUndefined();
    expect(productSchema.aggregateRating).toBeUndefined();

    // Verify real shippingDetails
    const offers = productSchema.offers;
    expect(offers.shippingDetails).toBeDefined();
    expect(offers.shippingDetails['@type']).toBe('OfferShippingDetails');
    expect(offers.shippingDetails.shippingDestination.addressCountry).toBe('UY');
    expect(offers.shippingDetails.shippingRate.currency).toBe('UYU');

    // Verify real merchantReturnPolicy
    expect(offers.hasMerchantReturnPolicy).toBeDefined();
    expect(offers.hasMerchantReturnPolicy['@type']).toBe('MerchantReturnPolicy');
    expect(offers.hasMerchantReturnPolicy.applicableCountry).toBe('UY');
    expect(offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(5);
  });
});
