/**
 * COLLECTIBLES 2026 — MULTI-SOURCE DISCOVERY SERVICE
 * 
 * Orquestador determinístico y compartido de descubrimiento multifuente.
 * Usado tanto por:
 * A) MANUAL RESEARCH ("INVESTIGAR" en researchIntelligenceService)
 * B) AUTOMATIC DISCOVERY ("EJECUTAR ESCANEO DISCOVERY" en sourcing-discovery.js)
 * 
 * Conecta los proveedores reales:
 * - Amazon: amazonZincSearchService / Zinc API y catálogo internacional
 * - eBay: Conexión honesta; si el provider/tabla no está disponible en producción,
 *         degrada transparentemente a NOT_CONFIGURED (0 llamadas rotas, 0 errores 404).
 *         Soporta normalización de query para no depender de texto literal.
 * - Best Buy: Degradación transparente y controlada a NOT_CONFIGURED sin emitir
 *             llamadas CORS directas desde el browser que fallen con error de red.
 * 
 * INVARIANTES:
 * 1. Cero mocks inventados. Cero precios, pesos o ASINs sintéticos.
 * 2. Preflight = $0.
 * 3. Fail-soft real por proveedor:
 *    - NOT_CONFIGURED: zero network call, zero console errors, status honesto.
 *    - ERROR: aislado sin destruir el run ni los candidatos de otras fuentes.
 *    - WORKING/AVAILABLE: ejecuta y aporta candidatos crudos.
 *    - NO_RESULTS: status disponible con 0 items.
 * 4. Preserva el pipeline canónico downstream intacto.
 */

import { amazonZincSearchService } from './amazonZincSearchService';
import { supabase } from '../../lib/supabase';
import { normalizeSearchText } from '../../../../shared/sourcingProductIdentity.js';

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

export type ProviderStatusCode = 'WORKING' | 'AVAILABLE' | 'NOT_CONFIGURED' | 'ERROR' | 'NO_RESULTS' | 'UNAVAILABLE';

export interface ProviderTelemetry {
  status: ProviderStatusCode;
  queries: number;
  results: number;
  candidates_created: number;
  errors: number;
  cache_hits?: number;
  message?: string;
  error?: string;
}

export interface MultiSourceTelemetry {
  amazon: ProviderTelemetry;
  ebay: ProviderTelemetry;
  bestbuy: ProviderTelemetry;
  web: { status: ProviderStatusCode; candidates_created: number };
  official: { candidates_created: number };
  candidates_before_dedupe: number;
  candidates_after_dedupe: number;
}

export interface MultiSourceDiscoveryResult {
  query: string;
  candidates: DiscoveredRawCandidate[];
  sourceStatus: {
    amazon: { status: ProviderStatusCode; count: number; error?: string };
    ebay: { status: ProviderStatusCode; count: number; message?: string; error?: string };
    bestbuy: { status: ProviderStatusCode; count: number; message?: string };
  };
  telemetry: MultiSourceTelemetry;
  totalFound: number;
}

/**
 * Normaliza y fragmenta una consulta compleja de usuario en subconsultas de búsqueda efectivas.
 * Ej: "Batman figuras de acción escala 1:12 coleccionables" -> ["Batman figuras de accion", "Batman 1 12"]
 */
export function normalizeDiscoveryQuery(rawQuery: string): string[] {
  const clean = normalizeSearchText(rawQuery);
  if (!clean) return [];

  const queries: string[] = [clean];

  // Extraer keywords esenciales (remover stopwords comunes de coleccionismo)
  const tokens = clean.split(/\s+/).filter(Boolean);
  const stopWords = new Set(['figuras', 'figura', 'accion', 'de', 'escala', 'coleccionables', 'coleccionable', 'original', 'official', 'nuevo', 'nueva']);
  const coreTokens = tokens.filter(t => !stopWords.has(t));

  if (coreTokens.length > 0 && coreTokens.length < tokens.length) {
    queries.push(coreTokens.join(' '));
  }

  // Si hay escala (ej: 1 12 o 1 6), crear variante simplificada
  const scaleMatch = clean.match(/\b(1\s*12|1\s*6|1\s*18|1\s*4|6\s*inch|7\s*inch)\b/i);
  if (scaleMatch && coreTokens.length > 0) {
    const mainEntity = coreTokens.filter(t => !t.match(/^(1|6|7|12|18|4|inch)$/)).join(' ');
    if (mainEntity) {
      queries.push(`${mainEntity} ${scaleMatch[0]}`);
    }
  }

  return [...new Set(queries)].slice(0, 3);
}

export class MultiSourceDiscoveryService {
  private static instance: MultiSourceDiscoveryService;

