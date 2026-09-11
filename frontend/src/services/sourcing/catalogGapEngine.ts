/**
 * SOURCING INTELLIGENCE — FASE 4 — CATALOG GAP ENGINE
 * Collectibles 2026
 * 
 * Agrupa, debounsea y normaliza señales de demanda para identificar huecos de catálogo (Catalog Gaps).
 * Previene la creación descontrolada de discovery requests para consultas similares.
 */

import { supabase } from '../../lib/supabase';
import type { DemandSignal, CatalogGap, GapStatus } from '../../types/sourcingAdaptiveTypes';
import { computeDemandScore } from './demandScoringEngine';

// In-Memory Catalog Gaps buffer for fast local testing and fallback
const inMemoryCatalogGaps = new Map<string, CatalogGap>();

/**
 * Genera una deduplication key limpia y canónica para agrupar términos equivalentes.
 * Ejemplo: "Jada Ken", "Ken Street Fighter Jada", "Street Fighter Ken 1/12"
 * -> "street_fighter:ken:jada_toys:1_12"
 */
export function buildGapDedupeKey(interpreted: DemandSignal['interpreted_query'] = {}, rawQuery: string = ''): string {
  const franchise = (interpreted.franchise || '').toLowerCase().trim().replace(/\s+/g, '_');
  const character = (interpreted.character || '').toLowerCase().trim().replace(/\s+/g, '_');
  const brand = (interpreted.brand || '').toLowerCase().trim().replace(/\s+/g, '_');
  const line = (interpreted.line || '').toLowerCase().trim().replace(/\s+/g, '_');
  const scale = (interpreted.scale || '').replace(/[\/\:\s]/g, '_').toLowerCase().trim();

  // If structured attributes exist
  if (character || franchise || brand) {
    const parts: string[] = [];
    if (franchise) parts.push(franchise);
    if (character) parts.push(character);
    if (brand) parts.push(brand);
    if (line) parts.push(line);
    if (scale) parts.push(scale);
    return parts.join(':');
  }

  // Fallback: title normalization (remove stopwords, sort words)
  const words = rawQuery
    .toLowerCase()
    .replace(/^(de la|de|del|en|para|quiero|busco|figura|figuras)\s+/g, '')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .sort();

  return words.join('_') || 'unknown_gap';
}

/**
 * Procesa una señal de demanda e incrementa o crea el Catalog Gap correspondiente.
 */
export async function processSignalIntoCatalogGap(signal: DemandSignal): Promise<CatalogGap> {
  const gapKey = buildGapDedupeKey(signal.interpreted_query, signal.query);
  const nowIso = new Date().toISOString();

  let existing = inMemoryCatalogGaps.get(gapKey);
  
  if (!existing) {
    existing = {
      id: `gap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      gap_key: gapKey,
      franchise: signal.interpreted_query?.franchise || signal.interpreted_query?.license,
      character: signal.interpreted_query?.character,
      brand: signal.interpreted_query?.brand,
      line: signal.interpreted_query?.line,
      scale: signal.interpreted_query?.scale,
      category: signal.interpreted_query?.category || 'Action Figures',
      keywords: signal.query ? [signal.query] : [],
      search_count: 0,
      zero_result_count: 0,
      unique_users: 1,
      wishlist_interest: 0,
      radar_interest: 0,
      comparison_interest: 0,
      product_views: 0,
      demand_score: 0,
      trend_velocity: 0,
      status: 'DETECTED',
      last_evaluated_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso
    };
  }

  // Increment counters according to signal type
  existing.search_count += 1;
  if (signal.signal_type === 'ZERO_RESULT_SEARCH') {
    existing.zero_result_count += 1;
  }
  if (signal.signal_type === 'WISHLIST_INTENT') {
    existing.wishlist_interest += 1;
  }
  if (signal.signal_type === 'RADAR_CLICK') {
    existing.radar_interest += 1;
  }
  if (signal.signal_type === 'COMPARE_INTENT') {
    existing.comparison_interest += 1;
  }

  if (signal.query && !existing.keywords.includes(signal.query)) {
    existing.keywords.push(signal.query);
  }

  // Recalculate Demand Score
  const scoreResult = computeDemandScore({
    searchCount: existing.search_count,
    zeroResultCount: existing.zero_result_count,
    uniqueUsers: existing.unique_users,
    wishlistInterest: existing.wishlist_interest,
    radarInterest: existing.radar_interest,
    comparisonInterest: existing.comparison_interest,
    lastSignalAt: nowIso
  });

  existing.demand_score = scoreResult.score;
  existing.trend_velocity = scoreResult.trendVelocity;
  existing.updated_at = nowIso;

  if (existing.demand_score >= 50 && existing.status === 'DETECTED') {
    existing.status = 'QUALIFIED';
  }

  inMemoryCatalogGaps.set(gapKey, existing);

  // Sync to Supabase
  if (typeof window !== 'undefined') {
    supabase
      .from('sourcing_catalog_gaps')
      .upsert({
        gap_key: existing.gap_key,
        franchise: existing.franchise,
        character: existing.character,
        brand: existing.brand,
        line: existing.line,
        scale: existing.scale,
        category: existing.category,
        keywords: existing.keywords,
        search_count: existing.search_count,
        zero_result_count: existing.zero_result_count,
        unique_users: existing.unique_users,
        wishlist_interest: existing.wishlist_interest,
        radar_interest: existing.radar_interest,
        comparison_interest: existing.comparison_interest,
        demand_score: existing.demand_score,
        trend_velocity: existing.trend_velocity,
        status: existing.status,
        last_evaluated_at: nowIso,
        updated_at: nowIso
      }, { onConflict: 'gap_key' })
      .then(({ error }) => {
        if (error && import.meta.env?.DEV) {
          console.warn('[CatalogGapEngine] Supabase gap upsert error:', error.message);
        }
      });
  }

  return existing;
}

/**
 * Obtiene los huecos de catálogo más demandados que superan el umbral mínimo.
 */
export async function getQualifiedCatalogGaps(minScore: number = 50): Promise<CatalogGap[]> {
  const localList = Array.from(inMemoryCatalogGaps.values()).filter(g => g.demand_score >= minScore);
  
  if (localList.length > 0) {
    return localList.sort((a, b) => b.demand_score - a.demand_score);
  }

  try {
    const { data } = await supabase
      .from('sourcing_catalog_gaps')
      .select('*')
      .gte('demand_score', minScore)
      .order('demand_score', { ascending: false });

    if (data && data.length > 0) {
      return data as CatalogGap[];
    }
  } catch {}

  return [];
}

export const catalogGapEngine = {
  buildGapDedupeKey,
  processSignalIntoCatalogGap,
  getQualifiedCatalogGaps
};

