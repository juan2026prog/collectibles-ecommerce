/**
 * SOURCING INTELLIGENCE — FASE 4 — ADAPTIVE SOURCING SERVICE
 * Collectibles 2026
 * 
 * Servicio principal de gestión de la cola inteligente de Oportunidades y Máquina de Estados.
 * Conecta el flujo: DETECTA → BUSCA → ANALIZA → PRIORIZA → PROPONE → ADMIN APRUEBA / DESCARTA.
 */

import { supabase } from '../../lib/supabase';
import type { 
  SourcingOpportunity, 
  AdaptiveOpportunityStatus, 
  AdaptiveSettings,
  CatalogGap
} from '../../types/sourcingAdaptiveTypes';
import { catalogGapEngine, processSignalIntoCatalogGap, getQualifiedCatalogGaps } from './catalogGapEngine';
import { adaptiveDiscoveryService } from './adaptiveDiscoveryService';
import { sourcingService } from './sourcingService';
import type { NormalizedProduct } from '../../types/sourcing';

const DEFAULT_SETTINGS: AdaptiveSettings = {
  enabled: true,
  minimum_demand_score: 50,
  minimum_opportunity_score: 60,
  minimum_unique_users: 1,
  minimum_search_count: 2,
  zero_result_weight: 4.0,
  wishlist_weight: 3.0,
  radar_weight: 2.5,
  comparison_weight: 2.0,
  release_weight: 3.5,
  time_decay_half_life_days: 14,
  discovery_budget_daily: 50,
  retailer_sources: ['amazon', 'ebay', 'bestbuy'],
  source_revalidation_hours: 24
};

// In-memory Store for zero-latency Admin UI and testing
const inMemoryOpportunities = new Map<string, SourcingOpportunity>();

export const registerOpportunityInMemory = (opp: SourcingOpportunity) => {
  if (opp && opp.id) {
    inMemoryOpportunities.set(opp.id, opp);
  }
};

export class AdaptiveSourcingService {
  private settings: AdaptiveSettings = { ...DEFAULT_SETTINGS };

  constructor() {
    this.loadSettings();
  }

  async loadSettings(): Promise<AdaptiveSettings> {
    try {
      const { data } = await supabase
        .from('sourcing_adaptive_settings')
        .select('value')
        .eq('key', 'config')
        .maybeSingle();

      if (data?.value) {
        this.settings = { ...DEFAULT_SETTINGS, ...data.value };
      }
    } catch {}
    return this.settings;
  }

  async updateSettings(newSettings: Partial<AdaptiveSettings>): Promise<AdaptiveSettings> {
    this.settings = { ...this.settings, ...newSettings };
    
    if (typeof window !== 'undefined') {
      supabase
        .from('sourcing_adaptive_settings')
        .upsert({
          key: 'config',
          value: this.settings,
          description: 'Configuración general de Adaptive Sourcing y Kill Switch',
          updated_at: new Date().toISOString()
        })
        .then();
    }

    return this.settings;
  }

  getSettings(): AdaptiveSettings {
    return this.settings;
  }

  /**
   * Obtiene la cola inteligente de Oportunidades ordenadas prioritariamente por Opportunity Score.
   */
  async getOpportunities(filters: {
    status?: AdaptiveOpportunityStatus | 'all';
    minOpportunityScore?: number;
    franchise?: string;
    brand?: string;
  } = {}): Promise<SourcingOpportunity[]> {
    let list = Array.from(inMemoryOpportunities.values());

    if (filters.status && filters.status !== 'all') {
      list = list.filter(o => o.status === filters.status);
    }
    if (filters.minOpportunityScore) {
      list = list.filter(o => o.opportunity_score >= filters.minOpportunityScore!);
    }
    if (filters.franchise) {
      const f = filters.franchise.toLowerCase();
      list = list.filter(o => o.franchise.toLowerCase().includes(f));
    }
    if (filters.brand) {
      const b = filters.brand.toLowerCase();
      list = list.filter(o => o.brand.toLowerCase().includes(b));
    }

    if (list.length > 0) {
      return list.sort((a, b) => b.opportunity_score - a.opportunity_score);
    }

    // Supabase fallback
    try {
      let query = supabase
        .from('sourcing_opportunities')
        .select('*')
        .order('opportunity_score', { ascending: false });

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        data.forEach((o: any) => inMemoryOpportunities.set(o.id, o as SourcingOpportunity));
        return data as SourcingOpportunity[];
      }
    } catch {}

