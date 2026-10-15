// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeoPrerenderHandler } from '../../../api/seo-prerender.js';
import { createSitemapHandler } from '../../../api/sitemap.js';
import { createSeoProductRepository } from '../../../api/_lib/seo-product-repository.js';
import { createReadGate, createPublicReadContext, withDeadline } from '../../../api/_lib/public-supabase.js';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CATEGORY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BRAND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const product = (overrides = {}) => ({ id: ID, slug: 'figura-real', title: 'Figura real', base_price: 2333,
  status: 'published', is_active: true, category_id: CATEGORY, brand_id: BRAND, condition: 'used_complete', ...overrides });

type Call = { table: string; fields: string; filters: [string, any][]; signal?: AbortSignal; offset?: number };
function fakeClient(resolve: (call: Call) => any) {
  const calls: Call[] = [];
  return { calls, from(table: string) {
    const call: Call = { table, fields: '', filters: [] };
    const builder: any = {
      select(fields: string) { call.fields = fields; return builder; },
      eq(name: string, value: any) { call.filters.push([name, value]); return builder; },
      neq() { return builder; }, order() { return builder; }, limit() { return builder; },
      maybeSingle() { return builder; },
      range(offset: number) { call.offset = offset; return builder; },
      abortSignal(signal: AbortSignal) { call.signal = signal; return builder; },
      then(yes: any, no: any) { calls.push(call); return Promise.resolve().then(() => resolve(call)).then(yes, no); },
    };
    return builder;
  } };
}
const eq = (call: Call, name: string) => call.filters.find(([key]) => key === name)?.[1];
const principal = (call: Call) => call.table === 'products' && call.fields.includes('short_description');
function fixture(call: Call) {
  if (principal(call)) return { data: product(), error: null };
  if (call.table === 'product_images') return { data: [{ url: 'https://example.com/original.webp', is_primary: true }], error: null };
  if (call.table === 'categories') return { data: { name: 'Figuras', slug: 'figuras' }, error: null };
  if (call.table === 'brands') return { data: { name: 'Marca', slug: 'marca' }, error: null };
  return { data: [], error: null };
}
function response() {
  return { headers: {} as Record<string, string>, code: 0, body: '',
    setHeader(key: string, value: string) { this.headers[key] = value; return this; },
    status(code: number) { this.code = code; return this; },
    send(body: string) { this.body = body; return this; }, end() { return this; } };
}
const req = (query = {}) => ({ query, headers: { 'user-agent': 'Googlebot/2.1' } });
const read = (operation: any, timeout?: number) => withDeadline(operation, timeout);
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Real grouped cancellation and bounded reads', () => {
  it('installs the factory signal before starting all requests and aborts every sibling at deadline', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const work = withDeadline(signal => Promise.all([0, 1, 2].map(() => {
      signals.push(signal);
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }));
    })), 50);
    const assertion = expect(work).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(51); await assertion;
    expect(signals).toHaveLength(3); expect(signals.every(signal => signal.aborted)).toBe(true);
  });
  it('also aborts the siblings after an early source rejection and clears its timer', async () => {
    vi.useFakeTimers(); let sibling: AbortSignal | undefined;
    await expect(withDeadline(signal => {
      sibling = signal;
      return Promise.all([Promise.reject(Error('upstream unavailable')), new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }))]);
    }, 100)).rejects.toThrow('upstream unavailable');
    expect(sibling?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds its waiting queue and removes a cancelled job before it can run', async () => {
    const gate = createReadGate(1, 1), controller = new AbortController();
    let finish: (value: string) => void = () => {};
    const first = gate(() => new Promise<string>(resolve => { finish = resolve; }));
    await Promise.resolve();
    const queued = vi.fn();
    const second = gate(queued, controller.signal);
    const cancellation = expect(second).rejects.toThrow('timed out');
    await expect(gate(() => Promise.resolve('overflow'))).rejects.toMatchObject({ code: 'READ_QUEUE_FULL' });
    controller.abort(); await cancellation;
    const fourth = gate(() => Promise.resolve('next'));
    finish('first'); expect(await first).toBe('first'); expect(await fourth).toBe('next');
    expect(queued).not.toHaveBeenCalled();
  });
  it('shares an overall budget across consecutive reads and rejects reads after it expires', async () => {
    vi.useFakeTimers(); const context = createPublicReadContext(25); let actual: AbortSignal | undefined;
    const work = context.read({ abortSignal(signal: AbortSignal) { actual = signal;
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }));
    } }, 100);
    const assertion = expect(work).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(26); await assertion; expect(actual?.aborted).toBe(true);
    const operation = { abortSignal: vi.fn() };
    await expect(context.read(operation)).rejects.toThrow('timed out'); expect(operation.abortSignal).not.toHaveBeenCalled();
    context.close(); expect(vi.getTimerCount()).toBe(0);
  });
  it('the actual home handler cancels all three optional reads before returning its static editorial content', async () => {
    vi.useFakeTimers(); vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient(call => new Promise((_, reject) => call.signal?.addEventListener('abort', () => reject(Error('cancelled')), { once: true })));
    const res = response(), work = createSeoPrerenderHandler(() => client)(req({ type: 'home' }), res);
    await vi.advanceTimersByTimeAsync(4001); await work;
    expect(res.code).toBe(200); expect(client.calls).toHaveLength(3);
    expect(client.calls.every(call => call.signal?.aborted)).toBe(true);
    expect(res.body).not.toContain('"@type": "Product"'); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Product source correctness under incidents', () => {
  it('keeps database text inside parseable JSON-LD rather than allowing script termination', async () => {
    const title = 'Figura</script><script>window.__seoInjectionProbe=1</script>\u2028\u2029';
    const client = fakeClient(call => principal(call) ? { data: product({ title, description: title }) } : fixture(call));
    const res = response();
    await createSeoPrerenderHandler(() => client)(req({ type: 'producto', slug: 'figura-real' }), res);
    expect(res.code).toBe(200);
    expect(res.body).not.toContain('<script>window.__seoInjectionProbe=1</script>');
    const scripts = [...res.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
    expect(scripts.length).toBeGreaterThanOrEqual(2);
    expect(scripts.every(script => !script.includes('<') && !/[\u2028\u2029]/.test(script))).toBe(true);
    const productScript = scripts.find(script => JSON.parse(script)['@type'] === 'Product')!;
    expect(productScript).toContain('\\u003c/script>'); expect(productScript).toContain('\\u2028\\u2029');
    expect(JSON.parse(productScript).name).toBe(title);
    expect(scripts.some(script => JSON.parse(script)['@type'] === 'BreadcrumbList')).toBe(true);
  });
  it('accepts only own string-valued static redirects and never inherits Object prototype mappings', async () => {
    const client = fakeClient(() => ({ data: null }));
    const repo = createSeoProductRepository(client, { valid: 'figura-real', object: {}, callable: () => 'invented' });
    for (const slug of ['constructor', '__proto__', 'object', 'callable']) expect(await repo.resolve(slug, read)).toBeNull();
    expect(await repo.resolve('valid', read)).toMatchObject({ canonicalSlug: 'figura-real', isRedirect: true });
    const res = response();
    await createSeoPrerenderHandler(() => client)(req({ type: 'producto', slug: 'constructor' }), res);
    expect(res.code).toBe(404); expect(res.headers.Location).toBeUndefined();
  });
  it('does not inherit constructor entries from any static taxonomy fallback', async () => {
    const client = fakeClient(() => ({ data: null })), handler = createSeoPrerenderHandler(() => client);
    for (const type of ['categoria', 'marca']) {
      const res = response(); await handler(req({ type, slug: 'constructor' }), res);
      expect(res.code).toBe(404);
    }
    for (const type of ['licencia_detail', 'theme_detail']) {
      const res = response(); await handler(req({ type, slug: 'constructor' }), res);
      expect(res.code).toBe(200);
      expect(res.body).toContain('<title>Constructor |');
      expect(res.body).not.toContain('<title>Object |');
    }
    expect(client.calls.some(call => call.table === 'products')).toBe(false);
  });
  it('resolves a valid UUID by its primary key before trying slugs or redirects', async () => {
    const client = fakeClient(fixture), repo = createSeoProductRepository(client);
    expect(await repo.resolve(ID, read)).toMatchObject({ isRedirect: true, canonicalSlug: 'figura-real' });
    expect(client.calls).toHaveLength(1); expect(eq(client.calls[0], 'id')).toBe(ID);
  });
  it('keeps canonical redirects and never requests details for a missing product', async () => {
    const client = fakeClient(call => {
      if (call.table === 'product_slug_redirects') return { data: { new_slug: 'figura-real' } };
      return { data: eq(call, 'slug') === 'figura-real' ? product() : null };
    });
    const handler = createSeoPrerenderHandler(() => client), res = response();
    await handler(req({ type: 'producto', slug: 'nombre-antiguo' }), res);
    expect(res.code).toBe(301); expect(res.headers.Location).toBe('https://collectibles.uy/producto/figura-real');
    expect(client.calls.some(call => call.table === 'product_images')).toBe(false);
    const missing = fakeClient(() => ({ data: null })), absent = response();
    await createSeoPrerenderHandler(() => missing)(req({ type: 'producto', slug: 'inexistente' }), absent);
    expect(absent.code).toBe(404); expect(absent.body).toContain('noindex');
    expect(missing.calls.some(call => call.table === 'product_images')).toBe(false);
  });
  it('never renders a draft returned by an incorrectly permissive upstream fixture', async () => {
    const client = fakeClient(call => ({ data: principal(call) ? product({ status: 'draft' }) : null })), res = response();
    await createSeoPrerenderHandler(() => client)(req({ type: 'producto', slug: 'figura-real' }), res);
    expect(res.code).toBe(404); expect(client.calls.some(call => call.table === 'product_images')).toBe(false);
    for (const call of client.calls.filter(principal)) {
      expect(eq(call, 'status')).toBe('published'); expect(eq(call, 'is_active')).toBe(true);
    }
  });
  it('coalesces overlapping requests but re-reads prices after completion', async () => {
    let price = 2333;
    const client = fakeClient(call => principal(call) ? { data: product({ base_price: price }) } : fixture(call));
    const handler = createSeoPrerenderHandler(() => client), first = response(), concurrent = response();
    await Promise.all([handler(req({ type: 'producto', slug: 'figura-real' }), first), handler(req({ type: 'producto', slug: 'figura-real' }), concurrent)]);
    expect(first.code).toBe(200); expect(concurrent.code).toBe(200);
    expect(client.calls.filter(principal)).toHaveLength(1);
    expect(client.calls.filter(call => call.table === 'product_images')).toHaveLength(1);
    price = 4567; const later = response();
    await handler(req({ type: 'producto', slug: 'figura-real' }), later);
    expect(client.calls.filter(principal)).toHaveLength(2); expect(later.body).toContain('"price": 4567');
    expect(later.body).toContain('https://schema.org/UsedCondition');
    // Stock is not part of the production products schema: never invent InStock.
    expect(later.body).not.toContain('https://schema.org/InStock');
  });
  it('does not send invalid fallback taxonomy identifiers to UUID columns', async () => {
    const client = fakeClient(fixture), repo = createSeoProductRepository(client);
    await repo.details(product({ category_id: 'fallback-category', brand_id: 'brand-funko' }), read);
    expect(client.calls.map(call => call.table)).toEqual(['product_images']);
    await expect(async () => repo.details(product({ id: 'invented' }), read)).rejects.toMatchObject({ code: '22P02' });
  });
  it('never substitutes zero for a missing price in a published product', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient(call => principal(call) ? { data: product({ base_price: null }) } : fixture(call)), res = response();
    await createSeoPrerenderHandler(() => client)(req({ type: 'producto', slug: 'figura-real' }), res);
    expect(res.code).toBe(503); expect(res.body).not.toContain('"price": 0');
    expect(client.calls.some(call => call.table === 'product_images')).toBe(false);
  });
  it('returns uncached 503 for an essential source failure with only safe diagnostic metadata', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient(() => ({ data: null, error: { code: '57014', message: 'SECRET customer query text' } })), res = response();
    await createSeoPrerenderHandler(() => client)(req({ type: 'producto', slug: 'figura-real' }), res);
    expect(res.code).toBe(503); expect(res.headers['Vercel-CDN-Cache-Control']).toBe('no-store');
    expect(res.headers['Retry-After']).toBe('30');
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
    expect(log).toHaveBeenCalledWith('[seo-prerender] Read unavailable', expect.objectContaining({ stage: 'product_lookup_slug', kind: 'QUERY_CANCELLED', code: '57014' }));
  });
  it('keeps the actual product and price if only recommendations fail, but fails if images are unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let failImages = false;
    const client = fakeClient(call => call.table === 'products' && !principal(call) || failImages && call.table === 'product_images'
      ? { data: null, error: { code: '57014' } } : fixture(call));
    const handler = createSeoPrerenderHandler(() => client), res = response();
    await handler(req({ type: 'producto', slug: 'figura-real' }), res);
    expect(res.code).toBe(200); expect(res.body).toContain('"price": 2333'); expect(res.body).toContain('original.webp');
    failImages = true; const unavailable = response();
    await handler(req({ type: 'producto', slug: 'figura-real' }), unavailable);
    expect(unavailable.code).toBe(503);
  });
});

