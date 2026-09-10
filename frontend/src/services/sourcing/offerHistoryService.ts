/**
 * OFFER HISTORY SERVICE — Fase 1 Sourcing Intelligence
 * Tracks significant changes in offer data (price, availability, condition, seller).
 * Does NOT create duplicate records when values haven't changed.
 * Persists to sourcing_offer_history table in Supabase.
 */

import type { SourceOffer, OfferHistoryEntry, AvailabilityNormalized, ConditionNormalized } from '../../types/sourcing';
import { supabase } from '../../lib/supabase';

// Minimum price change % to record as a new history entry (default: 0.5%)
const DEFAULT_PRICE_CHANGE_THRESHOLD = 0.5;

export interface OfferChangeResult {
  hasChange: boolean;
  changeType: OfferHistoryEntry['change_type'] | 'NO_CHANGE';
  previousValue: Record<string, any>;
  newValue: Record<string, any>;
  summary?: string;
}

/**
 * Detects if a significant change occurred between two offer snapshots.
 * Applies threshold to avoid noise from trivial price fluctuations.
 * Returns NO_CHANGE if values are identical or within threshold.
 */
export function detectOfferChange(
  previous: {
    price?: number;
    availability_normalized?: string;
    condition_normalized?: string;
    seller?: string;
  } | null,
  current: SourceOffer,
  priceThresholdPercent = DEFAULT_PRICE_CHANGE_THRESHOLD
): OfferChangeResult {
  const currentCondition = current.condition_normalized ?? mapLegacyCondition(current.condition);
  const currentAvailability = current.availability_normalized ?? mapLegacyAvailability(current.availability);

  // No previous record → INITIAL
  if (!previous) {
    return {
      hasChange: true,
      changeType: 'INITIAL',
      previousValue: {},
      newValue: {
        price: current.price,
        availability: currentAvailability,
        condition: currentCondition,
        seller: current.seller
      },
      summary: `Primera captura: \$${current.price} USD, ${currentAvailability}, ${currentCondition}`
    };
  }

  // Check price change beyond threshold
  if (previous.price !== undefined && previous.price > 0 && current.price > 0) {
    const diffPct = Math.abs((current.price - previous.price) / previous.price) * 100;
    if (diffPct >= priceThresholdPercent) {
      const direction = current.price > previous.price ? '↑' : '↓';
      return {
        hasChange: true,
        changeType: 'PRICE_CHANGE',
        previousValue: { price: previous.price },
        newValue: { price: current.price, diff_pct: Number(diffPct.toFixed(2)) },
        summary: `Precio ${direction} \$${previous.price} → \$${current.price} USD (${diffPct.toFixed(1)}%)`
      };
    }
  }

  // Check availability change
  if (previous.availability_normalized && previous.availability_normalized !== currentAvailability) {
    return {
      hasChange: true,
      changeType: 'AVAILABILITY_CHANGE',
      previousValue: { availability: previous.availability_normalized },
      newValue: { availability: currentAvailability },
      summary: `Disponibilidad: ${previous.availability_normalized} → ${currentAvailability}`
    };
  }

  // Check condition change
  if (previous.condition_normalized && previous.condition_normalized !== currentCondition) {
    return {
      hasChange: true,
      changeType: 'CONDITION_CHANGE',
      previousValue: { condition: previous.condition_normalized },
      newValue: { condition: currentCondition },
      summary: `Condición: ${previous.condition_normalized} → ${currentCondition}`
    };
  }

  // Check seller change (exact string comparison)
  if (previous.seller && previous.seller !== current.seller) {
    return {
      hasChange: true,
      changeType: 'SELLER_CHANGE',
      previousValue: { seller: previous.seller },
      newValue: { seller: current.seller },
      summary: `Vendedor: "${previous.seller}" → "${current.seller}"`
    };
  }

  return {
    hasChange: false,
    changeType: 'NO_CHANGE',
    previousValue: {},
    newValue: {}
  };
}

/**
 * Records a significant offer change to the sourcing_offer_history table.
 * If no change detected, does nothing.
 * 
 * @returns true if a record was persisted, false if no change detected
 */
