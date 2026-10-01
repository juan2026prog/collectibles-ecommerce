import { supabase } from '../../lib/supabase';

export type TiendamiaMatchStatus =
  | 'FOUND'
  | 'NOT_FOUND'
  | 'NOT_CHECKED'
  | 'UNAVAILABLE'
  | 'ERROR';

export interface TiendamiaMatchResult {
  asin: string;
  found: boolean;
  exactMatch: boolean;
  priceUsd: number | null;
  productUrl: string | null;
  status: TiendamiaMatchStatus;
  checkedAt: string | null;
  statusMessage?: string;
  method: string;
}

// In-memory session cache to avoid repeating lookups during the same session
const memoryCache = new Map<string, { data: TiendamiaMatchResult; expiresAt: number }>();
let isDbCacheAvailable = true;
let isEdgeFunctionAvailable = true;

/**
 * Normaliza un ASIN eliminando espacios en blanco y convirtiendo a mayúsculas.
 * Regla: trim().toUpperCase()
 */
export function normalizeAsin(asin?: string | null): string {
  if (!asin) return '';
  return asin.trim().toUpperCase();
}

/**
 * Compara dos ASIN con match exacto 1:1.
 * Retorna true solo si Amazon ASIN === TiendaMía ASIN tras normalización.
 */
export function compareAsins(amazonAsin?: string | null, targetAsin?: string | null): boolean {
  const normAmazon = normalizeAsin(amazonAsin);
  const normTarget = normalizeAsin(targetAsin);
  if (!normAmazon || !normTarget) return false;
  return normAmazon === normTarget;
}

/**
 * Parsea y valida de forma estricta la respuesta HTML pública de TiendaMía por ASIN.
 * 
 * REGLA ABSOLUTA DE VALIDACIÓN:
 * Un producto SOLAMENTE puede marcarse FOUND si el resultado demuestra:
 * AMZ-{returnedASIN} === AMZ-{requestedASIN}
 * 
 * Cero fuzzy matching, cero title matching, cero IA.
 */
export function parseTiendamiaHtmlResponse(
  html: string,
  requestedAsin: string,
  statusCode: number = 200
): TiendamiaMatchResult {
  const normAsin = normalizeAsin(requestedAsin);
  const now = new Date().toISOString();

  if (statusCode === 404) {
    return {
      asin: normAsin,
      found: false,
      exactMatch: false,
      priceUsd: null,
      productUrl: null,
      status: 'NOT_FOUND',
      checkedAt: now,
      method: 'EXACT_ASIN_MATCH'
    };
  }

  if (statusCode === 403 || statusCode === 429) {
    return {
      asin: normAsin,
      found: false,
      exactMatch: false,
      priceUsd: null,
      productUrl: `https://tiendamia.com.uy/p/amz/${normAsin.toLowerCase()}`,
      status: 'UNAVAILABLE',
      checkedAt: now,
      statusMessage: 'Consulta temporalmente no disponible',
      method: 'EXACT_ASIN_MATCH'
    };
  }

  if (
    html.includes('error-404') ||
    html.includes('cms_noroute_index') ||
    html.includes('¡Ups! No encontramos esta página') ||
    html.includes('No encontramos resultados para tu búsqueda')
  ) {
    return {
      asin: normAsin,
      found: false,
      exactMatch: false,
      priceUsd: null,
      productUrl: null,
      status: 'NOT_FOUND',
      checkedAt: now,
      method: 'EXACT_ASIN_MATCH'
    };
  }

  // REGLA DE SKU: AMZ-{returnedASIN} === AMZ-{requestedASIN}
  const expectedSku = `AMZ-${normAsin}`;
  const unicodeSku = `AMZ\\u002D${normAsin}`;

  const hasExactSku =
    html.includes(`SKU/Artículo: ${expectedSku}`) ||
    html.includes(`data-product-sku="${expectedSku}"`) ||
    html.includes(`"item_id":"${expectedSku}"`) ||
    html.includes(`"productCurrentSku": "${expectedSku}"`) ||
    html.includes(`"productCurrentSku": "${unicodeSku}"`) ||
    html.includes(`data-target-ref="${expectedSku}"`) ||
    html.includes(`content="${normAsin}"`);

  if (!hasExactSku) {
    return {
      asin: normAsin,
      found: false,
      exactMatch: false,
      priceUsd: null,
      productUrl: null,
      status: 'NOT_FOUND',
      checkedAt: now,
      method: 'EXACT_ASIN_MATCH'
    };
  }

  // Extraer URL canónica real de la ficha si existe
  let productUrl: string | null = `https://tiendamia.com.uy/p/amz/${normAsin.toLowerCase()}`;
  const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  if (canonicalMatch && canonicalMatch[1]) {
    productUrl = canonicalMatch[1];
  }

  // Extraer precio en USD si está disponible en la ficha
  let priceUsd: number | null = null;
  const ga4Match = html.match(new RegExp(`"item_id":"(?:AMZ-)?${normAsin}","price":"([0-9.]+)"`, 'i'));
  if (ga4Match && ga4Match[1]) {
    const parsed = parseFloat(ga4Match[1]);
    if (parsed > 0) priceUsd = parsed;
  } else {
    const metaPrice = html.match(/<meta property="product:price:amount" content="([0-9.]+)"/i);
    if (metaPrice && metaPrice[1]) {
      const parsed = parseFloat(metaPrice[1]);
      if (parsed > 0) priceUsd = parsed;
    }
  }

  return {
    asin: normAsin,
    found: true,
    exactMatch: true,
    priceUsd,
    productUrl,
    status: 'FOUND',
    checkedAt: now,
    method: 'EXACT_ASIN_MATCH'
  };
}

