import fs from 'node:fs';
import { createPublicSupabase } from './public-supabase.js';

export const normalize = (value = '') => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const SYNONYMS = {
  spiderman: ['spider-man', 'spider man'], 'spider-man': ['spiderman', 'spider man'],
  'spider man': ['spiderman', 'spider-man'], dbz: ['dragon ball', 'dragon ball z'], 'dragon ball': ['dbz', 'dragon ball z', 'dragon ball super'],
  'dragon ball z': ['dragon ball', 'dbz'], motu: ['masters of the universe', 'he-man'], 'he-man': ['masters of the universe', 'motu'],
  tmnt: ['tortugas ninja', 'teenage mutant ninja turtles'], 'tortugas ninja': ['tmnt', 'teenage mutant ninja turtles'],
  batman: ['el caballero de la noche', 'the dark knight'], chucky: ["child's play", 'childs play'],
  funko: ['pop'], 'marvel legends': ['hasbro marvel'],
};

export function catalogReadError(stage, queryKind, cause = {}) {
  const error = new Error('Public catalog read unavailable');
  error.stage = stage;
  error.query_kind = queryKind;
  error.code = typeof cause?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(cause.code) ? cause.code : null;
  error.failure_class = error.code === '57014' ? 'QUERY_CANCELLED'
    : /timeout|timed out/i.test(String(cause?.message)) || cause?.name === 'TimeoutError' ? 'TIMEOUT'
      : cause?.name === 'AbortError' ? 'CANCELLED' : 'UPSTREAM_READ_FAILED';
  return error;
}

export function catalogErrorMetadata(error) {
  const stages = ['settings', 'snapshot', 'collection', 'cards'];
  const queries = ['international_status', 'products', 'international_products', 'categories', 'brands',
    'licenses', 'themes', 'license_themes', 'product_groups', 'vendor_store_collection_products'];
  const classes = ['QUERY_CANCELLED', 'TIMEOUT', 'CANCELLED', 'UPSTREAM_READ_FAILED'];
  return {
    stage: stages.includes(error?.stage) ? error.stage : 'catalog',
    query_kind: queries.includes(error?.query_kind) ? error.query_kind : 'unknown',
    code: typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : null,
    class: classes.includes(error?.failure_class) ? error.failure_class : 'UPSTREAM_READ_FAILED',
  };
}

export function parseFilters(query) {
  const filters = {};
  for (const name of ['category', 'brand', 'license', 'theme', 'badge', 'condition', 'group', 'vendor_store_id', 'collection_id', 'search']) {
    if (Array.isArray(query[name])) throw new Error('Invalid filter');
    const value = String(query[name] || '').trim();
    if (value.length > (name === 'search' ? 160 : 128)) throw new Error('Filter too long');
    if (value) filters[name] = value;
  }
  for (const name of ['offset', 'limit', 'minPrice', 'maxPrice', 'exchangeRate']) {
    if (query[name] === undefined || query[name] === '') continue;
    const value = Number(query[name]);
    if (Array.isArray(query[name]) || !Number.isFinite(value) || value < 0) throw new Error('Invalid numeric filter');
    filters[name] = value;
  }
  filters.limit = Math.min(60, Math.floor(filters.limit ?? 15));
  filters.offset = Math.min(100000, Math.floor(filters.offset ?? 0));
  filters.availability = ['all', 'local', 'international'].includes(query.availability) ? query.availability : 'local';
  filters.sortBy = ['default', 'relevance', 'newest', 'price-low', 'price-high', 'name'].includes(query.sortBy) ? query.sortBy : 'default';
  filters.featured = query.featured === 'true';
  filters.mode = query.mode === 'facets' ? 'facets' : 'products';
  return filters;
}

