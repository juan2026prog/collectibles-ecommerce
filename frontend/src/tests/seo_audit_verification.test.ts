import { describe, it, expect } from 'vitest';
import { createSeoPrerenderHandler } from '../../../api/seo-prerender.js';
import { createSitemapHandler } from '../../../api/sitemap.js';
import { generateProductSchema, generateBreadcrumbs } from '../seo/seoConfig';

function createFakeSeoSupabase() {
  return {
    from(table: string) {
      const filters: Record<string, any> = {};
      let isSingle = false;
      const builder: any = {
        select() { return builder; },
        eq(k: string, v: any) { filters[k] = v; return builder; },
        in() { return builder; },
        neq() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        range() { return builder; },
        abortSignal() { return builder; },
        maybeSingle() { isSingle = true; return builder; },
        single() { isSingle = true; return builder; },
        then(onFulfilled: any, onRejected: any) {
          return Promise.resolve().then(() => {
            if (table === 'categories') {
              const cats = [
                { id: 'cccccccc-cccc-4ccc-8ccc-000000000001', name: 'Figuras de Acción', slug: 'figuras', is_active: true, status: 'active', description: 'Figuras articuladas coleccionables' },
                { id: 'cccccccc-cccc-4ccc-8ccc-000000000002', name: 'TCG', slug: 'tcg', is_active: true, status: 'active', description: 'Cartas coleccionables TCG' },
              ];
              if (filters['parent_id']) {
                return { data: [], error: null };
              }
              if (isSingle) {
                const found = cats.find((c) => c.slug === filters['slug'] || c.id === filters['id']) || null;
                return { data: found, error: null };
              }
              return { data: cats, error: null };
            }
            if (table === 'brands') {
              const brands = [
                { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', name: 'Funko', slug: 'funko', is_active: true, status: 'approved', description: 'Figuras Funko Pop oficiales' },
                { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', name: 'NECA', slug: 'neca', is_active: true, status: 'approved', description: 'Figuras NECA Ultimate oficiales' },
              ];
              if (isSingle) {
                const found = brands.find((b) => b.slug === filters['slug'] || b.id === filters['id']) || null;
                return { data: found, error: null };
              }
              return { data: brands, error: null };
            }
            if (table === 'products') {
              if (isSingle) {
                return { data: null, error: null };
              }
              return {
                data: [
                  {
                    id: '11111111-1111-4111-8111-111111111111',
                    title: 'NECA Ultimate Chucky',
                    slug: 'neca-ultimate-chucky-7-pulgadas',
                    base_price: 3490,
                    is_active: true,
                    status: 'published',
                    updated_at: '2026-11-01T00:00:00Z',
                  },
                ],
                error: null,
              };
            }
            return { data: isSingle ? null : [], error: null };
          }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

const seoPrerenderHandler = createSeoPrerenderHandler(createFakeSeoSupabase);
const sitemapHandler = createSitemapHandler(createFakeSeoSupabase);

function createMockReqRes(query = {}) {
  const req = { query, headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } };
  let statusCode = 200;
  const headers: Record<string, string> = {};
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
    },
  };

  return { req, res, getStatusCode: () => statusCode, getHeaders: () => headers, getBody: () => body };
}

describe('SEO & Serverless Prerender Verification Test Suite', { timeout: 30000 }, () => {
  it('FASE 2 & 3: sitemap.xml returns valid XML with active products and correct domain', async () => {
    const { req, res, getStatusCode, getHeaders, getBody } = createMockReqRes();
    await sitemapHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    expect(getHeaders()['content-type']).toContain('application/xml');

    const body = getBody();
    expect(body).toMatch(/<sitemapindex|<urlset/);
    expect(body).toContain('https://collectibles.com.uy/');
    expect(body).not.toContain('vercel.app');
    expect(body).not.toContain('https://collectibles.uy');
    expect(body).not.toContain('www.collectibles.com.uy');
  });

  it('FASE 2 & 3: Home page prerenders title, meta, canonical, H1, Organization & WebSite schemas', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({ type: 'home' });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();
    expect(body).toContain('<title>Collectibles Uruguay | Figuras de Acción, Funko y Coleccionables</title>');
    expect(body).toContain('<link rel="canonical" href="https://collectibles.com.uy"');
    expect(body).not.toContain('Juguetes Retro Uruguay');
    expect(body).toContain('<h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">Figuras de Acción, Funko y Coleccionables en Uruguay | Collectibles</h1>');
    expect(body).toContain('"name": "Collectibles"');
    expect(body).toContain('"alternateName": "Collectibles Uruguay"');
    expect(body).toContain('https://listado.mercadolibre.com.uy/_CustId_2013898864');
    expect(body).toContain('https://instagram.com/collectibles.uy');
    expect(body).toContain('https://facebook.com/collectibles.uy');
  });

  it('FASE 4: Figuras de Acción category prerenders title, canonical and H1', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({
      type: 'categoria',
      slug: 'figuras',
    });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();
    expect(body).toContain('<title>Figuras de Acción en Uruguay | NECA, Bandai y más | Collectibles</title>');
    expect(body).toContain('<link rel="canonical" href="https://collectibles.com.uy/categoria/figuras"');
    expect(body).toContain('<h1');
  });

  it('FASE 5 & 6: Funko and NECA brand pages prerender canonical and dedicated metadata', async () => {
    const { req: fReq, res: fRes, getStatusCode: fStatus, getBody: fBody } = createMockReqRes({
      type: 'marca',
      slug: 'funko',
    });
    await seoPrerenderHandler(fReq as any, fRes as any);
    expect(fStatus()).toBe(200);
    expect(fBody()).toContain('<title>Funko Pop Uruguay | Figuras y Coleccionables Funko | Collectibles</title>');
    expect(fBody()).toContain('<link rel="canonical" href="https://collectibles.com.uy/marca/funko"');

    const { req: nReq, res: nRes, getStatusCode: nStatus, getBody: nBody } = createMockReqRes({
      type: 'marca',
      slug: 'neca',
    });
    await seoPrerenderHandler(nReq as any, nRes as any);
    expect(nStatus()).toBe(200);
    expect(nBody()).toContain('<title>NECA Uruguay | Figuras de Acción NECA | Collectibles</title>');
    expect(nBody()).toContain('<link rel="canonical" href="https://collectibles.com.uy/marca/neca"');
  });

  it('FASE 8 & 9: Product page schema and helpers produce valid Product, Offer and UYU currency', () => {
    const mockProduct = {
      id: 'prod-uuid-1234',
      title: 'NECA Ultimate Chucky 7 Pulgadas',
      slug: 'neca-ultimate-chucky-7-pulgadas',
      base_price: 3490,
      currency: 'UYU',
      stock_quantity: 5,
      is_active: true,
      description: 'Figura articulada de colección oficial NECA Ultimate Chucky.',
      gtin: '0634482421123',
    };

    const schema = generateProductSchema(mockProduct, { name: 'NECA' }, { name: 'Figuras de Acción', slug: 'figuras' }, ['https://collectibles.com.uy/images/chucky.jpg']);

    expect(schema['@type']).toBe('Product');
    expect(schema.name).toBe('NECA Ultimate Chucky 7 Pulgadas');
    expect(schema.sku).toBe('prod-uuid-1234');
    expect(schema.brand.name).toBe('NECA');
    expect(schema.gtin13).toBe('0634482421123');

    const offer = schema.offers;
    expect(offer['@type']).toBe('Offer');
    expect(offer.price).toBe(3490);
    expect(offer.priceCurrency).toBe('UYU');
    expect(offer.availability).toBe('https://schema.org/InStock');
    expect(offer.itemCondition).toBe('https://schema.org/NewCondition');
  });

  it('FASE 5: BreadcrumbList schema guarantees item property in all intermediate levels (Fix GSC Error)', () => {
    const breadcrumbs = generateBreadcrumbs('producto', {
      title: 'Figura NECA Predator',
      slug: 'figura-neca-predator',
      category: { name: 'Figuras de Acción', slug: 'figuras' },
    });

    expect(breadcrumbs['@type']).toBe('BreadcrumbList');
    expect(breadcrumbs.itemListElement.length).toBe(3);
    breadcrumbs.itemListElement.forEach((item: any) => {
      expect(item.item).toBeDefined();
      expect(item.item).toContain('https://collectibles.com.uy/');
    });
  });

  it('FASE 21: Non-existent product/category/brand returns real HTTP 404 and noindex (No Soft 404)', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({
      type: 'producto',
      slug: 'producto-totalmente-inexistente-xyz-999999',
    });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(404);
    const body = getBody();
    expect(body).toContain('404 - Página No Encontrada');
    expect(body).toContain('noindex');
  });
});