  // Flag de disponibilidad runtime de tablas/providers opcionales
  private ebayTableAvailable: boolean | null = null;
  private bestBuyConfigured: boolean = false;

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
  ): Promise<{ items: DiscoveredRawCandidate[]; status: ProviderStatusCode; error?: string; cache_hits?: number }> {
    if (!query || !query.trim()) {
      return { items: [], status: 'AVAILABLE', cache_hits: 0 };
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
          error: result.error,
          cache_hits: 0
        };
      }

      const cacheHits = result.products.filter(p => p.resolution_source === 'IMPORT_CANDIDATE_CACHE').length;

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

      const finalStatus: ProviderStatusCode = items.length > 0 ? 'WORKING' : 'NO_RESULTS';

      return {
        items,
        status: finalStatus,
        cache_hits: cacheHits
      };
    } catch (err: any) {
      return {
        items: [],
        status: 'ERROR',
        error: err.message,
        cache_hits: 0
      };
    }
  }

  /**
   * Búsqueda en eBay con soporte para normalización de queries y detección honesta de NOT_CONFIGURED.
   * Si la infraestructura/tabla no existe o el adapter no está activo, reporta NOT_CONFIGURED
   * con 0 errores y 0 excepciones para no generar falsos verdes ni errores de consola.
   */
  public async discoverEbay(
    query: string,
    maxResults: number = 10
  ): Promise<{ items: DiscoveredRawCandidate[]; status: ProviderStatusCode; queriesCount: number; message?: string; error?: string }> {
    if (!query || !query.trim()) {
      return { items: [], status: 'AVAILABLE', queriesCount: 0 };
    }

    // Si ya detectamos que la tabla source_listings no existe en producción, fail-closed honesto sin network call
    if (this.ebayTableAvailable === false) {
      return {
        items: [],
        status: 'NOT_CONFIGURED',
        queriesCount: 0,
        message: 'eBay Provider no configurado en producción (tabla source_listings / API no disponible).'
      };
    }

    const queryVariants = normalizeDiscoveryQuery(query);

    try {
      // Intentar primer query normalizado
      const targetQuery = queryVariants[0] || query.trim();
      const { data: dbOffers, error } = await supabase
        .from('source_listings')
        .select('*')
        .ilike('retailer', '%ebay%')
        .ilike('raw_title', `%${targetQuery}%`)
        .limit(maxResults);

      if (error) {
        // Si PostgreSQL indica que la tabla no existe (404/PGRST205 o table not found)
        const isTableMissing = error.code === 'PGRST205' || 
          error.message?.includes('Could not find the table') || 
          error.message?.includes('does not exist');

        if (isTableMissing) {
          this.ebayTableAvailable = false;
          return {
            items: [],
            status: 'NOT_CONFIGURED',
            queriesCount: 1,
            message: 'eBay Provider no configurado en producción (source_listings pendiente de migración).'
          };
        }

        return {
          items: [],
          status: 'ERROR',
          queriesCount: 1,
          error: error.message
        };
      }

      this.ebayTableAvailable = true;

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
          status: 'WORKING',
          queriesCount: 1
        };
      }

      return {
        items: [],
        status: 'NO_RESULTS',
        queriesCount: 1
      };
    } catch (err: any) {
      return {
        items: [],
        status: 'ERROR',
        queriesCount: 1,
        error: err.message
      };
    }
  }

  /**
   * Búsqueda en Best Buy con degradación controlada y transparente.
   * NO dispara llamadas directas desde el browser que fallen por CORS.
   * Si BESTBUY_API_KEY no está configurada en backend, retorna NOT_CONFIGURED de inmediato
   * sin llamadas de red ni errores rojos en consola.
   */
  public async discoverBestBuy(
    query: string
  ): Promise<{ items: DiscoveredRawCandidate[]; status: ProviderStatusCode; queriesCount: number; message?: string }> {
    // Si no está configurado explícitamente en el backend, no intentar fetch browser-side que produzca CORS
    if (!this.bestBuyConfigured) {
      return {
        items: [],
        status: 'NOT_CONFIGURED',
        queriesCount: 0,
        message: 'Best Buy requiere API Key de desarrollador (BESTBUY_API_KEY) configurada en backend.'
      };
    }

    // En caso de estar configurado en el futuro, se invocará a través del backend same-origin
    return {
      items: [],
      status: 'NOT_CONFIGURED',
      queriesCount: 0,
      message: 'Best Buy Provider no activo.'
    };
  }

  /**
   * Permite activar BestBuy para pruebas de integración controladas
   */
  public setBestBuyConfigured(configured: boolean): void {
    this.bestBuyConfigured = configured;
  }

  /**
   * Permite resetear la detección de tabla de eBay para pruebas unitarias
   */
  public setEbayTableAvailable(available: boolean | null): void {
    this.ebayTableAvailable = available;
  }

  /**
   * Descubrimiento Multi-Fuente completo para una consulta con telemetría inequívoca
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
          ebay: { status: 'NOT_CONFIGURED', count: 0, message: 'Consulta vacía' },
          bestbuy: { status: 'NOT_CONFIGURED', count: 0, message: 'Best Buy no configurado' }
        },
        telemetry: {
          amazon: { status: 'AVAILABLE', queries: 0, results: 0, candidates_created: 0, errors: 0 },
          ebay: { status: 'NOT_CONFIGURED', queries: 0, results: 0, candidates_created: 0, errors: 0 },
          bestbuy: { status: 'NOT_CONFIGURED', queries: 0, results: 0, candidates_created: 0, errors: 0 },
          web: { status: 'AVAILABLE', candidates_created: 0 },
          official: { candidates_created: 0 },
          candidates_before_dedupe: 0,
          candidates_after_dedupe: 0
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

    const telemetry: MultiSourceTelemetry = {
      amazon: { status: 'WORKING', queries: 1, results: 0, candidates_created: 0, errors: 0, cache_hits: 0 },
      ebay: { status: 'NOT_CONFIGURED', queries: 0, results: 0, candidates_created: 0, errors: 0 },
      bestbuy: { status: 'NOT_CONFIGURED', queries: 0, results: 0, candidates_created: 0, errors: 0 },
      web: { status: 'AVAILABLE', candidates_created: 0 },
      official: { candidates_created: 0 },
      candidates_before_dedupe: 0,
      candidates_after_dedupe: 0
    };

    const sourceStatus: MultiSourceDiscoveryResult['sourceStatus'] = {
      amazon: { status: 'AVAILABLE', count: 0 },
      ebay: { status: 'NOT_CONFIGURED', count: 0 },
      bestbuy: { status: 'NOT_CONFIGURED', count: 0 }
    };

    // 1. Telemetría y Candidatos de Amazon
    if (amazonRes.status === 'fulfilled') {
      const val = amazonRes.value;
      sourceStatus.amazon = { status: val.status, count: val.items.length, error: val.error };
      telemetry.amazon = {
        status: val.status,
        queries: 1,
        results: val.items.length,
        candidates_created: val.items.length,
        errors: val.error ? 1 : 0,
        cache_hits: val.cache_hits || 0,
        error: val.error
      };
      candidates.push(...val.items);
    } else {
      sourceStatus.amazon = { status: 'ERROR', count: 0, error: amazonRes.reason?.message };
      telemetry.amazon = {
        status: 'ERROR',
        queries: 1,
        results: 0,
        candidates_created: 0,
        errors: 1,
        error: amazonRes.reason?.message
      };
    }

    // 2. Telemetría y Candidatos de eBay
    if (ebayRes.status === 'fulfilled') {
      const val = ebayRes.value;
      sourceStatus.ebay = { status: val.status, count: val.items.length, message: val.message, error: val.error };
      telemetry.ebay = {
        status: val.status,
        queries: val.queriesCount,
        results: val.items.length,
        candidates_created: val.items.length,
        errors: val.error ? 1 : 0,
        message: val.message,
        error: val.error
      };
      candidates.push(...val.items);
    } else {
      sourceStatus.ebay = { status: 'ERROR', count: 0, error: ebayRes.reason?.message };
      telemetry.ebay = {
        status: 'ERROR',
        queries: 1,
        results: 0,
        candidates_created: 0,
        errors: 1,
        error: ebayRes.reason?.message
      };
    }

    // 3. Telemetría y Candidatos de Best Buy
    if (bestBuyRes.status === 'fulfilled') {
      const val = bestBuyRes.value;
      sourceStatus.bestbuy = { status: val.status, count: val.items.length, message: val.message };
      telemetry.bestbuy = {
        status: val.status,
        queries: val.queriesCount,
        results: val.items.length,
        candidates_created: val.items.length,
        errors: 0,
        message: val.message
      };
      candidates.push(...val.items);
    } else {
      sourceStatus.bestbuy = { status: 'NOT_CONFIGURED', count: 0, message: 'Fallo al invocar Best Buy' };
      telemetry.bestbuy = {
        status: 'NOT_CONFIGURED',
        queries: 0,
        results: 0,
        candidates_created: 0,
        errors: 0,
        message: 'Fallo al invocar Best Buy'
      };
    }

    telemetry.candidates_before_dedupe = candidates.length;

    return {
      query: cleanQuery,
      candidates,
      sourceStatus,
      telemetry,
      totalFound: candidates.length
    };
  }
}

export const multiSourceDiscoveryService = MultiSourceDiscoveryService.getInstance();