export function prepareCatalog(raw) {
  const { categories, brands, licenses, themes, licenseThemes, groups } = raw;
  const byKey = (items, key) => new Map(items.map(item => [item[key], item]));
  const brandById = byKey(brands, 'id'), licenseById = byKey(licenses, 'id');
  const themesByLicense = new Map();
  for (const link of licenseThemes) {
    if (!themesByLicense.has(link.license_id)) themesByLicense.set(link.license_id, []);
    themesByLicense.get(link.license_id).push(link.theme_id);
  }
  const brandByText = new Map();
  for (const brand of brands) for (const key of [normalize(brand.name), brand.slug]) {
    if (!brandByText.has(key)) brandByText.set(key, brand);
  }
  const resolve = (items, value) => items.find(item => item.id === value || item.slug === value)?.id || value;
  const families = new Map();
  const family = (id) => {
    if (families.has(id)) return families.get(id);
    const ids = new Set([id]);
    for (let changed = true; changed;) {
      changed = false;
      for (const c of categories) if (ids.has(c.parent_id) && !ids.has(c.id)) { ids.add(c.id); changed = true; }
    }
    families.set(id, ids);
    return ids;
  };
  // A product can belong to several descendants of the same category. Keep
  // ancestor membership unique, so one row contributes only once per facet.
  const ancestors = new Map();
  for (const category of categories) for (const descendant of family(category.id)) {
    if (!ancestors.has(descendant)) ancestors.set(descendant, new Set());
    ancestors.get(descendant).add(category.id);
  }
  const rows = [...raw.local.map(p => ({ ...p, origin: 'local' })),
    ...(raw.internationalEnabled ? raw.international.map(p => ({ ...p, origin: 'international' })) : [])]
    .filter(p => p.status === 'published' && p.is_active !== false)
    .map(p => {
      const intl = p.origin === 'international';
      const brand = intl ? brandByText.get(normalize(p.brand)) : brandById.get(p.brand_id);
      const categoryIds = intl ? [p.collectibles_category_id, p.collectibles_subcategory_id].filter(Boolean)
        : [...new Set([p.category_id, ...(p.product_categories || []).map(c => c.category_id)].filter(Boolean))];
      return { ...p, brand_id: brand?.id || p.brand_id, categoryIds,
        ancestorCategoryIds: [...new Set(categoryIds.flatMap(id => [...(ancestors.get(id) || [])]))],
        groupIds: (p.product_group_items || []).map(g => g.group_id),
        themeIds: themesByLicense.get(p.license_id) || [],
        text: normalize([p.title, p.description, brand?.name || p.brand, licenseById.get(p.license_id)?.name].filter(Boolean).join(' ')),
      };
    });
  return { ...raw, rows, resolve, family };
}