export async function recordOfferHistory(
  normalizedProductId: string,
  offer: SourceOffer,
  priceThresholdPercent = DEFAULT_PRICE_CHANGE_THRESHOLD
): Promise<{ recorded: boolean; changeType?: string; summary?: string; error?: string }> {
  try {
    // 1. Get most recent history entry for this offer
    const { data: lastEntry } = await supabase
      .from('sourcing_offer_history')
      .select('price_usd, availability_normalized, condition_normalized, seller, data_source')
      .eq('normalized_product_id', normalizedProductId)
      .eq('source', offer.source)
      .eq('source_product_id', offer.source_product_id)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Detect change
    const previousSnapshot = lastEntry ? {
      price: lastEntry.price_usd,
      availability_normalized: lastEntry.availability_normalized,
      condition_normalized: lastEntry.condition_normalized,
      seller: lastEntry.seller
    } : null;

    const changeResult = detectOfferChange(previousSnapshot, offer, priceThresholdPercent);

    if (!changeResult.hasChange) {
      return { recorded: false };
    }

    // 3. Persist the change
    const historyRecord = {
      normalized_product_id: normalizedProductId,
      source: offer.source,
      source_product_id: offer.source_product_id,
      change_type: changeResult.changeType,
      previous_value: changeResult.previousValue,
      new_value: changeResult.newValue,
      price_usd: offer.price,
      availability_normalized: offer.availability_normalized ?? mapLegacyAvailability(offer.availability),
      condition_normalized: offer.condition_normalized ?? mapLegacyCondition(offer.condition),
      seller: offer.seller,
      checked_at: offer.last_checked_at || new Date().toISOString(),
      data_source: offer.data_source || offer.status || 'RESEARCH_DATA',
      notes: changeResult.summary
    };

    const { error } = await supabase
      .from('sourcing_offer_history')
      .insert(historyRecord);

    if (error) {
      return { recorded: false, error: error.message };
    }

    return {
      recorded: true,
      changeType: changeResult.changeType,
      summary: changeResult.summary
    };
  } catch (err: any) {
    return { recorded: false, error: err.message };
  }
}

/**
 * Batch records history for multiple offers.
 * Each offer is processed independently — one failure does not stop others.
 */
export async function recordBatchOfferHistory(
  normalizedProductId: string,
  offers: SourceOffer[],
  priceThresholdPercent = DEFAULT_PRICE_CHANGE_THRESHOLD
): Promise<{
  recorded: number;
  skipped: number;
  errors: number;
  summary: string[];
}> {
  let recorded = 0;
  let skipped = 0;
  let errors = 0;
  const summary: string[] = [];

  for (const offer of offers) {
    const result = await recordOfferHistory(normalizedProductId, offer, priceThresholdPercent);
    if (result.error) {
      errors++;
    } else if (result.recorded) {
      recorded++;
      if (result.summary) summary.push(`${offer.source}: ${result.summary}`);
    } else {
      skipped++;
    }
  }

  return { recorded, skipped, errors, summary };
}

/**
 * Retrieves price history for a canonical product from a specific source.
 * Ordered by most recent first.
 */
export async function getOfferHistory(
  normalizedProductId: string,
  source?: string,
  limit = 50
): Promise<OfferHistoryEntry[]> {
  let query = supabase
    .from('sourcing_offer_history')
    .select('*')
    .eq('normalized_product_id', normalizedProductId)
    .order('checked_at', { ascending: false })
    .limit(limit);

  if (source) {
    query = query.eq('source', source);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as OfferHistoryEntry[];
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function mapLegacyCondition(condition: string): ConditionNormalized {
  if (condition === 'new') return 'NEW';
  if (condition === 'used') return 'USED';
  if (condition === 'refurbished') return 'REFURBISHED';
  return 'UNKNOWN';
}

function mapLegacyAvailability(availability: string): AvailabilityNormalized {
  if (availability === 'in_stock') return 'IN_STOCK';
  if (availability === 'out_of_stock') return 'OUT_OF_STOCK';
  if (availability === 'preorder') return 'PREORDER';
  if (availability === 'limited') return 'LOW_STOCK';
  return 'UNKNOWN';
}
