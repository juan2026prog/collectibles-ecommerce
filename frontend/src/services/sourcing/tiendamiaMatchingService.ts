import { supabase } from '../../lib/supabase';
import { parseTiendamiaResponse } from '../../../../shared/sourcingMarketPresence.js';

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
  presence?: 'PRESENT' | 'VERIFIED_ABSENT' | 'UNKNOWN';
}

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
  return parseTiendamiaResponse(html, requestedAsin, statusCode) as TiendamiaMatchResult;
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
  options: { forceRefresh?: boolean; collectiblesPriceUsd?: number; identifierVerification?: string; sourceUrl?: string; title?: string } = {}
): Promise<TiendamiaMatchResult> {
  const asin = normalizeAsin(rawAsin);
  const unknown: TiendamiaMatchResult = { asin, found: false, exactMatch: false, priceUsd: null, productUrl: null,
    status: 'NOT_CHECKED', presence: 'UNKNOWN', checkedAt: null, method: 'EXACT_ASIN_MATCH', statusMessage: 'No verificado' };
  if (!/^[A-Z0-9]{10}$/.test(asin) || options.identifierVerification !== 'SOURCE_VERIFIED' || !options.sourceUrl || !options.title) return unknown;
  const cacheKey = asin + '|' + options.sourceUrl + '|' + options.title;
  const cached = memoryCache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return unknown;
    const response = await fetch('/api/sourcing-discovery', { method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action: 'market_presence', asin, source_url: options.sourceUrl, title: options.title }) });
    if (!response.ok) return { ...unknown, status: 'UNAVAILABLE' };
    const payload = await response.json();
    const result = { ...unknown, ...payload, presence: ['PRESENT', 'VERIFIED_ABSENT'].includes(payload.presence) ? payload.presence : 'UNKNOWN' } as TiendamiaMatchResult;
    memoryCache.set(cacheKey, { data: result, expiresAt: Date.now() + (result.presence === 'UNKNOWN' ? 60000 : 30 * 60000) });
    return result;
  } catch { return { ...unknown, status: 'UNAVAILABLE' }; }
}
