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

// In-memory session cache to avoid repeating lookups during the same admin session
const memoryCache = new Map<string, { data: TiendamiaMatchResult; expiresAt: number }>();

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
 * Consulta puntual por ASIN para comprobar si TiendaMía reconoce/tiene el producto.
 * 
 * Reglas de estricto cumplimiento:
 * - NO scraping, NO crawling, NO navegación con headless browsers.
 * - Match EXCLUSIVAMENTE por ASIN (Amazon ASIN === TiendaMía ASIN).
 * - Cache persistente y en memoria para evitar consultas masivas innecesarias.
 * - Si no existe un endpoint/mecanismo oficial habilitado, responde UNAVAILABLE de forma honesta.
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

  // 2. CHEQUEO EN SUPABASE (sourcing_market_cache)
  try {
    if (!options.forceRefresh) {
      const { data: cachedDb } = await supabase
        .from('sourcing_market_cache')
        .select('*')
        .eq('normalized_product_id', asin)
        .eq('source', 'tiendamia')
        .gt('expires_at', now)
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cachedDb && cachedDb.payload) {
        const result = cachedDb.payload as TiendamiaMatchResult;
        memoryCache.set(asin, { data: result, expiresAt: Date.now() + 1000 * 60 * 30 });
        return result;
      }
    }
  } catch (err) {
    console.warn('[TiendamiaMatch] Error al consultar cache de base de datos:', err);
  }

  // 3. CONSULTA PUNTUAL A MECANISMO DISPONIBLE
  // Nota de Auditoría Técnica:
  // TiendaMía no provee una API pública oficial ni feed autorizado para terceros sin requerir scraping/crawling.
  // Cumpliendo con la política de CERO SCRAPING, declaramos de forma honesta el estado UNAVAILABLE.
  // URL de referencia estructurada por ASIN exacto (sin scraping ni request abusivo):
  const directReferenceUrl = `https://tiendamia.com/uy/producto?amz=${asin}`;

  const unavailableResult: TiendamiaMatchResult = {
    asin,
    found: false,
    exactMatch: false,
    priceUsd: null,
    productUrl: directReferenceUrl,
    status: 'UNAVAILABLE',
    checkedAt: now,
    statusMessage: 'Actualmente no existe un mecanismo disponible para realizar la consulta exacta por ASIN.',
    method: 'EXACT_ASIN_MATCH'
  };

  // Guardar en cache de memoria (TTL 30 min)
  memoryCache.set(asin, {
    data: unavailableResult,
    expiresAt: Date.now() + 1000 * 60 * 30
  });

  // Guardar en persistencia si es posible (TTL 12 horas)
  try {
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    await supabase.from('sourcing_market_cache').upsert(
      {
        normalized_product_id: asin,
        source: 'tiendamia',
        query: asin,
        match_type: 'UNAVAILABLE',
        match_confidence: 0,
        payload: unavailableResult,
        checked_at: now,
        expires_at: expiresAt
      },
      { onConflict: 'normalized_product_id,source' }
    );
  } catch {
    // Si la tabla o RLS no lo permite en modo cliente, se mantiene en memoria sin fallar
  }

  return unavailableResult;
}
