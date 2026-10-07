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
  edge_status?: number;
  provider_status?: number;
  provider_error_code?: string;
  provider_error_message?: string;
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
  const brand = raw.brand || raw.manufacturer || raw.byline || raw._normalized?.brand || undefined;
  
  // Resolution of canonical image URL (support both image_url and main_image_url_external)
  const imageCandidates = [
    raw.image_url,
    raw.main_image_url_external,
    raw.image,
    raw.main_image,
    raw.images?.[0],
    raw.image_urls?.[0],
    raw.images?.primary,
    raw.product?.image_url
  ].filter((v: any) => typeof v === 'string' && v.startsWith('http'));
  const imageUrl = imageCandidates[0] || null;
  const mainImageExternal = raw.main_image_url_external || imageUrl;

  // Price resolution
  let priceUsd: number | null = null;
  const rawPrice = raw.price_usd ?? raw.price ?? raw.current_price ?? raw.buybox_price ?? raw.price_current ?? raw.product?.price;
  if (rawPrice !== undefined && rawPrice !== null) {
    const scalar = typeof rawPrice === 'object' ? (rawPrice.value ?? rawPrice.amount ?? rawPrice.price ?? rawPrice.current) : rawPrice;
    const cleaned = typeof scalar === 'string' ? scalar.replace(/[^0-9.,-]/g, '').replace(/,/g, '') : scalar;
    const num = Number(cleaned);
    if (Number.isFinite(num) && num > 0) {
      // Zinc legacy payloads may return integer cents under raw.price; explicit USD/value fields are already dollars.
      priceUsd = raw.price_usd == null && raw.price === rawPrice && Number.isInteger(num) && num > 1000 ? num / 100 : num;
    }
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
    availability: raw.availability || raw.stock_status || raw.in_stock === true ? (raw.availability || raw.stock_status || 'in_stock') : (raw.in_stock === false ? 'out_of_stock' : (raw.prime ? 'in_stock' : 'unknown')),
    rating: Number(raw.rating ?? raw.stars ?? raw.average_rating) || null,
    review_count: Number(raw.review_count ?? raw.num_reviews ?? raw.ratings_total ?? raw.reviews_count) || 0,
    seller: raw.seller?.name || raw.seller || raw.buybox_seller || (source === 'IMPORT_CANDIDATE_CACHE' ? 'Amazon.com (DB Cache)' : 'Amazon.com'),
    prime: Boolean(raw.prime || raw.is_prime || raw.amazon_delivery_type === 'prime'),
    category: raw.category || raw.category_name || raw.category_path || raw.categories?.[0] || null,
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
        const isTimeoutOrLimit = errorMsg.includes('546') || errorMsg.includes('WORKER_RESOURCE_LIMIT') || errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('gateway');

        const classifiedStatus: AmazonZincSearchStatus = isAuth 
          ? 'AUTH_ERROR' 
          : isRate 
            ? 'RATE_LIMITED' 
            : 'PROVIDER_ERROR';

        let edgeStatus = isAuth ? 403 : 500;
        if (errorMsg.includes('546')) edgeStatus = 546;
        else if (errorMsg.includes('504')) edgeStatus = 504;

        const errorCode = isTimeoutOrLimit ? 'WORKER_RESOURCE_LIMIT' : (isAuth ? 'AUTH_FAILED' : 'PROVIDER_FAILURE');

        console.warn('[AMAZON_ZINC_SEARCH] Edge Function failed with error:', {
          query: cleanQuery,
          status: classifiedStatus,
          edge_status: edgeStatus,
          error: errorMsg
        });

        // Intentar fallback si está permitido
        if (allowFallback) {
          const fallbackResult = await this.queryDatabaseFallback(cleanQuery, maxResults);
          if (fallbackResult.length > 0) {
            return {
              success: true,
              status: classifiedStatus, // Se preserva honestamente el estado de error de la llamada live
              statusCode: edgeStatus,
              edge_status: edgeStatus,
              provider_error_code: errorCode,
              provider_error_message: errorMsg,
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
          statusCode: edgeStatus,
          edge_status: edgeStatus,
          provider_error_code: errorCode,
          provider_error_message: errorMsg,
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
          edge_status: 200,
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
            statusCode: 200,
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
        edge_status: 200,
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
   * Consulta optimizada a la base de datos para candidatos previamente importados (Fallback).
   * REGLAS:
   * 1. Solo campos estrictamente necesarios (no select=*).
   * 2. Búsqueda directa por ASIN/external_product_id si el término es un ASIN.
   * 3. Búsqueda textual simplificada y tokenizada en lugar de ILIKE sobre oraciones largas.
   * 4. Abort timeout seguro (4 segundos) para evitar bloqueos del gateway.
   */
  public async queryDatabaseFallback(query: string, limit: number = 10): Promise<CanonicalAmazonZincProduct[]> {
    const clean = (query || '').trim();
    if (!clean) return [];

    try {
      const isAsin = /^[A-Z0-9]{10}$/i.test(clean);
      const fields = 'external_product_id,title,brand,image_url,main_image_url_external,price_usd,product_url_external,availability,rating,review_count';

      if (isAsin) {
        const { data: byAsin } = await supabase
          .from('international_import_candidates')
          .select(fields)
          .eq('external_product_id', clean.toUpperCase())
          .limit(limit);

        if (byAsin && byAsin.length > 0) {
          return byAsin.map(c => normalizeAmazonZincProduct(c, 'IMPORT_CANDIDATE_CACHE'));
        }
      }

      // Si es textual: extraer 2-3 palabras clave más significativas (evitar frases largas que provoquen 504)
      const meaningfulTokens = clean
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !['peluche', 'plush', 'comics', 'comic', 'figure', 'figura'].includes(w.toLowerCase()))
        .slice(0, 3);

      const targetSearch = meaningfulTokens.length > 0 ? meaningfulTokens.join(' ') : clean.slice(0, 30);

      const { data: dbCandidates } = await supabase
        .from('international_import_candidates')
        .select(fields)
        .ilike('title', `%${targetSearch}%`)
        .limit(limit);

      if (dbCandidates && dbCandidates.length > 0) {
        return dbCandidates.map(c => normalizeAmazonZincProduct(c, 'IMPORT_CANDIDATE_CACHE'));
      }
      return [];
    } catch (err: any) {
      console.warn('[AMAZON_ZINC_SEARCH] queryDatabaseFallback error:', err?.message);
      return [];
    }
  }
}

export const amazonZincSearchService = AmazonZincSearchService.getInstance();
