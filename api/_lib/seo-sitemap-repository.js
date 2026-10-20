import { createPublicReadContext } from './public-supabase.js';

export function createSitemapRepository(client) {
  const pending = new Map();
  async function readAll(context, table, fields, configure) {
    const rows = [];
    for (let offset = 0; offset < 50000; offset += 1000) {
      const { data } = await context.read(configure(client.from(table).select(fields))
        .order('id').range(offset, offset + 999), 4000, `sitemap_${table}`);
      if (!Array.isArray(data)) throw Object.assign(new Error('Database response unavailable'), { stage: `sitemap_${table}` });
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
    throw Object.assign(new Error('Sitemap exceeds safety limit'), { stage: `sitemap_${table}` });
  }
  return {
    get(type) {
      if (pending.has(type)) return pending.get(type);
      const context = createPublicReadContext();
      const task = Promise.resolve().then(async () => {
        if (process.env.CF_PUBLIC_CATALOG_ENABLED === 'true') {
          try {
            const cfBase = (process.env.CF_CATALOG_WORKER_URL || 'https://collectibles-catalog-api.pixelsncodes-uy.workers.dev').replace(/\/+$/, '');
            if (type === 'products') {
              const cfRes = await fetch(`${cfBase}/api/v1/products?limit=5000`, {
                headers: { Accept: 'application/json', 'X-Catalog-Client': 'vercel-sitemap' },
                signal: AbortSignal.timeout(4500),
              });
              if (cfRes.ok && cfRes.headers.get('X-Catalog-Kill-Switch') !== 'active') {
                const body = await cfRes.json();
                if (Array.isArray(body?.products)) return body.products;
              }
            } else if (type === 'brands' || type === 'categories') {
              const cfRes = await fetch(`${cfBase}/api/v1/taxonomies`, {
                headers: { Accept: 'application/json', 'X-Catalog-Client': 'vercel-sitemap' },
                signal: AbortSignal.timeout(4500),
              });
              if (cfRes.ok && cfRes.headers.get('X-Catalog-Kill-Switch') !== 'active') {
                const body = await cfRes.json();
                if (type === 'brands' && Array.isArray(body?.brands)) return body.brands;
                if (type === 'categories' && Array.isArray(body?.categories)) {
                  return [body.categories, body.licenses || [], body.themes || []];
                }
              }
            }
          } catch {
            // Fall through to Supabase fallback
          }
        }
        if (type === 'products') return readAll(context, 'products', 'slug,updated_at,created_at', q => q.eq('status', 'published').eq('is_active', true));
        if (type === 'brands') return readAll(context, 'brands', 'slug,created_at', q => q.eq('is_active', true).eq('is_public', true).eq('status', 'approved'));
        if (type === 'categories') return Promise.all([
          readAll(context, 'categories', 'slug,status,is_active', q => q.eq('is_active', true).eq('status', 'approved')),
          readAll(context, 'licenses', 'slug', q => q.eq('is_active', true)),
          readAll(context, 'themes', 'slug', q => q.eq('is_active', true)),
        ]);
        throw new Error('Invalid sitemap type');
      }).finally(() => { context.close(); pending.delete(type); });
      pending.set(type, task);
      return task;
    },
  };
}
