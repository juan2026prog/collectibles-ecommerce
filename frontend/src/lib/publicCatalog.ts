import { registerMediaVariants } from './mediaVariants';
import { PublicCatalogProvider, CatalogKillSwitchError } from './providers/PublicCatalogProvider';

export async function fetchPublicCatalog(filters: Record<string, unknown>, signal: AbortSignal) {
  const mode = String(filters.mode || 'cards');

  if ((mode === 'taxonomies' || mode === 'facets') && PublicCatalogProvider.isDomainEnabled('taxonomies')) {
    try {
      const cleanFilters: Record<string, string | number | boolean> = {};
      Object.keys(filters).sort().forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          cleanFilters[key] = typeof value === 'boolean' || typeof value === 'number' ? value : String(value);
        }
      });

      if (mode === 'facets' && Object.keys(cleanFilters).some(k => !['mode', 'limit', 'availability'].includes(k))) {
        const { data } = await PublicCatalogProvider.getPublicCatalogCompatible(cleanFilters);
        return data;
      }

      const { data } = await PublicCatalogProvider.getTaxonomies(
        filters.brand_id ? String(filters.brand_id) : undefined
      );
      return data;
    } catch (err) {
      if (!(err instanceof CatalogKillSwitchError)) {
        throw err;
      }
      // Runtime kill-switch activated: fall through immediately to /api/public-catalog
    }
  }

  if (PublicCatalogProvider.isDomainEnabled('products')) {
    try {
      const cleanFilters: Record<string, string | number | boolean> = {};
      Object.keys(filters).sort().forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          cleanFilters[key] = typeof value === 'boolean' || typeof value === 'number' ? value : String(value);
        }
      });
      const { data } = await PublicCatalogProvider.getProducts(cleanFilters);
      const count = data.count ?? data.pagination?.total ?? data.products?.length ?? 0;
      registerMediaVariants(data.image_variants || []);
      return {
        ...data,
        count,
        totalCount: count,
      };
    } catch (err) {
      if (!(err instanceof CatalogKillSwitchError)) {
        throw err;
      }
      // Runtime kill-switch activated: fall through immediately to /api/public-catalog
    }
  }

  const params = new URLSearchParams();
  Object.keys(filters).sort().forEach(key => {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const response = await fetch(`/api/public-catalog?${params}`, {
    credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error('El catálogo está temporalmente demorado. Intentá nuevamente.');
  const result = await response.json();
  registerMediaVariants(result.image_variants);
  return result;
}

let taxonomyCache: { data: any; expires: number } | null = null;
let taxonomyRequest: Promise<any> | null = null;

export function resetPublicTaxonomyCache() {
  taxonomyCache = null;
  taxonomyRequest = null;
}

export async function fetchPublicTaxonomies() {
  if (taxonomyCache && taxonomyCache.expires > Date.now()) return taxonomyCache.data;
  if (!taxonomyRequest) {
    const loader = PublicCatalogProvider.isDomainEnabled('taxonomies')
      ? PublicCatalogProvider.getTaxonomies()
          .then(r => r.data)
          .catch(err => {
            if (err instanceof CatalogKillSwitchError) {
              return fetchPublicCatalog({ mode: 'facets', availability: 'all', limit: 0 }, AbortSignal.timeout(15000));
            }
            throw err;
          })
      : fetchPublicCatalog({ mode: 'facets', availability: 'all', limit: 0 }, AbortSignal.timeout(15000));
    taxonomyRequest = loader
      .then(result => { taxonomyCache = { data: result, expires: Date.now() + 300000 }; return result; })
      .finally(() => { taxonomyRequest = null; });
  }
  return taxonomyRequest;
}
