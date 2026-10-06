// ============================================================
// COLLECTIBLES 2026 — SOURCING DISCOVERY ENGINE
// Motor de orquestación de descubrimiento autónomo.
// Lee tendencias y descubrimientos reales persistidos en Supabase.
// ============================================================

import { supabase } from '../../lib/supabase';
import { storedCandidates } from './canonicalCandidateValidation';
import { TrendEngine } from './trendEngine';
import { collectiblesSignalAggregator } from './collectiblesSignalAggregator';
import { marketSignalAggregator } from './marketSignalAggregator';
import { resolveZincProductsForCandidates } from './zincProductResolver';
import { enrichCandidatesCommercialData } from './candidateCommercialEnrichment';
import { deduplicateCanonicalCandidates } from '../../../../shared/sourcingCandidateValidation.js';
import type { SourcingTrendCard, SourcingProductCandidate } from '../../types/sourcingIntelligence';

export class SourcingDiscoveryEngine {
  private static instance: SourcingDiscoveryEngine;

  public static getInstance(): SourcingDiscoveryEngine {
    if (!SourcingDiscoveryEngine.instance) {
      SourcingDiscoveryEngine.instance = new SourcingDiscoveryEngine();
    }
    return SourcingDiscoveryEngine.instance;
  }

  /**
   * Carga tendencias dinámicas y persistidas para un país objetivo.
   * Si no hay registros en la base de datos, retorna un array vacío [] (cero mocks).
   */
  public async loadLiveTrends(country: string = 'UY'): Promise<SourcingTrendCard[]> {
    try {
      const isGlobal = !country || country === 'GLOBAL' || country === 'ALL' || country === 'TODOS';
      const countryList = isGlobal ? ['GLOBAL', 'UY', 'US', 'ALL', 'AR', 'CL'] : [country, 'GLOBAL'];
      const { data: dbTrends, error } = await supabase
        .from('sourcing_trends')
        .select('*')
        .in('country', countryList)
        .order('composite_score', { ascending: false });

      if (error) {
        console.warn('[SourcingDiscoveryEngine] Error leyendo sourcing_trends:', error);
      }

      if (dbTrends && dbTrends.length > 0) {
        return dbTrends.map(t => ({
          id: t.id,
          topic: t.topic,
          category: t.category || 'Coleccionables',
          status: t.status as any,
          direction: t.direction as any,
          market_trend_score: t.market_trend_score,
          collectibles_trend_score: t.collectibles_trend_score,
          composite_trend_score: t.composite_score,
          confidence: t.confidence as any,
          drivers: Array.isArray(t.drivers) ? t.drivers : [],
          subtrends: Array.isArray(t.subtrends) ? t.subtrends : [],
          country: t.country,
          evidence_count: t.evidence_count || 0,
          observed_signals: [],
          why_summary: t.why_summary || `Score ${t.composite_score}/100`,
          created_at: t.created_at,
          updated_at: t.updated_at
        }));
      }

      // Si no hay tendencias persistidas precalculadas, comprobar si hay señales atómicas para armarlas
      const { data: signalTopics } = await supabase
        .from('sourcing_signals')
        .select('topic, country, source_type')
        .in('country', countryList)
        .not('topic', 'is', null)
        .limit(20);

      if (signalTopics && signalTopics.length > 0) {
        const uniqueTopics = Array.from(new Set(signalTopics.map(s => s.topic).filter(Boolean)));
        
        const dynamicTopics = await Promise.all(
          uniqueTopics.map(async (topic) => {
            const intData = await collectiblesSignalAggregator.getInternalSignalsForTopic(topic, country);
            const mktData = await marketSignalAggregator.getMarketSignalsForTopic(topic, country);
            const allSignals = [...intData.signals, ...mktData.signals];

            return {
              topic,
              category: 'Coleccionables',
              signals: allSignals,
              internalSearchesCount: intData.internalSearchesCount,
              internalWishlistCount: intData.internalWishlistCount,
              isPreorder: mktData.isPreorder,
              isNewRelease: mktData.isNewRelease
            };
          })
        );

        return TrendEngine.buildTrendCards(country, dynamicTopics);
      }

    } catch (err) {
      console.warn('[SourcingDiscoveryEngine] Error construyendo tendencias dinámicas:', err);
    }

    return [];
  }

