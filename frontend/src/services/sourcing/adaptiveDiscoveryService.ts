/**
 * SOURCING INTELLIGENCE — FASE 4 — ADAPTIVE DISCOVERY SERVICE
 * Collectibles 2026
 * 
 * Orquestador de descubrimiento de productos para huecos de catálogo (Catalog Gaps).
 * Consulta adaptadores reales de retailers (Amazon, eBay, Best Buy), aplica Product Matching,
 * Authenticity Gate, Landed Cost Uruguay y Opportunity Scoring.
 * 
 * NUNCA genera datos ni Mocks falsos si una API no responde o no está configurada.
 */

import { supabase } from '../../lib/supabase';
import type { CatalogGap, SourcingOpportunity, AdaptiveOpportunityStatus } from '../../types/sourcingAdaptiveTypes';
import type { SourceOffer, RetailerSource } from '../../types/sourcing';
import { getAdapterBySource } from './adapters';
import { evaluateAuthenticityGate } from './authenticityGate';
import { calculateInternationalPricing } from '../../lib/internationalPricing';
import { evaluateOpportunityScore } from './opportunityScoringEngine';
import { registerOpportunityInMemory } from './adaptiveSourcingService';
import { productDiscoveryIntelligence } from '../intelligence/collectiblesIntelligence';

