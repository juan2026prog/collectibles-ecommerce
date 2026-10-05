import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enrichSingleCandidateCommercialData,
  enrichCandidatesCommercialData,
  extractRealProductWeightLbs
} from '../services/sourcing/candidateCommercialEnrichment';
import * as multiCountryLandedCostModule from '../services/sourcing/multiCountryLandedCost';
import * as tiendamiaMatchingModule from '../services/sourcing/tiendamiaMatchingService';
import * as uruguayMarketModule from '../services/sourcing/uruguayMarketIntelligence';
import * as opportunityScoringModule from '../services/sourcing/opportunityScoringEngine';
import type { SourcingProductCandidate } from '../types/sourcingIntelligence';

describe('Candidate Commercial Enrichment Unit Tests', () => {
  const baseCandidate: SourcingProductCandidate = {
    id: 'cand-batman-1',
    title: 'Squishmallows DC Batman 8-inch Plush',
    brand: 'Squishmallows',
    franchise: 'DC Comics',
    character: 'Batman',
    image_url: 'https://m.media-amazon.com/images/I/batman.jpg',
    category: 'Plush',
    status: 'DISCOVERED',
    discovered_from: 'OPENAI_WEB_SEARCH',
    trend_score: 75,
    opportunity_score: 50,
    confidence_score: 80,
    country_code: 'UY',
    pricing: {
      origin_price_usd: 19.99,
      amazon_price_usd: 19.99,
      landed_cost_estimated_usd: null,
      suggested_sale_price_usd: null,
      estimated_margin_percent: null,
      currency: 'USD'
    },
    stock_status: 'IN_STOCK',
    retailer_source: 'Amazon',
    retailer_url: 'https://www.amazon.com/dp/B08XW2M9NQ',
    asin: 'B08XW2M9NQ',
    why_explanation: {
      headline: 'Batman Plush Opportunity',
      local_demand_summary: 'Alta demanda',
      market_differential: 'Sin stock local',
      stock_verdict: 'In Stock',
      internal_signals: 'Trending',
      evidence_sources: []
    },
    raw_evidence: [],
    created_at: new Date().toISOString()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // CASO 1: STRONG Zinc + origin price + weight -> calculateMultiCountryLandedCost called
  it('1. STRONG Zinc + origin price + weight -> calculateMultiCountryLandedCost called and landed cost assigned', async () => {
    const landedCostSpy = vi.spyOn(multiCountryLandedCostModule, 'calculateMultiCountryLandedCost').mockReturnValue({
      destination_country: 'UY',
      origin_price_usd: 19.99,
      usa_shipping_usd: 0,
      sales_tax_usd: 1.40,
      international_shipping_usd: 10.0,
      customs_tax_usd: 0,
      vat_tax_usd: 0,
      courier_fee_usd: 12.0,
      total_landed_cost_usd: 43.39,
      currency: 'UYU',
      converted_landed_cost_local: 1800,
      calculation_confidence: 95,
      is_franchise_eligible: true,
      exceeds_weight_limit: false,
      exceeds_value_limit: false,
      calculation_notes: []
    } as any);

    const candWithWeight: SourcingProductCandidate = {
      ...baseCandidate,
      provenance: {
        weight: { value: 1.2, status: 'OBSERVED', source: 'Spec', source_url: null, observed_at: new Date().toISOString() }
      }
    };

    const res = await enrichSingleCandidateCommercialData(candWithWeight, 'UY');
    expect(landedCostSpy).toHaveBeenCalledTimes(1);
    expect(res.landedCostStatus).toBe('READY');
    expect(res.candidate.pricing.landed_cost_estimated_usd).toBe(43.39);
  });

  // CASO 2: STRONG Zinc + origin price + no weight -> landed_cost = null, MISSING_WEIGHT
  it('2. STRONG Zinc + origin price + no weight -> landed_cost = null and MISSING_WEIGHT', async () => {
    const landedCostSpy = vi.spyOn(multiCountryLandedCostModule, 'calculateMultiCountryLandedCost');
    const candNoWeight = { ...baseCandidate, provenance: {} };

    const res = await enrichSingleCandidateCommercialData(candNoWeight, 'UY');
    expect(landedCostSpy).not.toHaveBeenCalled();
    expect(res.landedCostStatus).toBe('MISSING_WEIGHT');
    expect(res.candidate.pricing.landed_cost_estimated_usd).toBeNull();
  });

  // CASO 3: Missing origin price -> MISSING_ORIGIN_PRICE
  it('3. Missing origin price -> landed_cost = null and MISSING_ORIGIN_PRICE', async () => {
    const candNoPrice: SourcingProductCandidate = {
      ...baseCandidate,
      pricing: { ...baseCandidate.pricing, origin_price_usd: null }
    };

    const res = await enrichSingleCandidateCommercialData(candNoPrice, 'UY');
    expect(res.landedCostStatus).toBe('MISSING_ORIGIN_PRICE');
    expect(res.candidate.pricing.landed_cost_estimated_usd).toBeNull();
  });

  // CASO 4: Verified ASIN -> checkTiendamiaByAsin called with exact ASIN
  it('4. Verified ASIN -> checkTiendamiaByAsin called with exact ASIN', async () => {
    const tiendamiaSpy = vi.spyOn(tiendamiaMatchingModule, 'checkTiendamiaByAsin').mockResolvedValue({
      asin: 'B08XW2M9NQ',
      found: true,
      exactMatch: true,
      priceUsd: 38.50,
      productUrl: 'https://tiendamia.com/producto?amz=B08XW2M9NQ',
      status: 'FOUND',
      presence: 'PRESENT',
      checkedAt: new Date().toISOString(),
      method: 'EXACT_ASIN_MATCH'
    });

    const res = await enrichSingleCandidateCommercialData(baseCandidate, 'UY');
    expect(tiendamiaSpy).toHaveBeenCalledWith('B08XW2M9NQ', expect.objectContaining({
      identifierVerification: 'SOURCE_VERIFIED'
    }));
    expect(res.tiendamiaStatus).toBe('FOUND');
    expect(res.candidate.pricing.tiendamia_price_usd).toBe(38.50);
  });

  // CASO 5: TiendaMía PROVIDER_ERROR -> remains PROVIDER_ERROR
  it('5. TiendaMía PROVIDER_ERROR -> remains PROVIDER_ERROR and never converts to NOT_FOUND', async () => {
    vi.spyOn(tiendamiaMatchingModule, 'checkTiendamiaByAsin').mockRejectedValue(new Error('Network Gateway 504'));

    const res = await enrichSingleCandidateCommercialData(baseCandidate, 'UY');
    expect(res.tiendamiaStatus).toBe('PROVIDER_ERROR');
    expect(res.candidate.pricing.tiendamia_price_usd).toBeUndefined();
  });

  // CASO 6: MLU EXACT_MATCH -> market reference accepted
  it('6. MLU EXACT_MATCH -> market reference accepted and assigned', async () => {
    vi.spyOn(uruguayMarketModule, 'queryMercadoLibreUruguayReal').mockResolvedValue({
      source: 'mercado_libre_uy',
      status: 'EXACT_MATCH',
      match_type: 'EXACT_MATCH',
      match_confidence: 90,
      data_origin: 'LIVE',
      exact_match_found: true,
      min_price_usd: 48,
      avg_price_usd: 52,
      median_price_usd: 52,
      max_price_usd: 55,
      total_listings: 3,
      sellers_count: 2,
      currency: 'USD',
      sample_title: 'Squishmallows Batman 8 in',
      sample_url: 'https://articulo.mercadolibre.com.uy/MLU-12345',
      difference_amount: null,
      difference_percent: null,
      market_position: 'UNKNOWN',
      comparison_diff_usd: null,
      comparison_diff_percent: null,
      market_verdict: 'COMPETITIVO',
      last_checked_at: new Date().toISOString()
    });

    const res = await enrichSingleCandidateCommercialData(baseCandidate, 'UY');
    expect(res.mercadolibreStatus).toBe('EXACT_MATCH');
    expect(res.candidate.pricing.mercadolibre_price_local).toBe(52);
    expect(res.candidate.pricing.mercadolibre_currency).toBe('USD');
  });

  // CASO 7: MLU AMBIGUOUS / NO_DATA -> market reference null
  it('7. MLU AMBIGUOUS / UNKNOWN -> market reference remains null', async () => {
    vi.spyOn(uruguayMarketModule, 'queryMercadoLibreUruguayReal').mockResolvedValue({
      source: 'mercado_libre_uy',
      status: 'UNKNOWN',
      match_type: 'UNKNOWN',
      match_confidence: 0,
      data_origin: 'NO_DATA',
      exact_match_found: false,
      min_price_usd: null,
      avg_price_usd: null,
      median_price_usd: null,
      max_price_usd: null,
      total_listings: 0,
      sellers_count: null,
      currency: 'USD',
      sample_title: '',
      sample_url: '',
      difference_amount: null,
      difference_percent: null,
      market_position: 'UNKNOWN',
      comparison_diff_usd: null,
      comparison_diff_percent: null,
      market_verdict: 'NO_DISPONIBLE',
      last_checked_at: new Date().toISOString()
    });

    const res = await enrichSingleCandidateCommercialData(baseCandidate, 'UY');
    expect(res.mercadolibreStatus).toBe('UNKNOWN');
    expect(res.candidate.pricing.mercadolibre_price_local).toBeNull();
  });

  // CASO 8: Missing landed cost -> margin LANDED_COST_UNKNOWN
  it('8. Missing landed cost -> margin is null with LANDED_COST_UNKNOWN status', async () => {
    const candWithRefPrice: SourcingProductCandidate = {
      ...baseCandidate,
      pricing: { ...baseCandidate.pricing, suggested_sale_price_usd: 49.99 }
    };

    const res = await enrichSingleCandidateCommercialData(candWithRefPrice, 'UY');
    expect(res.candidate.pricing.landed_cost_estimated_usd).toBeNull();
    expect(res.candidate.pricing.estimated_margin_percent).toBeNull();
    expect(res.marginStatus).toBe('LANDED_COST_UNKNOWN');
  });

  // CASO 9: UNKNOWN never becomes 0
  it('9. UNKNOWN values never become 0 in pricing fields', async () => {
    const candUnknown: SourcingProductCandidate = {
      ...baseCandidate,
      pricing: {
        origin_price_usd: null,
        landed_cost_estimated_usd: null,
        suggested_sale_price_usd: null,
        estimated_margin_percent: null,
        currency: 'USD'
      }
    };

    const res = await enrichSingleCandidateCommercialData(candUnknown, 'UY');
    expect(res.candidate.pricing.origin_price_usd).toBeNull();
    expect(res.candidate.pricing.landed_cost_estimated_usd).toBeNull();
    expect(res.candidate.pricing.estimated_margin_percent).toBeNull();
    expect(res.candidate.pricing.landed_cost_estimated_usd).not.toBe(0);
    expect(res.candidate.pricing.estimated_margin_percent).not.toBe(0);
  });

  // CASO 10: Opportunity Score receives no synthetic evidence
  it('10. Opportunity score is deterministic and does not receive synthetic defaults', async () => {
    const oppSpy = vi.spyOn(opportunityScoringModule, 'evaluateOpportunityScore');
    await enrichSingleCandidateCommercialData(baseCandidate, 'UY');
    expect(oppSpy).toHaveBeenCalledTimes(1);
    const callArgs = oppSpy.mock.calls[0][0];
    expect(callArgs.demandScore).toBe(75);
    expect(callArgs.marginPercent).toBe(0); // Fail-closed when margin is null
    expect(callArgs.profitUsd).toBe(0);
  });

  // CASO 11: Candidate isolation
  it('11. Candidate isolation: error in candidate 1 does not abort candidate 2', async () => {
    const cand1 = { ...baseCandidate, id: 'cand-err' };
    const cand2 = { ...baseCandidate, id: 'cand-ok' };

    vi.spyOn(uruguayMarketModule, 'queryMercadoLibreUruguayReal').mockImplementation(async (input) => {
      if (input.title.includes('cand-err')) throw new Error('Simulated network abort');
      return {
        source: 'mercado_libre_uy',
        status: 'UNKNOWN',
        match_type: 'UNKNOWN',
        match_confidence: 0,
        data_origin: 'NO_DATA',
        exact_match_found: false,
        min_price_usd: null,
        avg_price_usd: null,
        median_price_usd: null,
        max_price_usd: null,
        total_listings: 0,
        sellers_count: null,
        difference_amount: null,
        difference_percent: null,
        market_position: 'UNKNOWN',
        comparison_diff_usd: null,
        comparison_diff_percent: null,
        market_verdict: 'NO_DISPONIBLE',
        last_checked_at: new Date().toISOString()
      };
    });

    const enriched = await enrichCandidatesCommercialData([cand1, cand2], 'UY');
    expect(enriched).toHaveLength(2);
    expect(enriched[0].id).toBe('cand-err');
    expect(enriched[1].id).toBe('cand-ok');
  });

  // CASO 12: Existing Zinc image/ASIN/price behavior remains unchanged
  it('12. Existing Zinc image, ASIN, and origin price remain completely intact', async () => {
    const res = await enrichSingleCandidateCommercialData(baseCandidate, 'UY');
    expect(res.candidate.image_url).toBe(baseCandidate.image_url);
    expect(res.candidate.asin).toBe(baseCandidate.asin);
    expect(res.candidate.pricing.origin_price_usd).toBe(baseCandidate.pricing.origin_price_usd);
  });

  // Extra unit tests on weight parsing
  it('13. extractRealProductWeightLbs parses lbs, oz, kg, g accurately', () => {
    expect(extractRealProductWeightLbs({ provenance: { weight: { value: '2.5 lbs' } } } as any)).toBe(2.5);
    expect(extractRealProductWeightLbs({ provenance: { weight: { value: '16 oz' } } } as any)).toBe(1);
    expect(extractRealProductWeightLbs({ provenance: { weight: { value: '1 kg' } } } as any)).toBe(2.2);
    expect(extractRealProductWeightLbs({ provenance: { weight: { value: '500 g' } } } as any)).toBe(1.1);
    expect(extractRealProductWeightLbs({} as any)).toBeNull();
  });
});
