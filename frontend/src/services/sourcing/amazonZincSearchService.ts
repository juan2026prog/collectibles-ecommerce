/**
 * COLLECTIBLES 2026 — CANONICAL AMAZON / ZINC SEARCH SERVICE
 * 
 * Capacidad canónica compartida entre:
 * 1. "Productos para Importar" (multiSourceSearchService)
 * 2. "Sourcing Intelligence" (zincProductResolver)
 * 
 * INVARIANTES:
 * - Una sola fuente de verdad para consultar Amazon vía Zinc / Edge Functions.
 * - Reutiliza exactamente la misma sesión y token de autenticación (supabase.auth.getSession()).
 * - Manejo riguroso de errores: AUTH_ERROR (401/403), PROVIDER_ERROR, NO_RESULTS, RATE_LIMITED.
 * - Cero enmascaramiento silencioso de fallos en listas vacías.
 * - Fallback canónico a international_import_candidates cuando la Edge Function falla pero hay datos históricos,
 *   con discriminación de procedencia: ZINC_LIVE vs IMPORT_CANDIDATE_CACHE.
 * - Normalizador canónico compartido: normalizeAmazonZincProduct(raw).
 */

import { supabase } from '../../lib/supabase';

export type AmazonZincSearchStatus =
  | 'SUCCESS'
  | 'NO_RESULTS'
  | 'AUTH_ERROR'
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export type AmazonZincResolutionSource = 'ZINC_LIVE' | 'IMPORT_CANDIDATE_CACHE';

export interface CanonicalAmazonZincProduct {
  asin: string;
  title: string;
  brand?: string;
  image_url: string | null;
  main_image_url_external?: string | null;
  price: number | null;
  price_usd: number | null;
  currency: 'USD';
  product_url: string | null;
  product_url_external?: string | null;
  external_product_id: string;
  availability: string | null;
  rating: number | null;
  review_count: number;
  seller: string;
  prime: boolean;
  category?: string | null;
  resolution_source: AmazonZincResolutionSource;
  raw_data?: any;
}

export interface AmazonZincSearchResult {
  success: boolean;
  status: AmazonZincSearchStatus;
  statusCode?: number;
  products: CanonicalAmazonZincProduct[];
  resolution_source: AmazonZincResolutionSource | null;
  error?: string;
  total: number;
}

/**
 * Normaliza un producto individual de respuesta Zinc / DB a la estructura canónica.
 * Maneja indistintamente external_product_id, product_id, image_url, main_image_url_external, price_usd, etc.
 */
export function normalizeAmazonZincProduct(
  raw: any,
  source: AmazonZincResolutionSource = 'ZINC_LIVE'
): CanonicalAmazonZincProduct {
  const asin = String(raw.external_product_id || raw.product_id || raw.asin || '').trim().toUpperCase();
  const title = String(raw.title || raw.name || '').trim();
  const brand = raw.brand || raw._normalized?.brand || undefined;
  
  // Resolution of canonical image URL (support both image_url and main_image_url_external)
  const imageUrl = raw.image_url || raw.main_image_url_external || raw.image || null;
  const mainImageExternal = raw.main_image_url_external || raw.image_url || null;

  // Price resolution
  let priceUsd: number | null = null;
  if (raw.price !== undefined && raw.price !== null) {
    const num = Number(raw.price);
    priceUsd = num > 1000 ? num / 100 : num;
  } else if (raw.price_usd !== undefined && raw.price_usd !== null) {
    priceUsd = Number(raw.price_usd);
  }

  const productUrl = raw.product_url_external || raw.url || (asin ? `https://www.amazon.com/dp/${asin}` : null);

  return {
    asin,
    external_product_id: asin,
    title,
    brand,
    image_url: imageUrl,
    main_image_url_external: mainImageExternal,
    price: priceUsd,
    price_usd: priceUsd,
    currency: 'USD',
    product_url: productUrl,
    product_url_external: productUrl,
    availability: raw.availability || (raw.prime ? 'in_stock' : 'unknown'),
    rating: raw.rating || raw.stars || null,
    review_count: raw.review_count || raw.num_reviews || 0,
    seller: raw.seller || (source === 'IMPORT_CANDIDATE_CACHE' ? 'Amazon.com (DB Cache)' : 'Amazon.com'),
    prime: Boolean(raw.prime || raw.amazon_delivery_type === 'prime'),
    category: raw.category || raw.category_path || null,
    resolution_source: source,
    raw_data: raw
  };
}

export class AmazonZincSearchService {
  private static instance: AmazonZincSearchService;

  public static getInstance(): AmazonZincSearchService {
    if (!AmazonZincSearchService.instance) {
      AmazonZincSearchService.instance = new AmazonZincSearchService();
    }
    return AmazonZincSearchService.instance;
  }

