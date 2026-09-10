/**
 * SOURCING INTELLIGENCE — FASE 4 — DEMAND SIGNAL ENGINE
 * Collectibles 2026
 * 
 * Captura, normaliza y persiste señales de demanda de usuarios desde
 * AI Search, Wishlist, Radar, Comparador, Vault y Release Calendar.
 */

import { supabase } from '../../lib/supabase';
import { getOrCreateSessionId } from './personalizationEngine';
import type { DemandSignal, DemandSignalType, AdaptiveEntityType } from '../../types/sourcingAdaptiveTypes';

// In-Memory Signal Store for zero-latency local gap aggregation
const inMemoryDemandSignals: DemandSignal[] = [];

/**
 * Normaliza y limpia una señal de demanda antes de registrarla.
 */
export function normalizeDemandSignal(raw: Partial<DemandSignal>): DemandSignal {
  const sessionId = raw.session_id || getOrCreateSessionId();
  const userId = raw.user_id || null;
  const signalType: DemandSignalType = raw.signal_type || 'HIGH_INTENT_SEARCH';

  let weight = raw.weight || 1.0;
  if (signalType === 'ZERO_RESULT_SEARCH') weight = 4.0;
  else if (signalType === 'LOW_RESULT_SEARCH') weight = 2.5;
  else if (signalType === 'REPEATED_SEARCH') weight = 3.0;
  else if (signalType === 'WISHLIST_INTENT') weight = 3.0;
  else if (signalType === 'RADAR_CLICK') weight = 2.5;
  else if (signalType === 'COMPARE_INTENT') weight = 2.0;

  const interpreted = raw.interpreted_query || {};
  let entityType: AdaptiveEntityType = raw.entity_type || 'PRODUCT';
  let entityId = raw.entity_id || '';

  if (!entityId) {
    if (interpreted.character && interpreted.brand) {
      entityType = 'CHARACTER';
      entityId = `${interpreted.brand}:${interpreted.character}`.toLowerCase();
    } else if (interpreted.franchise) {
      entityType = 'FRANCHISE';
      entityId = interpreted.franchise.toLowerCase();
    } else if (interpreted.brand) {
      entityType = 'BRAND';
      entityId = interpreted.brand.toLowerCase();
    } else if (raw.query) {
      entityType = 'ATTRIBUTE_COMBINATION';
      entityId = raw.query.toLowerCase().trim();
    }
  }

  return {
    user_id: userId,
    session_id: sessionId,
    signal_type: signalType,
    query: raw.query?.trim(),
    interpreted_query: interpreted,
    results_count: raw.results_count ?? 0,
    entity_type: entityType,
    entity_id: entityId,
    weight,
    source: raw.source || 'ai_search',
    metadata: raw.metadata || {},
    created_at: new Date().toISOString()
  };
}

/**
 * Registra una señal de demanda en la memoria y en Supabase async.
 */
export async function captureDemandSignal(signalInput: Partial<DemandSignal>): Promise<DemandSignal> {
  const signal = normalizeDemandSignal(signalInput);
  
  // 1. In-memory buffer
  inMemoryDemandSignals.push(signal);
  if (inMemoryDemandSignals.length > 500) {
    inMemoryDemandSignals.shift();
  }

  // 2. Non-blocking Supabase persistence
  if (typeof window !== 'undefined') {
    supabase
      .from('sourcing_demand_signals')
      .insert({
        user_id: signal.user_id,
        session_id: signal.session_id,
        signal_type: signal.signal_type,
        query: signal.query,
        interpreted_query: signal.interpreted_query,
        results_count: signal.results_count,
        entity_type: signal.entity_type,
        entity_id: signal.entity_id,
        weight: signal.weight,
        source: signal.source,
        metadata: signal.metadata
      })
      .then(({ error }) => {
        if (error && import.meta.env?.DEV) {
          console.warn('[DemandSignalEngine] Supabase signal insert error:', error.message);
        }
      });
  }

  return signal;
}

/**
 * Obtiene todas las señales acumuladas recientemente en memoria o desde DB.
 */
export async function getRecentDemandSignals(limit: number = 100): Promise<DemandSignal[]> {
  if (inMemoryDemandSignals.length > 0) {
    return inMemoryDemandSignals.slice(-limit);
  }

  try {
    const { data } = await supabase
      .from('sourcing_demand_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (data && data.length > 0) {
      return data as DemandSignal[];
    }
  } catch {}

  return [];
}