  /**
   * Carga descubrimientos y productos candidatos persistidos para un país.
   * Si no hay registros, retorna [].
   */
  public async loadLiveDiscoveries(country: string = 'UY'): Promise<SourcingProductCandidate[]> {
    try {
      const isGlobal = !country || country === 'GLOBAL' || country === 'ALL' || country === 'TODOS';
      const countryList = isGlobal ? ['GLOBAL', 'UY', 'US', 'ALL', 'AR', 'CL'] : [country, 'GLOBAL'];
      const { data: dbDiscoveries, error } = await supabase
        .from('sourcing_discoveries')
        .select('*')
        .in('country', countryList)
        .order('opportunity_score', { ascending: false });

      if (error) {
        console.warn('[SourcingDiscoveryEngine] Error leyendo sourcing_discoveries:', error);
      }

      if (dbDiscoveries && dbDiscoveries.length > 0) {
        return storedCandidates(dbDiscoveries);
      }
    } catch (err) {
      console.warn('[SourcingDiscoveryEngine] Error leyendo descubrimientos:', err);
    }

    return [];
  }

  /**
   * Ejecuta el pipeline canónico unificado sobre candidatos descubiertos por Automatic Discovery:
   * 1. Deduplicación canónica
   * 2. Zinc Product Resolution (ASIN / imagen / precio origen / identidad comercial)
   * 3. Enriquecimiento comercial (Landed cost, TiendaMía, Mercado Libre UY, Margen, Opportunity Score)
   * 4. Persistencia en sourcing_discoveries post-enriquecimiento
   */
  public async processDiscoveredCandidates(
    rawCandidates: SourcingProductCandidate[],
    country: string = 'UY'
  ): Promise<SourcingProductCandidate[]> {
    if (!rawCandidates || rawCandidates.length === 0) return [];

    console.log('[DISCOVERY_PIPELINE_TRACE] Starting canonical pipeline for discovered candidates:', rawCandidates.length);

    // 1. Deduplicación canónica
    let candidates = deduplicateCanonicalCandidates(rawCandidates);

    // 2. Zinc Product Resolution (ASIN, imagen, origin price)
    try {
      const { resolvedCandidates, telemetry } = await resolveZincProductsForCandidates(candidates);
      candidates = resolvedCandidates;
      console.log('[DISCOVERY_PIPELINE_TRACE] Zinc resolution completed for discovery:', {
        candidatesCount: candidates.length,
        telemetry
      });
    } catch (zincErr: any) {
      console.warn('[DISCOVERY_PIPELINE_WARN] Zinc resolution failed for discovery:', zincErr.message);
    }

    // 3. Commercial Enrichment (Landed Cost, TiendaMía, MLU, Margen, Opportunity Score)
    try {
      candidates = await enrichCandidatesCommercialData(candidates, country);
      console.log('[DISCOVERY_PIPELINE_TRACE] Commercial enrichment completed for discovery:', candidates.length);
    } catch (commErr: any) {
      console.warn('[DISCOVERY_PIPELINE_WARN] Commercial enrichment failed for discovery:', commErr.message);
    }

    // 4. Persistir resultados enriquecidos en el backend usando service-role autorizado
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const response = await fetch('/api/sourcing-discovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'persist_enriched_candidates',
          country,
          candidates
        })
      });

      const result = await response.json().catch(() => null);
      if (response.ok && result?.success && result?.failed === 0) {
        console.log(`[DISCOVERY_PIPELINE_TRACE] Post-enrichment persistence completed for discovery candidates: ${result.succeeded}/${result.attempted} succeeded.`);
      } else if (response.ok && result?.succeeded > 0) {
        console.warn(`[DISCOVERY_PIPELINE_WARN] Post-enrichment persistence partial: ${result.succeeded} succeeded, ${result.failed} failed.`);
      } else {
        console.error(`[DISCOVERY_PIPELINE_ERROR] Post-enrichment persistence failed:`, result?.error || `HTTP ${response.status}`);
      }
    } catch (persistErr: any) {
      console.error('[DISCOVERY_PIPELINE_ERROR] Post-enrichment persistence network/client error:', persistErr.message);
    }

    return candidates;
  }
}

export const sourcingDiscoveryEngine = SourcingDiscoveryEngine.getInstance();