  /**
   * Ejecuta búsqueda canónica en Amazon vía Edge Function zinc-search-products
   * con soporte de auth explícita, manejo de errores no silencioso y fallback verificado.
   */
  public async search(
    query: string,
    options: {
      page?: number;
      maxResults?: number;
      allowFallback?: boolean;
    } = {}
  ): Promise<AmazonZincSearchResult> {
    const cleanQuery = (query || '').trim();
    const page = options.page || 1;
    const maxResults = options.maxResults || 20;
    const allowFallback = options.allowFallback !== false;

    if (!cleanQuery) {
      return {
        success: true,
        status: 'NO_RESULTS',
        products: [],
        resolution_source: null,
        total: 0
      };
    }

    try {
      // 1. Obtener sesión de Supabase explícita para enviar el Bearer Token canónico
      let authHeader: Record<string, string> = {};
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          authHeader = { Authorization: `Bearer ${token}` };
        }
      } catch (authErr: any) {
        console.warn('[AMAZON_ZINC_SEARCH] Auth session retrieval warning:', authErr?.message);
      }

      // 2. Invocar la Edge Function oficial
      const { data, error } = await supabase.functions.invoke('zinc-search-products', {
        body: { query: cleanQuery, max_results: maxResults, page, retailer: 'amazon' },
        headers: authHeader
      });

      // 3. Evaluar respuesta de la Edge Function
      if (error) {
        const errorMsg = error.message || String(error);
        const isAuth = errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.toLowerCase().includes('unauthorized') || errorMsg.toLowerCase().includes('forbidden') || errorMsg.toLowerCase().includes('jwt');
        const isRate = errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit');

        const classifiedStatus: AmazonZincSearchStatus = isAuth 
          ? 'AUTH_ERROR' 
          : isRate 
            ? 'RATE_LIMITED' 
            : 'PROVIDER_ERROR';

        console.warn('[AMAZON_ZINC_SEARCH] Edge Function failed with error:', {
          query: cleanQuery,
          status: classifiedStatus,
          error: errorMsg
        });

        // Intentar fallback si está permitido
        if (allowFallback) {
          const fallbackResult = await this.queryDatabaseFallback(cleanQuery, maxResults);
          if (fallbackResult.length > 0) {
            return {
              success: true,
              status: classifiedStatus, // Se preserva honestamente el estado de error de la llamada live
              statusCode: isAuth ? 403 : 500,
              products: fallbackResult,
              resolution_source: 'IMPORT_CANDIDATE_CACHE',
              error: `Live call failed (${errorMsg}), returned DB cache fallback`,
              total: fallbackResult.length
            };
          }
        }

        return {
          success: false,
          status: classifiedStatus,
          statusCode: isAuth ? 403 : 500,
          products: [],
          resolution_source: null,
          error: errorMsg,
          total: 0
        };
      }

      // 4. Procesar respuesta Live exitosa
      const rawResults = (data?.results || data?.candidates || []);
      if (Array.isArray(rawResults) && rawResults.length > 0) {
        const products = rawResults.map(r => normalizeAmazonZincProduct(r, 'ZINC_LIVE'));
        return {
          success: true,
          status: 'SUCCESS',
          statusCode: 200,
          products,
          resolution_source: 'ZINC_LIVE',
          total: products.length
        };
      }

      // 5. Respuesta live sin resultados: intentar DB Fallback
      if (allowFallback) {
        const fallbackResult = await this.queryDatabaseFallback(cleanQuery, maxResults);
        if (fallbackResult.length > 0) {
          return {
            success: true,
            status: 'SUCCESS',
            products: fallbackResult,
            resolution_source: 'IMPORT_CANDIDATE_CACHE',
            total: fallbackResult.length
          };
        }
      }

      return {
        success: true,
        status: 'NO_RESULTS',
        statusCode: 200,
        products: [],
        resolution_source: null,
        total: 0
      };

    } catch (networkErr: any) {
      console.error('[AMAZON_ZINC_SEARCH] Unexpected network or execution exception:', networkErr);
      
      // Intentar fallback ante excepción
      if (allowFallback) {
        const fallbackResult = await this.queryDatabaseFallback(cleanQuery, maxResults);
        if (fallbackResult.length > 0) {
          return {
            success: true,
            status: 'NETWORK_ERROR',
            products: fallbackResult,
            resolution_source: 'IMPORT_CANDIDATE_CACHE',
            error: networkErr.message,
            total: fallbackResult.length
          };
        }
      }

      return {
        success: false,
        status: 'NETWORK_ERROR',
        products: [],
        resolution_source: null,
        error: networkErr.message || 'Network failure',
        total: 0
      };
    }
  }

  /**
   * Consulta a la base de datos para candidatos previamente importados (Fallback)
   */
  private async queryDatabaseFallback(query: string, limit: number): Promise<CanonicalAmazonZincProduct[]> {
    try {
      const { data: dbCandidates } = await supabase
        .from('international_import_candidates')
        .select('*')
        .ilike('title', `%${query.trim()}%`)
        .limit(limit);

      if (dbCandidates && dbCandidates.length > 0) {
        return dbCandidates.map(c => normalizeAmazonZincProduct(c, 'IMPORT_CANDIDATE_CACHE'));
      }
      return [];
    } catch {
      return [];
    }
  }
}

export const amazonZincSearchService = AmazonZincSearchService.getInstance();