/**
 * Consulta puntual por ASIN a TiendaMía bajo demanda.
 * 
 * Cumple estrictamente:
 * - CERO scraping masivo / crawling / bypass.
 * - Validación estricta por SKU AMZ-{ASIN}.
 * - Manejo seguro y silencioso de estados sin desbordar consola.
 * - Cache en memoria (TTL 30 min).
 */
export async function checkTiendamiaByAsin(
  rawAsin: string | undefined | null,
  options: { forceRefresh?: boolean; collectiblesPriceUsd?: number } = {}
): Promise<TiendamiaMatchResult> {
  const asin = normalizeAsin(rawAsin);
  const now = new Date().toISOString();

  if (!asin) {
    return {
      asin: '',
      found: false,
      exactMatch: false,
      priceUsd: null,
      productUrl: null,
      status: 'NOT_FOUND',
      checkedAt: now,
      statusMessage: 'ASIN no proporcionado',
      method: 'EXACT_ASIN_MATCH'
    };
  }

  // 1. CHEQUEO EN CACHE DE MEMORIA
  const cachedMem = memoryCache.get(asin);
  if (!options.forceRefresh && cachedMem && cachedMem.expiresAt > Date.now()) {
    return cachedMem.data;
  }

  // 2. CHEQUEO EN SUPABASE (sourcing_market_cache) solo si la tabla está disponible
  if (isDbCacheAvailable && !options.forceRefresh) {
    try {
      const { data: cachedDb, error: dbError } = await supabase
        .from('sourcing_market_cache')
        .select('*')
        .eq('normalized_product_id', asin)
        .eq('source', 'tiendamia')
        .gt('expires_at', now)
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dbError) {
        // Desactivar futuras llamadas para no generar 404s en consola
        isDbCacheAvailable = false;
      } else if (cachedDb && cachedDb.payload) {
        const result = cachedDb.payload as TiendamiaMatchResult;
        memoryCache.set(asin, { data: result, expiresAt: Date.now() + 1000 * 60 * 30 });
        return result;
      }
    } catch {
      isDbCacheAvailable = false;
    }
  }

  // 3. CONSULTA PUNTUAL SERVER-SIDE VÍA EDGE FUNCTION (si está disponible)
  let result: TiendamiaMatchResult;

  if (isEdgeFunctionAvailable) {
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('sourcing-market-intelligence', {
        body: {
          source: 'tiendamia',
          asin,
          force_refresh: options.forceRefresh ?? false
        }
      });

      if (!edgeError && edgeData && edgeData.status) {
        result = edgeData as TiendamiaMatchResult;
      } else {
        isEdgeFunctionAvailable = false;
        result = {
          asin,
          found: false,
          exactMatch: false,
          priceUsd: null,
          productUrl: `https://tiendamia.com.uy/p/amz/${asin.toLowerCase()}`,
          status: 'UNAVAILABLE',
          checkedAt: now,
          statusMessage: 'Consulta temporalmente no disponible',
          method: 'EXACT_ASIN_MATCH'
        };
      }
    } catch {
      isEdgeFunctionAvailable = false;
      result = {
        asin,
        found: false,
        exactMatch: false,
        priceUsd: null,
        productUrl: `https://tiendamia.com.uy/p/amz/${asin.toLowerCase()}`,
        status: 'UNAVAILABLE',
        checkedAt: now,
        statusMessage: 'Consulta temporalmente no disponible',
        method: 'EXACT_ASIN_MATCH'
      };
    }
  } else {
    result = {
      asin,
      found: false,
      exactMatch: false,
      priceUsd: null,
      productUrl: `https://tiendamia.com.uy/p/amz/${asin.toLowerCase()}`,
      status: 'UNAVAILABLE',
      checkedAt: now,
      statusMessage: 'Consulta temporalmente no disponible',
      method: 'EXACT_ASIN_MATCH'
    };
  }

  // Guardar en cache de memoria (TTL 30 min)
  memoryCache.set(asin, {
    data: result,
    expiresAt: Date.now() + 1000 * 60 * 30
  });

  return result;
}
