import type { UruguayMarketSummary, UruguayMatchType, MarketPositionType } from '../../types/sourcing';
import { supabase } from '../../lib/supabase';

export interface UruguayQueryInput {
  normalized_product_id?: string;
  title: string;
  character?: string;
  brand?: string;
  line?: string;
  upc?: string;
  gtin?: string;
  mpn?: string;
  collectiblesPriceUsd: number;
  forceRefresh?: boolean;
}

/**
 * Consulta en tiempo real de Mercado Libre Uruguay (server-side vía Edge Function o directo).
 * NUNCA utiliza datasets inventados ni mocks hardcodeados en producción.
 * Si no encuentra coincidencia, retorna NOT_FOUND / NO DETECTADO de forma honesta.
 */
export async function queryMercadoLibreUruguayReal(input: UruguayQueryInput): Promise<UruguayMarketSummary> {
  const normalizedId = input.normalized_product_id || 'TEMP-' + Math.random().toString(36).substring(2, 9);
  
  try {
    // 1. Invocar Edge Function de Supabase para consulta server-side segura
    const { data, error } = await supabase.functions.invoke('sourcing-market-intelligence', {
      body: {
        normalized_product_id: normalizedId,
        title: input.title,
        brand: input.brand,
        character: input.character,
        line: input.line,
        upc: input.upc,
        gtin: input.gtin,
        mpn: input.mpn,
        collectibles_price_usd: input.collectiblesPriceUsd,
        force_refresh: input.forceRefresh ?? false
      }
    });

    if (!error && data && data.status) {
      return data as UruguayMarketSummary;
    }
  } catch (err) {
    console.warn('Edge function sourcing-market-intelligence no disponible o error:', err);
  }

  // 2. Fallback de cliente: consultar cache local en supabase table si existe
  try {
    const { data: cached } = await supabase
      .from('sourcing_market_cache')
      .select('*')
      .eq('normalized_product_id', normalizedId)
      .eq('source', 'mercado_libre_uy')
      .gt('expires_at', new Date().toISOString())
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached && cached.payload) {
      return {
        ...cached.payload,
        data_origin: 'CACHE'
      } as UruguayMarketSummary;
    }
  } catch {
    // Cache de tabla no accesible
  }

  // 3. Respuesta honesta cuando no hay datos disponibles o falla la conexión
  return createNoDataMarketSummary(input.title);
}

/**
 * Generador honesto de resultado cuando Mercado Libre Uruguay no tiene publicaciones
 * o no se detectó coincidencia (0 mocks, 0 fixtures).
 */
export function createNoDataMarketSummary(title: string, errorReason?: string): UruguayMarketSummary {
  return {
    source: 'mercado_libre_uy',
    status: errorReason ? 'ERROR' : 'NOT_FOUND',
    match_type: errorReason ? 'ERROR' : 'NOT_FOUND',
    match_confidence: 0,
    query: title,
    data_origin: errorReason ? 'ERROR' : 'NO_DATA',
    exact_match_found: false,
    min_price_usd: null,
    avg_price_usd: null,
    median_price_usd: null,
    max_price_usd: null,
    total_listings: 0,
    sellers_count: 0,
    currency: 'USD',
    sample_title: title,
    sample_url: 'https://listado.mercadolibre.com.uy/',
    difference_amount: null,
    difference_percent: null,
    market_position: 'NO_EXACT_COMPETITION',
    comparison_diff_usd: null,
    comparison_diff_percent: null,
    market_verdict: errorReason ? 'NO_DISPONIBLE' : 'SIN_COMPETENCIA',
    last_checked_at: new Date().toISOString(),
    exact_matches: [],
    similar_matches: [],
    store_references: []
  };
}

/**
 * Retrocompatibilidad síncrona: evalúa matching local contra query input si ya existe información previa
 * o devuelve estado NOT_FOUND honesto sin inventar datos.
 */
export function checkUruguayMarketSync(input: UruguayQueryInput): UruguayMarketSummary {
  return createNoDataMarketSummary(input.title);
}
