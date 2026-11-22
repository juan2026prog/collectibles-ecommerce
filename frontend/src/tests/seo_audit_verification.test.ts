import { describe, it, expect, vi } from 'vitest';

// Isolate SEO prerender & sitemap tests from external Staging/Prod Supabase network calls
vi.mock('../../../api/_lib/public-supabase.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  const CAT_FIGURAS_ID = '11111111-1111-4111-8111-111111111111';
  const BRAND_FUNKO_ID = '22222222-2222-4222-8222-222222222222';
  const BRAND_NECA_ID = '33333333-3333-4333-8333-333333333333';

  const mockCategories = [
    { id: CAT_FIGURAS_ID, name: 'Figuras de Acción', slug: 'figuras', description: 'Figuras de acción coleccionables', is_active: true, status: 'approved', parent_id: null },
  ];
  const mockBrands = [
    { id: BRAND_FUNKO_ID, name: 'Funko', slug: 'funko', description: 'Funko Pop coleccionables', is_active: true, is_public: true, status: 'approved' },
    { id: BRAND_NECA_ID, name: 'NECA', slug: 'neca', description: 'Figuras de acción NECA', is_active: true, is_public: true, status: 'approved' },
  ];
  const mockProducts = [
    {
      id: '44444444-4444-4444-8444-444444444444',
      slug: 'neca-ultimate-chucky',
      title: 'NECA Ultimate Chucky',
      base_price: 3490,
      status: 'published',
      is_active: true,
      brand_id: BRAND_NECA_ID,
      category_id: CAT_FIGURAS_ID,
      updated_at: '2026-11-20T00:00:00Z',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      slug: 'funko-pop-batman',
      title: 'Funko Pop Batman',
      base_price: 1290,
      status: 'published',
      is_active: true,
      brand_id: BRAND_FUNKO_ID,
      category_id: CAT_FIGURAS_ID,
      updated_at: '2026-11-20T00:00:00Z',
    },
  ];

  function createTableQuery(table: string) {
    const filters: Array<{ op: string; col: string; val: any }> = [];
    let resultMode: 'many' | 'single' | 'maybeSingle' = 'many';
    const getRows = () => {
      let rows: any[] =
        table === 'categories' ? [...mockCategories] :
        table === 'brands' ? [...mockBrands] :
        table === 'products' ? [...mockProducts] :
        [];
      for (const f of filters) {
        if (f.op === 'eq') rows = rows.filter(r => r[f.col] === f.val);
        if (f.op === 'ilike') rows = rows.filter(r => String(r[f.col] || '').toLowerCase() === String(f.val).toLowerCase());
      }
      return rows;
    };
    const resolvePayload = () => {
      const rows = getRows();
      if (resultMode === 'single') {
        return rows[0] ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'Not found' } };
      }
      if (resultMode === 'maybeSingle') {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, count: rows.length, error: null };
    };
    const builder: any = {
      eq: (col: string, val: any) => { filters.push({ op: 'eq', col, val }); return proxy; },
      ilike: (col: string, val: any) => { filters.push({ op: 'ilike', col, val }); return proxy; },
      single: () => { resultMode = 'single'; return proxy; },
      maybeSingle: () => { resultMode = 'maybeSingle'; return proxy; },
      then: (resolve: any, reject: any) => Promise.resolve(resolvePayload()).then(resolve, reject),
    };
    const proxy: any = new Proxy(builder, {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target];
        return () => proxy;
      },
    });
    return proxy;
  }

  return {
    ...actual,
    createPublicSupabase: () => ({
      from: (table: string) => createTableQuery(table),
      rpc: async () => ({ data: { international_public_enabled: false }, error: null }),
    }),
  };
});

import seoPrerenderHandler from '../../../api/seo-prerender.js';
import sitemapHandler from '../../../api/sitemap.js';
import { generateMetaTitle, generateMetaDescription, generateCanonical, generateProductSchema, generateBreadcrumbs } from '../seo/seoConfig';

