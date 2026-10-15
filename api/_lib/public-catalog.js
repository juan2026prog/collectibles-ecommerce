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
  const resolve = (items, value) => items.find(item => item.id === value || item.slug === value)?.id || value;
  const family = (id) => {
    const ids = new Set([id]);
    for (let changed = true; changed;) {
      changed = false;
      for (const c of categories) if (ids.has(c.parent_id) && !ids.has(c.id)) { ids.add(c.id); changed = true; }
    }
    return ids;
  };
  const rows = [...raw.local.map(p => ({ ...p, origin: 'local' })),
    ...(raw.internationalEnabled ? raw.international.map(p => ({ ...p, origin: 'international' })) : [])]
    .filter(p => p.status === 'published' && p.is_active !== false)
    .map(p => {
      const intl = p.origin === 'international';
      const brand = intl ? brands.find(b => normalize(b.name) === normalize(p.brand) || b.slug === normalize(p.brand)) : brandById.get(p.brand_id);
      return { ...p, brand_id: brand?.id || p.brand_id,
        categoryIds: intl ? [p.collectibles_category_id, p.collectibles_subcategory_id].filter(Boolean)
          : [...new Set([p.category_id, ...(p.product_categories || []).map(c => c.category_id)].filter(Boolean))],
        groupIds: (p.product_group_items || []).map(g => g.group_id),
        themeIds: licenseThemes.filter(lt => lt.license_id === p.license_id).map(lt => lt.theme_id),
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
  const rows = catalog.rows.filter(p => matches(p));
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
  const count = (exclude, predicate) => catalog.rows.reduce((n, p) => n + Number(matches(p, exclude) && predicate(p)), 0);
  const facets = {
    categoryFacets: Object.fromEntries(catalog.categories.map(c => { const family = catalog.family(c.id); return [c.id, count('category', p => p.categoryIds.some(id => family.has(id)))]; })),
    brandFacets: catalog.brands.map(b => ({ brand_id: b.id, brand_name: b.name, brand_slug: b.slug, product_count: count('brand', p => p.brand_id === b.id) })).filter(b => b.product_count > 0).sort((a,b) => b.product_count - a.product_count || a.brand_name.localeCompare(b.brand_name)),
    licenseFacets: catalog.licenses.map(l => ({ ...l, published_product_count: count('license', p => p.origin === 'local' && p.license_id === l.id) })).filter(l => l.published_product_count > 0).sort((a,b) => Number(!!b.is_featured) - Number(!!a.is_featured) || b.published_product_count - a.published_product_count || a.name.localeCompare(b.name)),
    themeFacets: catalog.themes.map(t => ({ ...t, published_product_count: count('theme', p => p.themeIds.includes(t.id)) })).filter(t => t.published_product_count > 0).sort((a,b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || b.published_product_count - a.published_product_count),
    availabilityCounts: { all: count('availability', () => true), local: count('availability', p => p.origin === 'local'), international: count('availability', p => p.origin === 'international') },
    conditionCounts: { all: count('condition', () => true), new: count('condition', p => condition(p) === 'new'), used: count('condition', p => condition(p) === 'used'), loose: count('condition', p => condition(p) === 'loose') },
    totalCatalogProducts: rows.length,
  };
  return { count: rows.length, selected: rows.slice(f.offset, f.offset + f.limit), facets };
}

export function createCatalogRepository(client, now = Date.now) {
  let snapshot = null, loadedAt = 0, retryAt = 0, pending = null;
  let reading = 0;
  const queue = [];
  const read = task => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    function pump() {
      while (reading < 3 && queue.length) {
        const job = queue.shift(); reading++;
        Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { reading--; pump(); });
      }
    }
    pump();
  });
  async function readAll(table, fields, configure = q => q, order = 'id', signal) {
    const all = [];
    for (let offset = 0; offset < 50000; offset += 1000) {
      let query = configure(client.from(table).select(fields));
      for (const column of order.split(',')) query = query.order(column);
      const { data, error } = await read(() => {
        if (signal?.aborted) throw new Error('Catalog snapshot deadline exceeded');
        const page = query.range(offset, offset + 999);
        return signal && typeof page.abortSignal === 'function' ? page.abortSignal(signal) : page;
      });
      if (error || !data) throw new Error(`Catalog read failed: ${table}`);
      all.push(...data);
      if (data.length < 1000) return all;
    }
    throw new Error('Catalog exceeds snapshot safety limit');
  }
  async function refresh() {
    const signal = AbortSignal.timeout(10000);
    const { data: status, error } = await client.rpc('get_international_public_status');
    if (error) throw new Error('Catalog settings unavailable');
    const internationalEnabled = status?.international_public_enabled === true;
    const snapshotRows = (table, fields, configure, order = 'id') => readAll(table, fields, configure, order, signal);
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
    snapshot = prepareCatalog({ local, international, categories, brands, licenses, themes, licenseThemes, groups, internationalEnabled });
    loadedAt = now(); retryAt = 0;
    return snapshot;
  }
  return {
    client,
    readAll,
    async get() {
      if (snapshot && now() - loadedAt < 60000) return { catalog: snapshot, stale: false };
      if (now() < retryAt) throw new Error('Catalog temporarily unavailable');
      if (!pending) pending = refresh().catch(error => { retryAt = now() + 30000; throw error; }).finally(() => { pending = null; });
      // Never replace a verified snapshot with partial results after an upstream failure.
      const catalog = await pending;
      return { catalog, stale: false };
    },
  };
}

let repository;
export function getCatalogRepository() {
  return repository ||= createCatalogRepository(createPublicSupabase());
}