describe('Public sitemap bounds and failure semantics', () => {
  it('uses only published/active products and does not construct a client for the static index', async () => {
    const client = fakeClient(() => ({ data: [{ slug: 'figura-real' }] })), factory = vi.fn(() => client);
    const handler = createSitemapHandler(factory), index = response();
    await handler(req({ type: 'index' }), index); expect(index.code).toBe(200); expect(factory).not.toHaveBeenCalled();
    const products = response(); await handler(req({ type: 'products' }), products);
    expect(products.code).toBe(200); expect(products.body).toContain('https://collectibles.uy/producto/figura-real');
    expect(eq(client.calls[0], 'status')).toBe('published'); expect(eq(client.calls[0], 'is_active')).toBe(true);
    expect(client.calls[0].signal).toBeInstanceOf(AbortSignal);
  });
  it('does not cache or report a partial sitemap as success after a later page fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient(call => call.offset === 0
      ? { data: Array.from({ length: 1000 }, () => ({ slug: 'partial-result' })) }
      : { data: null, error: { code: '57014', message: 'private query text' } });
    const res = response(); await createSitemapHandler(() => client)(req({ type: 'products' }), res);
    expect(res.code).toBe(503); expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).not.toContain('partial-result'); expect(client.calls).toHaveLength(2);
  });
  it('aborts outstanding taxonomy reads if one essential sitemap source fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient(call => call.table === 'categories' ? { error: { code: '57014' }, data: null }
      : new Promise((_, reject) => call.signal?.addEventListener('abort', () => reject(Error('cancelled')), { once: true })));
    const res = response(); await createSitemapHandler(() => client)(req({ type: 'categories' }), res);
    expect(res.code).toBe(503); expect(client.calls).toHaveLength(3);
    expect(client.calls.every(call => call.signal?.aborted)).toBe(true);
    expect(eq(client.calls[0], 'status')).toBe('approved');
  });
});
