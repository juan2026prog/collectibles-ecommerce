import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareCatalog, parseFilters, selectCatalog, createCatalogRepository } from '../../../api/_lib/public-catalog.js';
import { createCatalogHandler } from '../../../api/_lib/public-catalog-handler.js';

const fixture = () => ({
  categories: [{ id: 'root', name: 'Root' }, { id: 'child', name: 'Child', parent_id: 'root' }, { id: 'other', name: 'Other' }],
  brands: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }],
  licenses: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }],
  themes: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }],
  licenseThemes: [{ license_id: 'one', theme_id: 'x' }, { license_id: 'one', theme_id: 'x' }, { license_id: 'two', theme_id: 'y' }],
  groups: [{ id: 'g', name: 'Group' }], internationalEnabled: true,
  local: [
    { id: 'p1', title: 'First', description: 'Descubrimiento oculto', status: 'published', is_active: true, category_id: 'child', product_categories: [{ category_id: 'root' }], brand_id: 'a', license_id: 'one', base_price: 20, product_group_items: [{ group_id: 'g' }] },
    { id: 'p2', title: 'Second', status: 'published', is_active: true, category_id: 'other', brand_id: 'b', license_id: 'two', base_price: 50, condition: 'used_complete' },
    { id: 'p3', title: 'Third', status: 'published', is_active: true, category_id: 'child', brand_id: 'b', license_id: 'two', base_price: 80, condition: 'loose_complete' },
  ],
  international: [{ id: 'i', title: 'Imported', status: 'published', brand: 'Alpha', final_price_usd: 10, collectibles_category_id: 'root' }],
});
const filters = (values = {}) => parseFilters({ availability: 'all', ...values });
afterEach(() => vi.restoreAllMocks());

it('rejects malformed collection UUIDs before any database or snapshot access', async()=>{
  const getRepository=vi.fn(()=>{throw Error('must not read');});
  const res:any={statusCode:0,setHeader(){},status(n:number){this.statusCode=n;return this;},json(){return this;}};
  await createCatalogHandler(getRepository)({method:'GET',query:{collection_id:'-'.repeat(36)}},res);
  expect(res.statusCode).toBe(400);expect(getRepository).not.toHaveBeenCalled();
});

describe('Catalog aggregation preserves self-excluding facets', () => {
  it('counts ancestors and duplicate theme membership once per product', () => {
    const selected = selectCatalog(prepareCatalog(fixture()), filters());
    expect(selected.facets.categoryFacets).toEqual({ root: 3, child: 2, other: 1 });
    expect(selected.facets.themeFacets.map((t: any) => [t.id, t.published_product_count])).toEqual([['y', 2], ['x', 1]]);
    expect(selected.facets.availabilityCounts).toEqual({ all: 4, local: 3, international: 1 });
    expect(selected.facets.conditionCounts).toEqual({ all: 4, new: 2, used: 1, loose: 1 });
  });
  it('excludes only the facet being counted while preserving all other restrictions', () => {
    const catalog = prepareCatalog(fixture());
    const result = selectCatalog(catalog, filters({ category: 'child', brand: 'a', availability: 'local', license: 'one', theme: 'x', condition: 'new', group: 'g', maxPrice: '40' }));
    expect(result.selected.map((p: any) => p.id)).toEqual(['p1']);
    expect(result.facets.categoryFacets).toEqual({ root: 1, child: 1, other: 0 });
    expect(result.facets.brandFacets.map((b: any) => [b.brand_id, b.product_count])).toEqual([['a', 1]]);
    expect(result.facets.availabilityCounts).toEqual({ all: 1, local: 1, international: 0 });
    const brand = selectCatalog(catalog, filters({ brand: 'a' }));
    expect(brand.facets.brandFacets.map((b: any) => [b.brand_id, b.product_count])).toEqual([['a', 2], ['b', 2]]);
    expect(brand.facets.categoryFacets).toEqual({ root: 2, child: 1, other: 0 });
    const category = selectCatalog(catalog, filters({ category: 'child' }));
    expect(category.facets.categoryFacets).toEqual({ root: 3, child: 2, other: 1 });
    const availability = selectCatalog(catalog, filters({ availability: 'international' }));
    expect(availability.facets.availabilityCounts).toEqual({ all: 4, local: 3, international: 1 });
    expect(availability.facets.brandFacets.map((b: any) => b.brand_id)).toEqual(['a']);
    const condition = selectCatalog(catalog, filters({ condition: 'used' }));
    expect(condition.facets.conditionCounts).toEqual({ all: 4, new: 2, used: 1, loose: 1 });
    expect(condition.count).toBe(1);
  });
  it('keeps full description search and the global ordered pagination contract', () => {
    const catalog = prepareCatalog(fixture());
    expect(selectCatalog(catalog, filters({ search: 'descubrimiento oculto' })).selected.map((p: any) => p.id)).toEqual(['p1']);
    const page = selectCatalog(catalog, filters({ sortBy: 'price-low', exchangeRate: '3', limit: '2', offset: '1' }));
    expect(page.selected.map((p: any) => p.id)).toEqual(['i', 'p2']);
    expect(page.count).toBe(4);
  });
  it('does not rescan product search text for each taxonomy entry', () => {
    const raw = fixture();
    for (let i = 0; i < 150; i++) {
      raw.categories.push({ id: `c${i}`, name: `C${i}` });
      raw.brands.push({ id: `b${i}`, name: `B${i}` });
      raw.licenses.push({ id: `l${i}`, name: `L${i}` });
      raw.themes.push({ id: `t${i}`, name: `T${i}` });
    }
    const catalog = prepareCatalog(raw);
    let reads = 0;
    for (const product of catalog.rows) {
      const text = product.text;
      Object.defineProperty(product, 'text', { get() { reads++; return text; } });
    }
    selectCatalog(catalog, filters({ search: 'first' }));
    expect(reads).toBeLessThanOrEqual(catalog.rows.length * 7);
  });
});

