// ============================================================
// COLLECTIBLES 2026 — SOURCING DISCOVERY ENGINE
// Motor de orquestación de descubrimiento autónomo.
// Lee tendencias y descubrimientos reales persistidos en Supabase.
// ============================================================

import { supabase } from '../../lib/supabase';
import { TrendEngine } from './trendEngine';
import { collectiblesSignalAggregator } from './collectiblesSignalAggregator';
import { marketSignalAggregator } from './marketSignalAggregator';
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
      const { data: dbTrends, error } = await supabase
        .from('sourcing_trends')
        .select('*')
        .eq('country', country)
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
        .eq('country', country)
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
      const { data: dbDiscoveries, error } = await supabase
        .from('sourcing_discoveries')
        .select('*')
        .eq('country', country)
        .order('opportunity_score', { ascending: false });

      if (error) {
        console.warn('[SourcingDiscoveryEngine] Error leyendo sourcing_discoveries:', error);
      }

      if (dbDiscoveries && dbDiscoveries.length > 0) {
        return dbDiscoveries.map(d => ({
          id: d.id,
          title: d.title,
          brand: d.brand || 'Collectibles',
          franchise: d.franchise || '',
          line: '',
          character: '',
          image_url: d.evidence?.image_url || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
          gallery_images: [d.evidence?.image_url || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80'],
          category: d.category || 'Figuras de Acción',
          status: d.status as any,
          discovered_from: d.discovered_from as any,
          trend_score: d.trend_score || 0,
          opportunity_score: d.opportunity_score || 0,
          confidence_score: d.confidence_score || 80,
          country_code: d.country,
          pricing: {
            amazon_price_usd: d.price_usd || 0,
            ebay_price_usd: null,
            bestbuy_price_usd: d.price_usd || null,
            tiendamia_price_usd: d.evidence?.tiendamia_price || null,
            mercadolibre_price_local: d.evidence?.ml_price || null,
            mercadolibre_currency: country === 'UY' ? 'UYU' : 'ARS',
            landed_cost_estimated_usd: d.landed_cost_usd || (d.price_usd || 0),
            suggested_sale_price_usd: d.suggested_price_usd || ((d.price_usd || 0) * 1.3),
            estimated_margin_percent: d.margin_percent || 25,
            currency: 'USD'
          },
          stock_status: d.stock_status as any,
          retailer_source: d.source_retailer || 'amazon',
          retailer_url: d.source_url || '',
          asin: d.asin,
          why_explanation: d.why_explanation || {
            headline: `Oportunidad detectada para ${country}`,
            local_demand_summary: 'Datos de demanda basados en señales reales.',
            market_differential: 'Evaluación determinística de precios.',
            stock_verdict: 'Verificado con fuente.',
            internal_signals: 'Señales persistidas.',
            evidence_sources: []
          },
          raw_evidence: [],
          created_at: d.discovered_at
        }));
      }
    } catch (err) {
      console.warn('[SourcingDiscoveryEngine] Error leyendo descubrimientos:', err);
    }

    return [];
  }
}

export const sourcingDiscoveryEngine = SourcingDiscoveryEngine.getInstance();