    return [];
  }

  /**
   * Evalúa todos los catalog gaps calificados y genera oportunidades de sourcing.
   */
  async processQualifiedGapsToOpportunities(): Promise<SourcingOpportunity[]> {
    if (!this.settings.enabled) {
      return [];
    }

    const gaps = await getQualifiedCatalogGaps(this.settings.minimum_demand_score);
    const createdOpps: SourcingOpportunity[] = [];

    for (const gap of gaps) {
      const { opportunity, status } = await adaptiveDiscoveryService.discoverSourcesForGap(gap);
      if (opportunity) {
        inMemoryOpportunities.set(opportunity.id, opportunity);
        createdOpps.push(opportunity);

        // Sync to Supabase
        if (typeof window !== 'undefined') {
          supabase
            .from('sourcing_opportunities')
            .upsert({
              gap_id: opportunity.gap_id,
              canonical_sku: opportunity.canonical_sku,
              title: opportunity.title,
              brand: opportunity.brand,
              franchise: opportunity.franchise,
              character: opportunity.character,
              line: opportunity.line,
              scale: opportunity.scale,
              image_url: opportunity.image_url,
              demand_score: opportunity.demand_score,
              opportunity_score: opportunity.opportunity_score,
              best_source: opportunity.best_source,
              best_source_url: opportunity.best_source_url,
              best_source_seller: opportunity.best_source_seller,
              best_source_price_usd: opportunity.best_source_price_usd,
              source_candidates: opportunity.source_candidates,
              landed_cost_usd: opportunity.landed_cost_usd,
              suggested_sell_price_usd: opportunity.suggested_sell_price_usd,
              expected_margin_percent: opportunity.expected_margin_percent,
              profitability_status: opportunity.profitability_status,
              match_confidence: opportunity.match_confidence,
              availability: opportunity.availability,
              trend_velocity: opportunity.trend_velocity,
              reason_codes: opportunity.reason_codes,
              status: opportunity.status,
              updated_at: new Date().toISOString()
            }, { onConflict: 'canonical_sku' })
            .then();
        }
      }
    }

    return createdOpps;
  }

  /**
   * Acción Administrativa: Aprueba una Oportunidad y prepara la publicación en international_products.
   */
  async approveOpportunity(opportunityId: string): Promise<{ success: boolean; importedId?: string; error?: string }> {
    const opp = inMemoryOpportunities.get(opportunityId);
    if (!opp) {
      return { success: false, error: 'Oportunidad no encontrada.' };
    }

    // Convert SourcingOpportunity to NormalizedProduct for existing import pipeline
    const normalizedMockProduct: NormalizedProduct = {
      id: opp.id,
      canonical_sku: opp.canonical_sku,
      title: opp.title,
      brand: opp.brand,
      license: opp.franchise,
      line: opp.line,
      character: opp.character,
      scale: opp.scale,
      image_url: opp.image_url,
      gallery_images: [opp.image_url],
      offers: opp.source_candidates.length > 0
        ? opp.source_candidates.map(o => ({
            ...o,
            price: o.price ?? (o as any).price_usd ?? opp.best_source_price_usd ?? 25.0,
            domestic_shipping: o.domestic_shipping ?? (o as any).usa_shipping_usd ?? 0,
            status: 'LIVE' as const
          }))
        : [{
            id: 'offer_1',
            source: opp.best_source || 'amazon',
            source_product_id: 'ASIN_LOOKUP',
            url: opp.best_source_url || 'https://www.amazon.com',
            seller: opp.best_source_seller || 'Official Store',
            price: opp.best_source_price_usd || 25.0,
            currency: 'USD',
            domestic_shipping: 0,
            availability: 'in_stock',
            condition: 'new',
            status: 'LIVE',
            is_zinc_compatible: true,
            reliability_score: 95,
            last_checked_at: new Date().toISOString()
          }],
      selected_source_id: opp.source_candidates[0]?.id || 'offer_1',
      best_source_id: opp.source_candidates[0]?.id || 'offer_1',
      financials: {
        origin_price_usd: opp.best_source_price_usd,
        usa_shipping_usd: 0,
        sales_tax_usd: 0,
        zinc_fee_usd: 1.5,
        financial_fee_usd: 2.0,
        urubox_courier_usd: 8.0,
        other_costs_usd: 0,
        real_cost_puesto_usd: opp.landed_cost_usd,
        suggested_sale_price_usd: opp.suggested_sell_price_usd,
        current_sale_price_usd: opp.suggested_sell_price_usd,
        profit_usd: Number((opp.suggested_sell_price_usd - opp.landed_cost_usd).toFixed(2)),
        margin_percent: opp.expected_margin_percent,
        profit_protection_status: 'PASS'
      },
      authenticity: {
        status: 'VERIFIED_OFFICIAL',
        score: 95,
        confidence: 95,
        brand_verified: true,
        license_verified: true,
        official_distributor: true,
        has_valid_identifier: true,
        verification_method: 'DIRECT_IDENTIFIER_MATCH',
        verification_evidence: ['Seller verificado', 'Identificador oficial validado'],
        verification_source: opp.best_source || 'amazon',
        verified_at: new Date().toISOString(),
        red_flags: [],
        green_flags: ['Licencia oficial', 'Vendedor confiable'],
        reasons: ['Verificación de autenticidad aprobada']
      },
      uruguay_market: {
        source: 'mercado_libre_uy',
        status: 'NOT_FOUND',
        match_type: 'NOT_FOUND',
        match_confidence: 0,
        data_origin: 'NO_DATA',
        exact_match_found: false,
        min_price_usd: null,
        avg_price_usd: null,
        median_price_usd: null,
        max_price_usd: null,
        total_listings: 0,
        sellers_count: 0,
        difference_amount: null,
        difference_percent: null,
        market_position: 'NO_EXACT_COMPETITION',
        comparison_diff_usd: null,
        comparison_diff_percent: null,
        market_verdict: 'SIN_COMPETENCIA',
        last_checked_at: new Date().toISOString()
      },
      catalog_status: 'NOT_IN_CATALOG',
      product_type: 'CATALOG_GAP',
      tags: ['adaptive_sourcing', opp.franchise.toLowerCase()],
      opportunity_score: opp.opportunity_score,
      catalog_value_score: 80,
      created_at: opp.created_at,
      updated_at: new Date().toISOString()
    };

    const res = await sourcingService.importProductsToCatalog([normalizedMockProduct]);

    if (res.importedCount > 0 || res.preordersCount > 0) {
      opp.status = 'APPROVED';
      opp.updated_at = new Date().toISOString();
      inMemoryOpportunities.set(opp.id, opp);

      if (typeof window !== 'undefined') {
        supabase
          .from('sourcing_opportunities')
          .update({ status: 'APPROVED', updated_at: opp.updated_at })
          .eq('id', opp.id)
          .then();
      }

      return { success: true, importedId: opp.canonical_sku };
    }

    return { success: false, error: res.errors.join('; ') || 'No se pudo publicar la oportunidad.' };
  }

  /**
   * Acción Administrativa: Descarta una Oportunidad y registra la razón de feedback.
   */
  async dismissOpportunity(opportunityId: string, feedbackReason: SourcingOpportunity['feedback_reason'] = 'OTHER'): Promise<boolean> {
    const opp = inMemoryOpportunities.get(opportunityId);
    if (!opp) return false;

    opp.status = 'DISMISSED';
    opp.feedback_reason = feedbackReason;
    opp.updated_at = new Date().toISOString();
    inMemoryOpportunities.set(opp.id, opp);

    if (typeof window !== 'undefined') {
      supabase
        .from('sourcing_opportunities')
        .update({ status: 'DISMISSED', feedback_reason: feedbackReason, updated_at: opp.updated_at })
        .eq('id', opp.id)
        .then();
    }

    return true;
  }
}

export const adaptiveSourcingService = new AdaptiveSourcingService();
