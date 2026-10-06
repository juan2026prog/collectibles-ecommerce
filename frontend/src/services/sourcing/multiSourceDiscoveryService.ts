/**
 * COLLECTIBLES 2026 — MULTI-SOURCE DISCOVERY SERVICE
 * 
 * Orquestador determinístico y compartido de descubrimiento multifuente.
 * Usado tanto por:
 * A) MANUAL RESEARCH ("INVESTIGAR" en researchIntelligenceService)
 * B) AUTOMATIC DISCOVERY ("EJECUTAR ESCANEO DISCOVERY" en sourcing-discovery.js)
 * 
 * Conecta los proveedores reales:
 * - Amazon (vía amazonZincSearchService / Zinc API y catálogo)
 * - eBay (vía source_listings y catálogo de ofertas)
 * - Best Buy (degradación controlada y transparente NOT_CONFIGURED cuando falta BESTBUY_API_KEY)
 * - Web Search (OpenAI Web Search a través del gateway)
 * 
 * INVARIANTES:
 * 1. Cero mocks inventados. Cero precios, pesos o ASINs sintéticos.
 * 2. Preflight = $0.
 * 3. Fail-soft por proveedor: si un proveedor falla o no está configurado,
 *    no interrumpe la ejecución ni los resultados de los demás.
 * 4. Preserva el pipeline canónico downstream: validación, deduplicación,
 *    Zinc resolution, enriquecimiento comercial (Landed cost, TM, MLU, Margin, Opportunity Score).
 */

import { amazonZincSearchService } from './amazonZincSearchService';
import { supabase } from '../../lib/supabase';
import type { RetailerSource } from '../../types/sourcing';

export interface DiscoveredRawCandidate {
  title: string;
  brand?: string;
  url?: string;
  retailer?: string;
  source_retailer?: string;
  origin_price_usd?: number | null;
  price?: number | null;
  image_url?: string;
  asin?: string;
  provider: 'AMAZON' | 'EBAY' | 'BESTBUY' | 'WEB_SEARCH';
  discovered_from: 'RETAILER_DISCOVERY' | 'MANUAL_RESEARCH' | 'RADAR' | 'WATCHLIST';
  metadata?: Record<string, any>;
}

export interface MultiSourceDiscoveryStatus {
  amazon: { status: 'AVAILABLE' | 'UNAVAILABLE' | 'ERROR'; count: number; error?: string };
  ebay: { status: 'AVAILABLE' | 'UNAVAILABLE' | 'ERROR'; count: number; error?: string };
  bestbuy: { status: 'AVAILABLE' | 'NOT_CONFIGURED' | 'ERROR'; count: number; message?: string };
}

export interface MultiSourceDiscoveryResult {
  query: string;
  candidates: DiscoveredRawCandidate[];
  sourceStatus: MultiSourceDiscoveryStatus;
  totalFound: number;
}

export class MultiSourceDiscoveryService {
  private static instance: MultiSourceDiscoveryService;

  public static getInstance(): MultiSourceDiscoveryService {
    if (!MultiSourceDiscoveryService.instance) {
      MultiSourceDiscoveryService.instance = new MultiSourceDiscoveryService();
    }
    return MultiSourceDiscoveryService.instance;
  }

