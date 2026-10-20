import { publicReadFailure } from './public-supabase.js';

export const isUuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const PRODUCT_FIELDS = 'id,title,slug,description,short_description,base_price,compare_at_price,is_active,status,category_id,brand_id,condition,seo_title,seo_description,meta_title,meta_description,metadata,ml_item_id';

function assertRead(result, stage) {
  if (result?.error) throw Object.assign(new Error('Database request failed'), { code: result.error.code, stage });
  return result;
}

export function createSeoProductRepository(client, staticMappings = {}) {
  // Coalesce concurrent identical reads only. Prices and publication are read again
  // as soon as the previous operation completes; no successful/negative data cache.
  const pending = new Map();
  function together(key, task) {
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 128) throw Object.assign(new Error('Public read queue full'), { code: 'READ_QUEUE_FULL' });
    const result = Promise.resolve().then(task).finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  }
  const productQuery = (field, value) => client.from('products').select(PRODUCT_FIELDS)
    .eq(field, value).eq('status', 'published').eq('is_active', true).maybeSingle();
  const visible = row => row?.status === 'published' && row.is_active === true;
  const found = (product, redirect) => ({ product, isRedirect: redirect, canonicalSlug: product.slug });

  return {
    resolve(slug, read) {
      if (typeof slug !== 'string' || !slug || slug.length > 512) return Promise.resolve(null);
      return together(`resolve:${slug}`, async () => {
        if (process.env.CF_PUBLIC_CATALOG_ENABLED === 'true') {
          try {
            const cfBase = (process.env.CF_CATALOG_WORKER_URL || 'https://collectibles-catalog-api.pixelsncodes-uy.workers.dev').replace(/\/+$/, '');
            const cfRes = await fetch(`${cfBase}/api/v1/products/${encodeURIComponent(slug)}`, {
              headers: { Accept: 'application/json', 'X-Catalog-Client': 'vercel-seo-prerender' },
              signal: AbortSignal.timeout(3500),
            });
            if (cfRes.ok && cfRes.headers.get('X-Catalog-Kill-Switch') !== 'active') {
              const body = await cfRes.json();
              if (body?.product) {
                const p = body.product;
                p._d1DetailsPreloaded = {
                  images: p.product_images || p.images || [],
                  category: p.categories || p.category || null,
                  brand: p.brands || p.brand || null,
                  related: body.wave_products || [],
                };
                return found(p, Boolean(body.redirected_from || (isUuid(slug) && p.slug !== slug)));
              }
            }
          } catch {
            // Fall through to Supabase fallback
          }
        }
        if (isUuid(slug)) {
          const { data } = await read(productQuery('id', slug), 3500, 'product_lookup_id');
          if (visible(data)) return found(data, true);
        }
        const { data: direct } = await read(productQuery('slug', slug), 3500, 'product_lookup_slug');
        if (visible(direct)) return found(direct, false);
        const { data: redirect } = await read(client.from('product_slug_redirects').select('new_slug,product_id')
          .eq('old_slug', slug).maybeSingle(), 2500, 'product_lookup_redirect');
        if (redirect?.new_slug) {
          const { data } = await read(productQuery('slug', redirect.new_slug), 3500, 'product_lookup_target');
          if (visible(data)) return found(data, true);
        }
        const match = slug.match(/MLU\s*[-_]?\s*\d+/i);
        if (match) {
          const id = match[0].toUpperCase().replace(/[-_\s]/g, '');
          const { data } = await read(productQuery('ml_item_id', id), 3500, 'product_lookup_marketplace');
          if (visible(data)) return found(data, true);
        }
        const key = slug.toLowerCase();
        const mapped = Object.hasOwn(staticMappings, key) ? staticMappings[key] : null;
        const canonical = typeof mapped === 'string' && mapped.length > 0 ? mapped : null;
        return canonical ? { product: { slug: canonical }, isRedirect: true, canonicalSlug: canonical } : null;
      });
    },
    details(product, read) {
      if (product?._d1DetailsPreloaded) {
        const pre = product._d1DetailsPreloaded;
        return Promise.resolve([
          { data: pre.images },
          { data: pre.category },
          { data: pre.brand },
          { data: pre.related },
        ]);
      }
      if (!isUuid(product?.id)) throw Object.assign(new Error('Invalid product identifier'), { code: '22P02', stage: 'product_details' });
      return together(`details:${product.id}:${product.category_id || ''}:${product.brand_id || ''}`, async () => {
        const essential = read(async signal => {
          const queries = [
            client.from('product_images').select('url,alt_text,is_primary').eq('product_id', product.id).order('sort_order', { ascending: true }),
            isUuid(product.category_id) ? client.from('categories').select('name,slug').eq('id', product.category_id).eq('is_active', true).eq('status', 'approved').maybeSingle() : null,
            isUuid(product.brand_id) ? client.from('brands').select('name,slug').eq('id', product.brand_id).eq('is_active', true).eq('is_public', true).eq('status', 'approved').maybeSingle() : null,
          ];
          return Promise.all(queries.map(query => query
            ? Promise.resolve(query.abortSignal(signal)).then(result => assertRead(result, 'product_details'))
            : Promise.resolve({ data: null })));
        }, 3500, 'product_details');
        // Recommendations are optional editorial links, never the source of this
        // product's price or availability. A failed recommendation cannot hide it.
        const recommendations = isUuid(product.category_id)
          ? read(client.from('products').select('title,slug,base_price').eq('category_id', product.category_id)
            .eq('is_active', true).eq('status', 'published').neq('id', product.id).limit(6), 1500, 'product_related')
            .catch(error => {
              console.error('[seo-prerender] Optional read unavailable', { stage: 'product_related', ...publicReadFailure(error) });
              return { data: [] };
            })
          : Promise.resolve({ data: [] });
        const [details, related] = await Promise.all([essential, recommendations]);
        return [...details, related];
      });
    },
  };
}