export function selectCatalog(catalog, filters, collectionIds = null) {
  const f = filters;
  const category = f.category ? catalog.family(catalog.resolve(catalog.categories, f.category)) : null;
  const brand = catalog.resolve(catalog.brands, f.brand), license = catalog.resolve(catalog.licenses, f.license);
  const theme = catalog.resolve(catalog.themes, f.theme), group = catalog.resolve(catalog.groups, f.group);
  const query = normalize(f.search);
  const terms = new Set(query ? [query, ...(SYNONYMS[query] || [])] : []);
  if (query) {
    terms.add(query.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim());
    const beforeParen = query.split('(')[0].replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (beforeParen.length >= 3) terms.add(beforeParen);
    const words = query.split(/\s+/).filter(w => w.length > 1);
    for (const word of words) {
      for (const synonym of SYNONYMS[word] || []) terms.add(synonym);
      if (word.length >= 4) terms.add(word);
    }
    if (words.length >= 2) terms.add(words.slice(0, 2).join(' '));
    if (words.length >= 3) terms.add(words.slice(0, 3).join(' '));
  }
  const searchTerms = [...terms].map(normalize).filter(Boolean);
  const price = p => Number(p.origin === 'international' ? p.final_price_usd * (f.exchangeRate || 1) : p.base_price);
  const condition = p => p.origin === 'international' || !p.condition || p.condition.startsWith('new') ? 'new' : p.condition.startsWith('loose') ? 'loose' : 'used';
  function matches(p, exclude) {
    const intl = p.origin === 'international';
    if (exclude !== 'availability' && f.availability !== 'all' && p.origin !== f.availability) return false;
    if (exclude !== 'category' && category && !p.categoryIds.some(id => category.has(id))) return false;
    if (exclude !== 'brand' && f.brand && p.brand_id !== brand) return false;
    if (exclude !== 'license' && f.license && (intl || p.license_id !== license)) return false;
    if (exclude !== 'theme' && f.theme && (intl || !p.themeIds.includes(theme))) return false;
    if (exclude !== 'condition' && f.condition && condition(p) !== f.condition) return false;
    if (f.group && (intl || !p.groupIds.includes(group))) return false;
    if (f.vendor_store_id && (intl || p.vendor_store_id !== f.vendor_store_id)) return false;
    if (collectionIds && (intl || !collectionIds.has(p.id))) return false;
    if (f.badge && (intl || p.badge !== f.badge)) return false;
    if (f.featured && (intl || !p.is_featured)) return false;
    if (f.minPrice !== undefined && price(p) < f.minPrice) return false;
    if (f.maxPrice !== undefined && price(p) > f.maxPrice) return false;
    return !searchTerms.length || searchTerms.some(term => p.text.includes(term));
  }
  const rows = [];
  const categoryCounts = new Map(), brandCounts = new Map(), licenseCounts = new Map(), themeCounts = new Map();
  const availabilityCounts = { all: 0, local: 0, international: 0 };
  const conditionCounts = { all: 0, new: 0, used: 0, loose: 0 };
  const increment = (counts, key) => counts.set(key, (counts.get(key) || 0) + 1);
  // Preserve self-excluding facets without rescanning every row for every
  // category, brand, license and theme. The work scales with row membership.
  for (const product of catalog.rows) {
    if (matches(product)) rows.push(product);
    if (matches(product, 'category')) for (const id of product.ancestorCategoryIds) increment(categoryCounts, id);
    if (matches(product, 'brand')) increment(brandCounts, product.brand_id);
    if (product.origin === 'local' && matches(product, 'license')) increment(licenseCounts, product.license_id);
    if (matches(product, 'theme')) for (const id of new Set(product.themeIds)) increment(themeCounts, id);
    if (matches(product, 'availability')) { availabilityCounts.all++; availabilityCounts[product.origin]++; }
    if (matches(product, 'condition')) { conditionCounts.all++; conditionCounts[condition(product)]++; }
  }
  rows.sort((a, b) => {
    let delta = 0;
    if (f.sortBy === 'price-low') delta = price(a) - price(b);
    else if (f.sortBy === 'price-high') delta = price(b) - price(a);
    else if (f.sortBy === 'name') delta = String(a.title).localeCompare(String(b.title), 'es');
    else {
      if (f.sortBy !== 'newest') delta = Number(a.origin === 'international') - Number(b.origin === 'international')
        || Number(!!a.vendor_id) - Number(!!b.vendor_id) || Number(!!b.is_featured) - Number(!!a.is_featured);
      delta ||= new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }
    return delta || `${a.origin}:${a.id}`.localeCompare(`${b.origin}:${b.id}`);
  });
  const facets = {
    categoryFacets: Object.fromEntries(catalog.categories.map(c => [c.id, categoryCounts.get(c.id) || 0])),
    brandFacets: catalog.brands.map(b => ({ brand_id: b.id, brand_name: b.name, brand_slug: b.slug, product_count: brandCounts.get(b.id) || 0 })).filter(b => b.product_count > 0).sort((a,b) => b.product_count - a.product_count || a.brand_name.localeCompare(b.brand_name)),
    licenseFacets: catalog.licenses.map(l => ({ ...l, published_product_count: licenseCounts.get(l.id) || 0 })).filter(l => l.published_product_count > 0).sort((a,b) => Number(!!b.is_featured) - Number(!!a.is_featured) || b.published_product_count - a.published_product_count || a.name.localeCompare(b.name)),
    themeFacets: catalog.themes.map(t => ({ ...t, published_product_count: themeCounts.get(t.id) || 0 })).filter(t => t.published_product_count > 0).sort((a,b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || b.published_product_count - a.published_product_count),
    availabilityCounts, conditionCounts,
    totalCatalogProducts: rows.length,
  };
  return { count: rows.length, selected: rows.slice(f.offset, f.offset + f.limit), facets };
}

export function createCatalogRepository(client, now = Date.now) {
  let snapshot = null, loadedAt = 0, retryAt = 0, pending = null;
  // Maximum staleness safety budget for catalog browsing fallback: 6 hours.
  // Beyond 6 hours, refuse to serve outdated zombie catalogs and return 503 instead.
  const MAX_FALLBACK_AGE_MS = 6 * 60 * 60 * 1000;
  const DISK_SNAPSHOT_PATH = '/tmp/collectibles_catalog_snapshot.json';

  // Match the existing CDN freshness budget: 60s fresh + at most 120s grace.
  // A fallback never advances loadedAt, and cards are still hydrated afresh.
  const cached = stale => ({ catalog: snapshot, stale, age_ms: Math.max(0, now() - loadedAt) });
  const usableFallback = () => Boolean(snapshot) && now() - loadedAt >= 0 && now() - loadedAt < MAX_FALLBACK_AGE_MS;
  let reading = 0;
  const queue = [];
  function pump() {
    while (reading < 3 && queue.length) {
      const job = queue.shift();
      job.signal?.removeEventListener('abort', job.cancel);
      if (job.signal?.aborted) { job.reject(job.signal.reason); continue; }
      reading++;
      Promise.resolve().then(() => {
        if (job.signal?.aborted) throw job.signal.reason;
        return job.task();
      }).then(job.resolve, job.reject).finally(() => { reading--; pump(); });
    }
  }
  const read = (task, signal) => new Promise((resolve, reject) => {
    const job = { task, resolve, reject, signal, cancel: () => {
      const index = queue.indexOf(job);
      if (index !== -1) queue.splice(index, 1);
      reject(signal.reason);
    } };
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener('abort', job.cancel, { once: true });
    queue.push(job);
    pump();
  });
  async function readAll(table, fields, configure = q => q, order = 'id', signal, onFailure) {
    const all = [];
    for (let offset = 0; offset < 50000; offset += 1000) {
      let query = configure(client.from(table).select(fields));
      for (const column of order.split(',')) query = query.order(column);
      let result;
      try {
        result = await read(async () => {
          try {
            signal?.throwIfAborted();
            const page = query.range(offset, offset + 999);
            const response = await (signal && typeof page.abortSignal === 'function' ? page.abortSignal(signal) : page);
            if (response.error || !response.data) throw catalogReadError('snapshot', table, response.error);
            return response;
          } catch (error) {
            const failure = error?.stage ? error : catalogReadError('snapshot', table, error);
            onFailure?.(failure);
            throw failure;
          }
        }, signal);
      } catch (error) { throw error?.stage ? error : catalogReadError('snapshot', table, error); }
      const { data } = result;
      all.push(...data);
      if (data.length < 1000) return all;
    }
    throw new Error('Catalog exceeds snapshot safety limit');
  }
  async function refresh() {
    const controller = new AbortController();
    const signal = AbortSignal.any([AbortSignal.timeout(10000), controller.signal]);
    try {
      let settingsQuery = client.rpc('get_international_public_status');
      if (typeof settingsQuery.abortSignal === 'function') settingsQuery = settingsQuery.abortSignal(signal);
      // International configuration must not take the Uruguay catalog offline.
      // Fail closed for international visibility if the settings RPC is unavailable.
      let internationalEnabled = false;
      try {
        const { data: status, error } = await settingsQuery;
        if (error) throw error;
        internationalEnabled = status?.international_public_enabled === true;
      } catch (error) {
        console.warn('[public-catalog] International status unavailable; serving local catalog only', {
          ...catalogErrorMetadata(catalogReadError('settings', 'international_status', error)),
        });
      }
      const snapshotRows = (table, fields, configure, order = 'id') => readAll(table, fields, configure, order, signal, error => controller.abort(error));
      const [local, international, categories, brands, licenses, themes, licenseThemes, groups] = await Promise.all([
        snapshotRows('products', 'id,title,description,slug,base_price,created_at,status,is_active,brand_id,license_id,category_id,condition,vendor_id,vendor_store_id,badge,is_featured,product_categories(category_id),product_group_items(group_id)', q => q.eq('status','published').eq('is_active',true)),
        internationalEnabled ? snapshotRows('international_products','id,title,description,brand,created_at,status,collectibles_category_id,collectibles_subcategory_id,final_price_usd',q=>q.eq('status','published')) : [],
        snapshotRows('categories','id,name,slug,parent_id,sort_order,image_url,metadata',q=>q.eq('is_active',true).eq('status','approved')),
        snapshotRows('brands','id,name,slug,description,logo_url,sort_order,brand_type,is_vendor_selectable',q=>q.eq('is_active',true).eq('is_public',true).eq('status','approved')),
        snapshotRows('licenses','id,name,slug,is_featured,sort_order,logo_url,logo_alt,banner_url,description',q=>q.eq('is_active',true)),
        snapshotRows('themes','id,name,slug,sort_order,description,image_url,image_alt',q=>q.eq('is_active',true)),
        snapshotRows('license_themes','license_id,theme_id',q=>q,'license_id,theme_id'),
        snapshotRows('product_groups','id,name,slug',q=>q.eq('is_active',true)),
      ]);
      const raw = { local, international, categories, brands, licenses, themes, licenseThemes, groups, internationalEnabled };
      snapshot = prepareCatalog(raw);
      loadedAt = now(); retryAt = 0;
      try {
        fs.promises.writeFile(DISK_SNAPSHOT_PATH, JSON.stringify({ raw, loadedAt })).catch(() => {});
      } catch {}
      return snapshot;
    } catch (error) {
      // A failed snapshot is unusable. Cancel active siblings and queued pages
      // immediately rather than finishing work that cannot become a snapshot.
      controller.abort(error);
      throw error;
    }
  }
  return {
    client,
    readAll,
    async get() {
      // Cold-start disk recovery: if RAM is empty, attempt to hydrate from verified /tmp disk snapshot
      if (!snapshot) {
        try {
          if (fs.existsSync(DISK_SNAPSHOT_PATH)) {
            const diskContent = fs.readFileSync(DISK_SNAPSHOT_PATH, 'utf8');
            const saved = JSON.parse(diskContent);
            if (saved?.raw && (now() - (saved.loadedAt || 0) < MAX_FALLBACK_AGE_MS)) {
              snapshot = prepareCatalog(saved.raw);
              loadedAt = saved.loadedAt;
            }
          }
        } catch {}
      }

      // Keep verified snapshot fresh for 15 minutes (900,000 ms) per serverless instance
      // to prevent repeated 9-query full catalog rebuilds on every minute of traffic.
      if (snapshot && now() - loadedAt >= 0 && now() - loadedAt < 900000) return cached(false);
      if (now() < retryAt) {
        if (usableFallback()) return cached(true);
        throw new Error('Catalog temporarily unavailable');
      }
      if (!pending) pending = refresh().catch(error => {
        retryAt = now() + 30000;
        if (usableFallback()) console.error('[public-catalog] Upstream snapshot refresh failed', {
          ...catalogErrorMetadata(error),
          fallback_available: true, age_ms: now() - loadedAt,
        });
        throw error;
      }).finally(() => { pending = null; });
      // Never replace a verified snapshot with partial results after an upstream failure.
      try { await pending; return cached(false); }
      catch (error) {
        if (usableFallback()) return cached(true);
        throw error;
      }
    },
  };
}

let repository;
export function getCatalogRepository() {
  return repository ||= createCatalogRepository(createPublicSupabase());
}
