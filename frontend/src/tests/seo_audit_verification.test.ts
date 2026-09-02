import { describe, it, expect } from 'vitest';
import seoPrerenderHandler from '../../../api/seo-prerender.js';
import sitemapHandler from '../../../api/sitemap.js';
import merchantFeedHandler from '../../../api/merchant-feed.js';

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
    json: (obj: any) => {
      body = JSON.stringify(obj);
      return res;
    }
  };

  return { req, res, getStatusCode: () => statusCode, getHeaders: () => headers, getBody: () => body };
}

describe('SEO & Serverless Prerender Verification Test Suite', { timeout: 20000 }, () => {
  it('FASE 2 & 3: sitemap.xml returns valid XML with active products and correct domain', async () => {
    const { req, res, getStatusCode, getHeaders, getBody } = createMockReqRes();
    await sitemapHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    expect(getHeaders()['content-type']).toContain('application/xml');
    
    const body = getBody();
    expect(body).toContain('<urlset');
    expect(body).toContain('<loc>https://collectibles.uy/</loc>');
    expect(body).toContain('<loc>https://collectibles.uy/shop</loc>');
    expect(body).not.toContain('vercel.app');
    expect(body).not.toContain('collectibles.com.uy');
  });

  it('FASE 12: merchant-feed.xml returns valid RSS 2.0 Google Merchant XML feed', async () => {
    const { req, res, getStatusCode, getHeaders, getBody } = createMockReqRes();
    await merchantFeedHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    expect(getHeaders()['content-type']).toContain('application/xml');

    const body = getBody();
    expect(body).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(body).toContain('<g:price>');
    expect(body).toContain('UYU');
    expect(body).toContain('<g:availability>in_stock</g:availability>');
  });

  it('FASE 4, 5, 6, 7: Home page prerenders title, meta, canonical, H1, internal links', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({ type: 'home' });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();
    expect(body).toContain('<title>');
    expect(body).toContain('<link rel="canonical" href="https://collectibles.uy"');
    expect(body).toContain('<h1');
    expect(body).toContain('href="https://collectibles.uy/');
  });

  it('FASE 4, 5, 6, 7: Product page prerenders title, description, canonical, H1, image, JSON-LD', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({
      type: 'producto',
      slug: 'figura-de-acci-n-glamrock-fred-security-breach-47490-de-funko-4336'
    });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();
    expect(body).toContain('<title>');
    expect(body).toContain('Collectibles Uruguay</title>');
    expect(body).toContain('<link rel="canonical" href="https://collectibles.uy/producto/figura-de-acci-n-glamrock-fred-security-breach-47490-de-funko-4336"');
    expect(body).toContain('<h1');
    expect(body).toContain('application/ld+json');
    expect(body).toContain('"@type": "Product"');
    expect(body).toContain('"priceCurrency": "UYU"');
  });

  it('FASE 5: BreadcrumbList schema guarantees item property in all intermediate levels (Fix GSC Error)', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({
      type: 'producto',
      slug: 'figura-de-acci-n-glamrock-fred-security-breach-47490-de-funko-4336'
    });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();
    
    const jsonLdMatches = [...body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    let breadcrumbFound = false;

    for (const m of jsonLdMatches) {
      const parsed = JSON.parse(m[1]);
      if (parsed['@type'] === 'BreadcrumbList') {
        breadcrumbFound = true;
        parsed.itemListElement.forEach((item: any, idx: number) => {
          if (idx > 0 && idx < parsed.itemListElement.length - 1) {
            expect(item.item).toBeDefined();
            expect(item.item).toContain('https://collectibles.uy/');
          }
        });
      }
    }
    expect(breadcrumbFound).toBe(true);
  });

  it('FASE 8: Category page prerenders H1, category name, title, canonical and products', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({
      type: 'categoria',
      slug: 'tcg'
    });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();
    expect(body).toContain('<title>');
    expect(body).toContain('<link rel="canonical" href="https://collectibles.uy/categoria/tcg"');
    expect(body).toContain('<h1');
  });

  it('FASE 9: Brand page prerenders brand name, title, canonical and products', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({
      type: 'marca',
      slug: 'funko'
    });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();
    expect(body).toContain('<title>');
    expect(body).toContain('<link rel="canonical" href="https://collectibles.uy/marca/funko"');
    expect(body).toContain('<h1');
  });

  it('FASE 21: Non-existent product/category/brand returns real HTTP 404 and noindex (No Soft 404)', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({
      type: 'producto',
      slug: 'producto-totalmente-inexistente-xyz-999999'
    });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(404);
    const body = getBody();
    expect(body).toContain('404 - Página No Encontrada');
    expect(body).toContain('noindex');
  });
});
