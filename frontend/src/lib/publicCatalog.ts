import { registerMediaVariants } from './mediaVariants';
import { PublicCatalogProvider } from './providers/PublicCatalogProvider';

export async function fetchPublicCatalog(filters: Record<string, unknown>, signal: AbortSignal) {
  const mode = String(filters.mode || 'cards');

  if (mode === 'taxonomies' && PublicCatalogProvider.isDomainEnabled('taxonomies')) {
    const { data } = await PublicCatalogProvider.getTaxonomies(
      filters.brand_id ? String(filters.brand_id) : undefined
    );
    return data;
  }

  if (PublicCatalogProvider.isDomainEnabled('products')) {
    const cleanFilters: Record<string, string | number | boolean> = {};
    Object.keys(filters).sort().forEach(key => {
      const value = filters[key];
      if (value !== undefined && value !== null && value !== '') {
        cleanFilters[key] = typeof value === 'boolean' || typeof value === 'number' ? value : String(value);
      }
    });
    const { data } = await PublicCatalogProvider.getProducts(cleanFilters);
    return {
      ...data,
      totalCount: data.pagination?.total ?? data.products?.length ?? 0,
    };
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
export async function fetchPublicTaxonomies() {
  if (taxonomyCache && taxonomyCache.expires > Date.now()) return taxonomyCache.data;
  if (!taxonomyRequest) {
    const loader = PublicCatalogProvider.isDomainEnabled('taxonomies')
      ? PublicCatalogProvider.getTaxonomies().then(r => r.data)
      : fetchPublicCatalog({ mode: 'facets', availability: 'all', limit: 0 }, AbortSignal.timeout(15000));
    taxonomyRequest = loader
      .then(result => { taxonomyCache = { data: result, expires: Date.now() + 300000 }; return result; })
      .finally(() => { taxonomyRequest = null; });
  }
  return taxonomyRequest;
}
