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
      const task = Promise.resolve().then(() => {
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
