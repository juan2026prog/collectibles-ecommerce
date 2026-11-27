import { describe, it, expect } from 'vitest';
import { createSeoPrerenderHandler } from '../../../api/seo-prerender.js';

const NORMAL_LEGACY_SLUGS = [
  'laurie-strode-ultimate-halloween--2018--neca-2383',
  'figura-de-acci-n-glamrock-fred-security-breach-47490-de-funko-4336',
  'figura-chucky---tiffany-pack-doble-bride-of-chucky-neca-6773',
  'peluche-gashouse-pat-ootie-coral-claro',
  'chucky-tv-series-ultimate-neca-4996',
  'figura-neca-ultimate---chucky-tv-series-3029',
  'boar-ultimate-predator-2-depredador-neca-7057',
  'funko-pop-marvel-eternals-gilgamesh',
  'feral-ultimate-predator-depredador-prey-neca-dmg-box-5406',
  'fifa-world-cup-2026-mascota-de-ee-uu-clutch-25cm',
];

const MLU_LEGACY_SLUGS = [
  { oldSlug: 'mercadolibre-MLU1044226594', expectedCanonical: 'neca-body-knocker-solar-power-marvel-dr-strange' },
  { oldSlug: 'mercadolibre-MLU978019978', expectedCanonical: 'funko-pop-spiderman-symbiote-suite' },
  { oldSlug: 'mercadolibre-MLU615896308', expectedCanonical: 'marvel-legends-thor-love-and-thunder-groot' },
  { oldSlug: 'mercadolibre-MLU651358264', expectedCanonical: 'funko-pop-the-eternals-ikaris' },
  { oldSlug: 'mercadolibre-MLU655247339', expectedCanonical: 'funko-pop-street-sharks-ripster' },
  { oldSlug: 'mercadolibre-MLU623057633', expectedCanonical: 'funko-pop-doctor-strange-in-the-multiverse-rintrah' },
  { oldSlug: 'mercadolibre-MLU655337083', expectedCanonical: 'funko-pop-biker-mars-from-mice-vinnie' },
  { oldSlug: 'mercadolibre-MLU639385900', expectedCanonical: 'funko-peluche-de-lucha-libre-la-estrella-cosmica-amarillo' },
  { oldSlug: 'mercadolibre-MLU629964263', expectedCanonical: 'funko-plushies-avenger-infinity-war-hulkbuster' },
];

const KNOWN_SLUGS = new Set([
  ...NORMAL_LEGACY_SLUGS,
  ...MLU_LEGACY_SLUGS.map((m) => m.expectedCanonical),
]);

function createFakeSeoSupabase() {
  return {
    from(table: string) {
      const filters: Record<string, any> = {};
      const builder: any = {
        select() { return builder; },
        eq(k: string, v: any) { filters[k] = v; return builder; },
        neq() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        range() { return builder; },
        abortSignal() { return builder; },
        maybeSingle() { return builder; },
        then(onFulfilled: any, onRejected: any) {
          return Promise.resolve().then(() => {
            if (table === 'products') {
              const slug = filters['slug'];
              if (slug && KNOWN_SLUGS.has(slug)) {
                return {
                  data: {
                    id: '11111111-1111-4111-8111-111111111111',
                    slug,
                    title: `Producto ${slug}`,
                    base_price: 2590,
                    status: 'published',
                    is_active: true,
                    condition: 'new',
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }
            if (table === 'product_slug_redirects') {
              return { data: null, error: null };
            }
            return { data: [], error: null };
          }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

const seoPrerenderHandler = createSeoPrerenderHandler(createFakeSeoSupabase);

function createMockReqRes(urlPath: string) {
  const req = {
    url: urlPath,
    headers: {
      'x-forwarded-uri': urlPath,
    },
    query: {},
  };

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
    end: (content?: string) => {
      if (content) body = content;
      return res;
    },
  };

  return { req, res, getStatusCode: () => statusCode, getHeaders: () => headers, getBody: () => body };
}

describe('Legacy Product URL Resolution Suite (/p/ -> /producto/)', { timeout: 30000 }, () => {
  const nonExistentSlugs = [
    'producto-inexistente-1',
    'mercadolibre-MLU99999999999',
    'categoria-falsa-xyz',
    'p-no-existe-3',
    'random-slug-invalid-987',
  ];

  for (const slug of NORMAL_LEGACY_SLUGS) {
    it(`Resolves normal legacy /p/${slug} with 301 Permanent Redirect to /producto/${slug}`, async () => {
      const { req, res, getStatusCode, getHeaders } = createMockReqRes(`/p/${slug}`);
      await seoPrerenderHandler(req as any, res as any);

      expect(getStatusCode()).toBe(301);
      expect(getHeaders()['location']).toBe(`https://collectibles.com.uy/producto/${slug}`);
    });
  }

  for (const item of MLU_LEGACY_SLUGS) {
    it(`Resolves MLU legacy /p/${item.oldSlug} with 301 Permanent Redirect to /producto/${item.expectedCanonical}`, async () => {
      const { req, res, getStatusCode, getHeaders } = createMockReqRes(`/p/${item.oldSlug}`);
      await seoPrerenderHandler(req as any, res as any);

      expect(getStatusCode()).toBe(301);
      expect(getHeaders()['location']).toBe(`https://collectibles.com.uy/producto/${item.expectedCanonical}`);
    });
  }

  for (const slug of nonExistentSlugs) {
    it(`Responds HTTP 404 real and noindex for non-existent legacy /p/${slug}`, async () => {
      const { req, res, getStatusCode, getHeaders, getBody } = createMockReqRes(`/p/${slug}`);
      await seoPrerenderHandler(req as any, res as any);

      expect(getStatusCode()).toBe(404);
      expect(getHeaders()['location']).toBeUndefined();
      expect(getBody()).toContain('404 - Página No Encontrada');
      expect(getBody()).toContain('noindex, follow');
    });
  }
});