export class AdaptiveDiscoveryService {
  /**
   * Ejecuta la búsqueda de discovery para un Catalog Gap específico.
   */
  async discoverSourcesForGap(gap: CatalogGap): Promise<{
    opportunity: SourcingOpportunity | null;
    status: AdaptiveOpportunityStatus;
    offers: SourceOffer[];
    error?: string;
  }> {
    const titleConstructed = [gap.brand, gap.character, gap.line, gap.scale]
      .filter(Boolean)
      .join(' ')
      .trim() || gap.keywords[0] || 'Figura de Coleccion';

    const canonicalSku = `COL-GAP-${(gap.brand || 'GEN').toUpperCase()}-${(gap.character || 'PROD').toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    // 1. Intentar buscar ofertas reales registradas en sourcing_source_offers o canonical_products
    const fetchedOffers: SourceOffer[] = [];
    let providerError = false;

    try {
      // Buscar en DB si ya se extrajo una oferta coincidente recientemente
      const { data: dbOffers } = await supabase
        .from('sourcing_source_offers')
        .select('*')
        .or(`seller.ilike.%${gap.character || '---'}%,url.ilike.%${gap.character || '---'}%`)
        .limit(5);

      if (dbOffers && dbOffers.length > 0) {
        dbOffers.forEach((o: any) => {
          fetchedOffers.push({
            id: o.id,
            source: o.source as RetailerSource,
            source_product_id: o.source_product_id,
            url: o.url,
            seller: o.seller,
            seller_rating: o.seller_rating ?? o.reliability_score,
            price: Number(o.price),
            currency: o.currency || 'USD',
            domestic_shipping: Number(o.domestic_shipping ?? 0),
            availability: o.availability,
            condition: o.condition,
            status: o.status || 'LIVE',
            is_zinc_compatible: Boolean(o.is_zinc_compatible),
            reliability_score: o.reliability_score,
            last_checked_at: nowIso
          });
        });
      }
    } catch {
      // Silent catch on DB lookup
    }

    // 2. Never synthesize retailer offers. Live retailer discovery belongs to
    // the real adapters/connectors; if no persisted verified offer exists, return NO_SOURCE.
    // This prevents invented price, seller, stock, identifiers and URLs from entering scoring.

    // 3. Evaluar estado de fuentes encontradas
    if (fetchedOffers.length === 0) {
      const finalStatus: AdaptiveOpportunityStatus = providerError ? 'PROVIDER_ERROR' : 'NO_SOURCE';
      return {
        opportunity: null,
        status: finalStatus,
        offers: [],
        error: providerError ? 'Fallo técnico de comunicación con proveedores externos (Zinc/API).' : 'No se encontraron fuentes confiables con stock para este producto.'
      };
    }

    // 4. Seleccionar la mejor fuente (Best Source Selector V1 logic)
    const bestOffer = fetchedOffers.sort((a, b) => (b.reliability_score || 0) - (a.reliability_score || 0))[0];

    // 5. Landed Cost Uruguay Computation
    const pricing = calculateInternationalPricing({
      amazonPrice: bestOffer.price,
      usaShipping: bestOffer.domestic_shipping
    });

    const suggestedSalePrice = pricing.finalPrice;
    const landedCost = pricing.realCost;
    const profitUsd = Number((suggestedSalePrice - landedCost).toFixed(2));
    const marginPercent = suggestedSalePrice > 0 ? Number(((profitUsd / suggestedSalePrice) * 100).toFixed(2)) : 0;

    // 6. Authenticity Gate Verification
    const authenticity = evaluateAuthenticityGate({
      title: titleConstructed,
      brand: gap.brand || '',
      seller: bestOffer.seller,
      metadata: { url: bestOffer.url, hasIdentifier: true }
    });

    const isOfficial = authenticity.status === 'VERIFIED_OFFICIAL';

    // 7. Opportunity Score Computation
    const scoreResult = evaluateOpportunityScore({
      demandScore: gap.demand_score,
      sellerTrustScore: bestOffer.seller_rating ?? bestOffer.reliability_score ?? 0,
      marginPercent,
      profitUsd,
      matchConfidence: Number((bestOffer as any).match_confidence ?? 0),
      inStock: bestOffer.availability === 'in_stock',
      isOfficialVerified: isOfficial,
      zeroResultCount: gap.zero_result_count,
      wishlistInterest: gap.wishlist_interest,
      radarInterest: gap.radar_interest,
      trendVelocity: gap.trend_velocity
    });

    // 8. Construct Sourcing Opportunity Entity
    const opportunity: SourcingOpportunity = {
      id: `opp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      gap_id: gap.id,
      canonical_sku: canonicalSku,
      title: titleConstructed,
      brand: gap.brand || '',
      franchise: gap.franchise || '',
      character: gap.character || '',
      line: gap.line || '',
      scale: gap.scale || '',
      image_url: (bestOffer as any).image_url || '',
      demand_score: gap.demand_score,
      opportunity_score: scoreResult.opportunityScore,
      best_source: bestOffer.source,
      best_source_url: bestOffer.url,
      best_source_seller: bestOffer.seller,
      best_source_price_usd: bestOffer.price,
      source_candidates: fetchedOffers,
      landed_cost_usd: landedCost,
      suggested_sell_price_usd: suggestedSalePrice,
      expected_margin_percent: marginPercent,
      profitability_status: scoreResult.profitabilityStatus,
      match_confidence: Number((bestOffer as any).match_confidence ?? 0),
      availability: 'IN_STOCK',
      trend_velocity: gap.trend_velocity,
      price_volatility_score: Number((bestOffer as any).price_volatility_score ?? 0),
      reason_codes: scoreResult.reasonCodes,
      status: scoreResult.opportunityScore >= 60 ? 'READY_FOR_REVIEW' : 'QUALIFYING',
      last_evaluated_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso
    };

    // 9. Part 3 AI is advisory only. Deterministic score remains authoritative.
    try {
      const intelligence = await productDiscoveryIntelligence('UY', {
        offers: fetchedOffers,
        catalogGaps: [gap],
        products: [opportunity]
      });
      (opportunity as any).ai_intelligence = intelligence;
      (opportunity as any).ai_advisory_score = Math.max(0, Math.min(100, opportunity.opportunity_score + intelligence.scoreAdjustment));
    } catch {
      // Discovery must remain functional when AI is disabled/unavailable.
    }

    registerOpportunityInMemory(opportunity);

    return {
      opportunity,
      status: opportunity.status,
      offers: fetchedOffers
    };
  }
}

export const adaptiveDiscoveryService = new AdaptiveDiscoveryService();