  /**
   * Búsqueda en Amazon para descubrimiento de candidatos
   */
  public async discoverAmazon(
    query: string,
    maxResults: number = 10
  ): Promise<{ items: DiscoveredRawCandidate[]; status: 'AVAILABLE' | 'UNAVAILABLE' | 'ERROR'; error?: string }> {
    if (!query || !query.trim()) {
      return { items: [], status: 'AVAILABLE' };
    }

    try {
      const result = await amazonZincSearchService.search(query.trim(), {
        page: 1,
        maxResults,
        allowFallback: true
      });

      if (!result.success && result.products.length === 0) {
        return {
          items: [],
          status: result.status === 'AUTH_ERROR' ? 'UNAVAILABLE' : 'ERROR',
          error: result.error
        };
      }

      const items: DiscoveredRawCandidate[] = result.products.map(p => ({
        title: p.title,
        brand: p.brand || undefined,
        url: p.product_url || (p.asin ? `https://www.amazon.com/dp/${p.asin}` : undefined),
        retailer: 'amazon',
        source_retailer: 'amazon',
        origin_price_usd: typeof p.price_usd === 'number' && Number.isFinite(p.price_usd) ? p.price_usd : null,
        price: typeof p.price_usd === 'number' && Number.isFinite(p.price_usd) ? p.price_usd : null,
        image_url: p.image_url || undefined,
        asin: p.asin,
        provider: 'AMAZON',
        discovered_from: 'RETAILER_DISCOVERY',
        metadata: {
          seller: p.seller,
          rating: p.rating,
          review_count: p.review_count,
          category: p.category,
          resolution_source: p.resolution_source
        }
      }));

      return {
        items,
        status: 'AVAILABLE'
      };
    } catch (err: any) {
      return {
        items: [],
        status: 'ERROR',
        error: err.message
      };
    }
  }

  /**
   * Búsqueda en eBay para descubrimiento de candidatos
   */
  public async discoverEbay(
    query: string,
    maxResults: number = 10
  ): Promise<{ items: DiscoveredRawCandidate[]; status: 'AVAILABLE' | 'UNAVAILABLE' | 'ERROR'; error?: string }> {
    if (!query || !query.trim()) {
      return { items: [], status: 'AVAILABLE' };
    }

    try {
      const { data: dbOffers, error } = await supabase
        .from('source_listings')
        .select('*')
        .ilike('retailer', '%ebay%')
        .ilike('raw_title', `%${query.trim()}%`)
        .limit(maxResults);

      if (error) {
        return {
          items: [],
          status: 'ERROR',
          error: error.message
        };
      }

      if (dbOffers && dbOffers.length > 0) {
        const items: DiscoveredRawCandidate[] = dbOffers.map(d => {
          const rawPrice = d.raw_price_cents ? d.raw_price_cents / 100 : (d.raw_payload?.price ?? null);
          const validPrice = typeof rawPrice === 'number' && Number.isFinite(rawPrice) ? rawPrice : null;
          return {
            title: d.raw_title,
            brand: d.raw_brand || undefined,
            url: d.source_url,
            retailer: 'ebay',
            source_retailer: 'ebay',
            origin_price_usd: validPrice,
            price: validPrice,
            image_url: d.raw_payload?.image_url || undefined,
            provider: 'EBAY',
            discovered_from: 'RETAILER_DISCOVERY',
            metadata: {
              seller: d.raw_payload?.seller,
              condition: d.raw_condition || 'used',
              is_lot: Boolean(d.raw_payload?.is_lot),
              is_auction: Boolean(d.raw_payload?.is_auction)
            }
          };
        });

        return {
          items,
          status: 'AVAILABLE'
        };
      }

      return {
        items: [],
        status: 'AVAILABLE'
      };
    } catch (err: any) {
      return {
        items: [],
        status: 'ERROR',
        error: err.message
      };
    }
  }