describe('Snapshot cancellation and safe diagnostics', () => {
  it('aborts in-flight siblings and removes queued pages after the first failed snapshot read', async () => {
    let fail = true;
    const dispatched: string[] = [], aborted: string[] = [];
    const client = {
      rpc: async () => ({ data: { international_public_enabled: false }, error: null }),
      from(table: string) {
        let signal: AbortSignal;
        const builder: any = { select: () => builder, eq: () => builder, order: () => builder,
          abortSignal(value: AbortSignal) { signal = value; return builder; },
          range: () => builder,
          then(resolve: any, reject: any) {
            dispatched.push(table);
            const promise = !fail ? Promise.resolve({ data: [], error: null })
              : table === 'products' ? Promise.resolve({ data: null, error: { code: '57014', message: 'sensitive SQL text' } })
                : new Promise((_, cancel) => signal.addEventListener('abort', () => { aborted.push(table); cancel(signal.reason); }, { once: true }));
            return promise.then(resolve, reject);
          } };
        return builder;
      },
    };
    let now = 0;
    const repo = createCatalogRepository(client, () => now);
    await expect(repo.get()).rejects.toMatchObject({ stage: 'snapshot', query_kind: 'products', code: '57014' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(dispatched).toEqual(['products', 'categories', 'brands']);
    expect(aborted.sort()).toEqual(['brands', 'categories']);
    fail = false; now = 31000;
    await expect(repo.get()).resolves.toMatchObject({ stale: false });
    expect(dispatched.slice(3)).toHaveLength(7);
  });
  it('cancels sibling card reads and records only controlled operational metadata', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    let cancelled = false;
    const catalog = prepareCatalog(fixture());
    const client = { from(table: string) {
      let signal: AbortSignal;
      const builder: any = { select: () => builder, in: () => builder, eq: () => builder,
        abortSignal(value: AbortSignal) { signal = value; return builder; },
        then(resolve: any, reject: any) {
          const promise = table === 'products' ? Promise.resolve({ data: null, error: { code: '57014', message: 'private SQL data' } })
            : new Promise((_, fail) => signal.addEventListener('abort', () => { cancelled = true; fail(signal.reason); }, { once: true }));
          return promise.then(resolve, reject);
        } };
      return builder;
    } };
    const response: any = { headers: {}, setHeader(k: string, v: string) { this.headers[k] = v; }, status(n: number) { this.statusCode = n; return this; }, json(body: any) { this.body = body; return this; } };
    await createCatalogHandler(() => ({ get: async () => ({ catalog }), client }))({ method: 'GET', query: { availability: 'all' } }, response);
    expect(response.statusCode).toBe(503);
    expect(cancelled).toBe(true);
    expect(logger.mock.calls[0][1]).toMatchObject({ stage: 'cards', query_kind: 'products', class: 'QUERY_CANCELLED', code: '57014' });
    expect(JSON.stringify(logger.mock.calls)).not.toContain('private SQL');
    expect(response.headers['Vercel-CDN-Cache-Control']).toBe('no-store');
  });
});