function createMockReqRes(query = {}) {
  const req = { query, headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } };
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

describe('SEO & Serverless Prerender Verification Test Suite', { timeout: 30000 }, () => {
  it('FASE 2 & 3: sitemap.xml returns valid XML with active products and correct domain', async () => {
    const { req, res, getStatusCode, getHeaders, getBody } = createMockReqRes();
    await sitemapHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    expect(getHeaders()['content-type']).toContain('application/xml');
    
    const body = getBody();
    expect(body).toMatch(/<sitemapindex|<urlset/);
    expect(body).toContain('https://collectibles.uy/');
    expect(body).not.toContain('vercel.app');
    expect(body).not.toContain('collectibles.com.uy');
  });

  it('FASE 2 & 3: Home page prerenders title, meta, canonical, H1, Organization & WebSite schemas', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({ type: 'home' });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();
    expect(body).toContain('<title>Collectibles Uruguay | Figuras de Acción, Funko y Coleccionables</title>');
    expect(body).toContain('<link rel="canonical" href="https://collectibles.uy"');
    expect(body).not.toContain('Juguetes Retro Uruguay');
    expect(body).toContain('<h1 style="font-size: 28px; font-weight: bold; margin-bottom: 10px;">Figuras de Acción, Funko y Coleccionables en Uruguay | Collectibles</h1>');
    expect(body).toContain('"name": "Collectibles"');
    expect(body).toContain('"alternateName": "Collectibles Uruguay"');
    expect(body).toContain('https://listado.mercadolibre.com.uy/_CustId_2013898864');
  });

  it('FASE 4: Figuras de Acción category prerenders title, canonical and H1', async () => {
    const { req, res, getStatusCode, getBody } = createMockReqRes({
      type: 'categoria',
      slug: 'figuras'
    });
    await seoPrerenderHandler(req as any, res as any);

    expect(getStatusCode()).toBe(200);
    const body = getBody();
    expect(body).toContain('<title>Figuras de Acción en Uruguay | NECA, Bandai y más | Collectibles</title>');
    expect(body).toContain('<link rel="canonical" href="https://collectibles.uy/categoria/figuras"');
    expect(body).toContain('<h1');
  });

  it('FASE 5 & 6: Funko and NECA brand pages prerender canonical and dedicated metadata', async () => {
    const { req: fReq, res: fRes, getStatusCode: fStatus, getBody: fBody } = createMockReqRes({
      type: 'marca',
      slug: 'funko'
    });
    await seoPrerenderHandler(fReq as any, fRes as any);
    expect(fStatus()).toBe(200);
    expect(fBody()).toContain('<title>Funko Pop Uruguay | Figuras y Coleccionables Funko | Collectibles</title>');
    expect(fBody()).toContain('<link rel="canonical" href="https://collectibles.uy/marca/funko"');

    const { req: nReq, res: nRes, getStatusCode: nStatus, getBody: nBody } = createMockReqRes({
      type: 'marca',
      slug: 'neca'
    });
    await seoPrerenderHandler(nReq as any, nRes as any);
    expect(nStatus()).toBe(200);
    expect(nBody()).toContain('<title>NECA Uruguay | Figuras de Acción NECA | Collectibles</title>');
    expect(nBody()).toContain('<link rel="canonical" href="https://collectibles.uy/marca/neca"');
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
      gtin: '0634482421123'
    };

    const schema = generateProductSchema(mockProduct, { name: 'NECA' }, { name: 'Figuras de Acción', slug: 'figuras' }, ['https://collectibles.uy/images/chucky.jpg']);

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
      category: { name: 'Figuras de Acción', slug: 'figuras' }
    });

    expect(breadcrumbs['@type']).toBe('BreadcrumbList');
    expect(breadcrumbs.itemListElement.length).toBe(3);
    breadcrumbs.itemListElement.forEach((item: any) => {
      expect(item.item).toBeDefined();
      expect(item.item).toContain('https://collectibles.uy/');
    });
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