  /**
   * Búsqueda en Best Buy con degradación honesta
   */
  public async discoverBestBuy(
    query: string
  ): Promise<{ items: DiscoveredRawCandidate[]; status: 'AVAILABLE' | 'NOT_CONFIGURED' | 'ERROR'; message?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('sourcing-bestbuy-search', {
        body: { query: query.trim(), max_results: 10 }
      });

      if (error) {
        const isRuntimeFailure = error.message?.toLowerCase().includes('timeout') || error.message?.toLowerCase().includes('500') || error.message?.toLowerCase().includes('server error');
        if (isRuntimeFailure) {
          return {
            items: [],
            status: 'ERROR',
            message: error.message
          };
        }
        return {
          items: [],
          status: 'NOT_CONFIGURED',
          message: 'Best Buy requiere API Key de desarrollador configurada en el backend (BESTBUY_API_KEY).'
        };
      }

      if (data?.status === 'NOT_CONFIGURED') {
        return {
          items: [],
          status: 'NOT_CONFIGURED',
          message: data.message || 'Best Buy requiere API Key de desarrollador (BESTBUY_API_KEY).'
        };
      }

      const rawItems = Array.isArray(data?.products) ? data.products : (Array.isArray(data?.items) ? data.items : []);
      const items: DiscoveredRawCandidate[] = rawItems.map((p: any) => ({
        title: p.title || p.name,
        brand: p.brand || undefined,
        url: p.url,
        retailer: 'bestbuy',
        source_retailer: 'bestbuy',
        origin_price_usd: typeof p.price === 'number' && Number.isFinite(p.price) ? p.price : null,
        price: typeof p.price === 'number' && Number.isFinite(p.price) ? p.price : null,
        image_url: p.image_url || p.image || undefined,
        provider: 'BESTBUY',
        discovered_from: 'RETAILER_DISCOVERY'
      }));

      return {
        items,
        status: 'AVAILABLE'
      };
    } catch {
      return {
        items: [],
        status: 'NOT_CONFIGURED',
        message: 'Best Buy no está configurado.'
      };
    }
  }

  /**
   * Descubrimiento Multi-Fuente completo para una consulta
   */
  public async discoverAllSources(
    query: string,
    options: { maxAmazon?: number; maxEbay?: number } = {}
  ): Promise<MultiSourceDiscoveryResult> {
    const cleanQuery = query?.trim() || '';
    if (!cleanQuery) {
      return {
        query: '',
        candidates: [],
        sourceStatus: {
          amazon: { status: 'AVAILABLE', count: 0 },
          ebay: { status: 'AVAILABLE', count: 0 },
          bestbuy: { status: 'NOT_CONFIGURED', count: 0, message: 'Best Buy no configurado' }
        },
        totalFound: 0
      };
    }

    const [amazonRes, ebayRes, bestBuyRes] = await Promise.allSettled([
      this.discoverAmazon(cleanQuery, options.maxAmazon || 10),
      this.discoverEbay(cleanQuery, options.maxEbay || 10),
      this.discoverBestBuy(cleanQuery)
    ]);

    const candidates: DiscoveredRawCandidate[] = [];
    const status: MultiSourceDiscoveryStatus = {
      amazon: { status: 'AVAILABLE', count: 0 },
      ebay: { status: 'AVAILABLE', count: 0 },
      bestbuy: { status: 'NOT_CONFIGURED', count: 0 }
    };

    if (amazonRes.status === 'fulfilled') {
      const val = amazonRes.value;
      status.amazon = { status: val.status, count: val.items.length, error: val.error };
      candidates.push(...val.items);
    } else {
      status.amazon = { status: 'ERROR', count: 0, error: amazonRes.reason?.message };
    }

    if (ebayRes.status === 'fulfilled') {
      const val = ebayRes.value;
      status.ebay = { status: val.status, count: val.items.length, error: val.error };
      candidates.push(...val.items);
    } else {
      status.ebay = { status: 'ERROR', count: 0, error: ebayRes.reason?.message };
    }

    if (bestBuyRes.status === 'fulfilled') {
      const val = bestBuyRes.value;
      status.bestbuy = { status: val.status, count: val.items.length, message: val.message };
      candidates.push(...val.items);
    } else {
      status.bestbuy = { status: 'NOT_CONFIGURED', count: 0, message: 'Fallo al invocar adaptador Best Buy' };
    }

    return {
      query: cleanQuery,
      candidates,
      sourceStatus: status,
      totalFound: candidates.length
    };
  }
}

export const multiSourceDiscoveryService = MultiSourceDiscoveryService.getInstance();
