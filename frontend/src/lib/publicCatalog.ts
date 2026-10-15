import { registerMediaVariants } from './mediaVariants';

export async function fetchPublicCatalog(filters: Record<string, unknown>, signal: AbortSignal) {
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
    taxonomyRequest = fetchPublicCatalog({ mode: 'facets', availability: 'all', limit: 0 }, AbortSignal.timeout(15000))
      .then(result => { taxonomyCache = { data: result, expires: Date.now() + 60000 }; return result; })
      .finally(() => { taxonomyRequest = null; });
  }
  return taxonomyRequest;
}
