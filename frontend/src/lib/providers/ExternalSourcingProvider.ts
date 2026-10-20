/**
 * ExternalSourcingProvider — Proveedor de Descubrimiento Externo (Amazon, eBay, Zinc)
 *
 * Reglas comerciales y de persistencia:
 * 1. Las búsquedas internacionales en vivo son efímeras (memoria/caché de sesión).
 * 2. PROHIBIDO persistir masivamente en D1 o en Supabase todos los resultados de una
 *    búsqueda internacional.
 * 3. Un producto internacional solo pasa a Supabase + D1 cuando es explícitamente
 *    curado/publicado por administración o adquirido por un cliente.
 * 4. Los precios internacionales se expresan en USD conforme a la regla de negocio.
 */

export interface ExternalDiscoveryItem {
  external_product_id: string;
  asin?: string;
  title: string;
  source_provider: 'amazon' | 'ebay' | 'zinc';
  currency: 'USD';
  price_usd: number;
  estimated_uyu?: number | null;
  image_url: string | null;
  ephemeral: true;
}

const discoverySessionCache = new Map<string, { items: ExternalDiscoveryItem[]; expiresAt: number }>();
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos en memoria del navegador

export const ExternalSourcingProvider = {
  getCachedDiscovery(query: string): ExternalDiscoveryItem[] | null {
    const key = query.trim().toLowerCase();
    const cached = discoverySessionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.items;
    }
    return null;
  },

  cacheDiscoveryResults(query: string, rawItems: any[]): ExternalDiscoveryItem[] {
    const key = query.trim().toLowerCase();
    const normalized: ExternalDiscoveryItem[] = (rawItems || [])
      .filter((item) => item && (item.external_product_id || item.asin || item.id) && item.title)
      .slice(0, 24)
      .map((item) => ({
        external_product_id: String(item.external_product_id || item.asin || item.id),
        asin: item.asin ? String(item.asin) : undefined,
        title: String(item.title),
        source_provider: item.source_provider === 'ebay' ? 'ebay' : 'amazon',
        // Regla estricta: precios internacionales en USD
        currency: 'USD' as const,
        price_usd: Number(item.final_price_usd ?? item.price_usd ?? item.base_price ?? 0),
        estimated_uyu: item.final_price_uyu != null ? Number(item.final_price_uyu) : null,
        image_url: item.primary_image_url || item.main_image_url || item.image_url || null,
        ephemeral: true as const,
      }));

    discoverySessionCache.set(key, {
      items: normalized,
      expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS,
    });

    return normalized;
  },
};
