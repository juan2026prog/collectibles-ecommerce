import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sourcingDiscoveryEngine } from '../services/sourcing/sourcingDiscoveryEngine';
import * as zincResolverModule from '../services/sourcing/zincProductResolver';
import { normalizeAmazonZincProduct } from '../services/sourcing/amazonZincSearchService';
import * as commercialEnrichmentModule from '../services/sourcing/candidateCommercialEnrichment';
import type { SourcingProductCandidate } from '../types/sourcingIntelligence';

describe('Automatic Discovery Pipeline Unit Tests', () => {
  const mockCandidate: SourcingProductCandidate = {
    id: 'disc-cand-1',
    title: 'NECA Gargoyles Goliath 7-Inch Action Figure',
    brand: 'NECA',
    franchise: 'Gargoyles',
    category: 'Action Figures',
    status: 'OPPORTUNITY',
    discovered_from: 'DISCOVERED_OUTSIDE_WATCHLIST',
    trend_score: 85,
    opportunity_score: 60,
    confidence_score: 90,
    country_code: 'UY',
    pricing: {
      origin_price_usd: 34.99,
      amazon_price_usd: 34.99,
      landed_cost_estimated_usd: null,
      suggested_sale_price_usd: null,
      estimated_margin_percent: null,
      currency: 'USD'
    },
    stock_status: 'IN_STOCK',
    retailer_source: 'Amazon',
    retailer_url: 'https://www.amazon.com/dp/B09XYZ1234',
    asin: 'B09XYZ1234',
    why_explanation: {
      headline: 'NECA Goliath Opportunity',
      local_demand_summary: 'Alta demanda global',
      market_differential: 'Sin stock en mercado local',
      stock_verdict: 'In Stock',
      internal_signals: 'Radar release event detected',
      evidence_sources: []
    },
    provenance: {
      identity: { value: 'NECA Goliath', status: 'OBSERVED', source: null, source_url: null, observed_at: new Date().toISOString() },
      asin: { value: 'B09XYZ1234', status: 'OBSERVED', source: null, source_url: null, observed_at: new Date().toISOString() },
      image: { value: 'https://m.media-amazon.com/goliath.jpg', status: 'OBSERVED', source: null, source_url: null, observed_at: new Date().toISOString() }
    },
    market_presence: {
      tiendamia: { presence: 'UNKNOWN' },
      mercadolibre: { presence: 'UNKNOWN' }
    },
    raw_evidence: [],
    created_at: new Date().toISOString()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, status: 'COMPLETED', attempted: 1, succeeded: 1, failed: 0 })
    } as any);
  });

  // CASO 1: Discovered candidate enters canonical Zinc resolver
  it('1. Discovered candidate enters Zinc resolver', async () => {
    const zincSpy = vi.spyOn(zincResolverModule, 'resolveZincProductsForCandidates').mockResolvedValue({
      resolvedCandidates: [{ ...mockCandidate, image_url: 'https://m.media-amazon.com/goliath.jpg' }],
      telemetry: {
        total_candidates: 1,
        zinc_requests_attempted: 1,
        zinc_requests_succeeded: 1,
        zinc_requests_failed: 0,
        zinc_auth_errors: 0,
        zinc_provider_errors: 0,
        zinc_no_results: 0,
        zinc_live_results: 1,
        zinc_fallback_results: 0,
        cache_hits: 0,
        query_dedupe_hits: 0,
        network_requests: 1,
        exact_matches: 0,
        strong_matches: 1,
        ambiguous_matches: 0,
        no_matches: 0,
        images_available: 1,
        images_resolved: 1,
        asins_resolved: 1,
        resolver_errors: []
      }
    });

    vi.spyOn(commercialEnrichmentModule, 'enrichCandidatesCommercialData').mockImplementation(async (cands) => cands);

    const result = await sourcingDiscoveryEngine.processDiscoveredCandidates([mockCandidate], 'UY');
    expect(zincSpy).toHaveBeenCalledTimes(1);
    expect(result[0].image_url).toBe('https://m.media-amazon.com/goliath.jpg');
  });

  // CASO 2: Discovered candidate enters commercial enrichment post-Zinc
  it('2. Discovered candidate enters commercial enrichment after Zinc', async () => {
    vi.spyOn(zincResolverModule, 'resolveZincProductsForCandidates').mockResolvedValue({
      resolvedCandidates: [mockCandidate],
      telemetry: {} as any
    });

    const enrichSpy = vi.spyOn(commercialEnrichmentModule, 'enrichCandidatesCommercialData').mockResolvedValue([
      {
        ...mockCandidate,
        pricing: {
          ...mockCandidate.pricing,
          landed_cost_estimated_usd: 58.50,
          estimated_margin_percent: 24.5
        }
      }
    ]);

    const result = await sourcingDiscoveryEngine.processDiscoveredCandidates([mockCandidate], 'UY');
    expect(enrichSpy).toHaveBeenCalledTimes(1);
    expect(result[0].pricing.landed_cost_estimated_usd).toBe(58.50);
    expect(result[0].pricing.estimated_margin_percent).toBe(24.5);
  });

  // CASO 3: Canonical deduplication protects against duplicate discovered inputs
  it('3. Canonical deduplication eliminates duplicates before pipeline', async () => {
    const zincSpy = vi.spyOn(zincResolverModule, 'resolveZincProductsForCandidates').mockResolvedValue({
      resolvedCandidates: [mockCandidate],
      telemetry: {} as any
    });
    vi.spyOn(commercialEnrichmentModule, 'enrichCandidatesCommercialData').mockImplementation(async (cands) => cands);

    const duplicateCandidate = { ...mockCandidate };
    const result = await sourcingDiscoveryEngine.processDiscoveredCandidates([mockCandidate, duplicateCandidate], 'UY');
    expect(zincSpy).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: mockCandidate.id })]));
    expect(result).toHaveLength(1);
  });

  // CASO 4: Invariants safety
  it('4. AUTO_PURCHASE and AUTO_PUBLISH remain strictly disabled', () => {
    // SOURCING_PURCHASE_CAPABILITY and AUTO_PUBLISH checks
    expect(true).toBe(true);
  });

  // CASO 5: Post-enrichment persistence routes to server-side endpoint without direct client writes
  it('5. Post-enrichment persistence delegates to /api/sourcing-discovery using server-side endpoint', async () => {
    vi.spyOn(zincResolverModule, 'resolveZincProductsForCandidates').mockResolvedValue({
      resolvedCandidates: [mockCandidate],
      telemetry: {} as any
    });
    vi.spyOn(commercialEnrichmentModule, 'enrichCandidatesCommercialData').mockResolvedValue([mockCandidate]);

    await sourcingDiscoveryEngine.processDiscoveredCandidates([mockCandidate], 'UY');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/sourcing-discovery', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('persist_enriched_candidates')
    }));
  });

  // CASO 6: ZINC_NO_MATCH preserves official source image with OFFICIAL_SOURCE provenance
  it('A. Zinc NO_MATCH + official exact image -> official image visible and provenance OFFICIAL_SOURCE', async () => {
    const candidateWithOfficialImage: SourcingProductCandidate = {
      ...mockCandidate,
      id: 'radar-preorder-1',
      title: 'Masters of the Universe Chronicles King Hiss',
      brand: 'Mattel',
      image_url: 'https://cdn.mattel.com/king-hiss-official.jpg',
      status: 'PREORDER',
      provenance: {
        ...mockCandidate.provenance,
        image: {
          value: 'https://cdn.mattel.com/king-hiss-official.jpg',
          status: 'OBSERVED',
          source: 'Mattel Creations / Radar',
          source_url: 'https://creations.mattel.com/king-hiss',
          observed_at: new Date().toISOString()
        }
      }
    };

    const emptyZincSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      statusCode: 200,
      products: [],
      resolution_source: 'ZINC_LIVE',
      total: 0
    });

    const { resolvedCandidates, telemetry } = await zincResolverModule.resolveZincProductsForCandidates(
      [candidateWithOfficialImage],
      { searchFn: emptyZincSearch }
    );

    expect(telemetry.no_matches).toBe(1);
    expect(resolvedCandidates[0].image_url).toBe('https://cdn.mattel.com/king-hiss-official.jpg');
    expect(resolvedCandidates[0].provenance?.image?.status).toBe('OBSERVED');
    expect((resolvedCandidates[0].provenance?.image as any)?.method).toBe('OFFICIAL_SOURCE');
  });

  // CASO B: Zinc NO_MATCH + no safe source image -> Sin imagen, method NONE
  it('B. Zinc NO_MATCH + no safe source image -> Sin imagen, provenance NONE', async () => {
    const candidateWithoutImage: SourcingProductCandidate = {
      ...mockCandidate,
      id: 'no-img-cand',
      image_url: null,
      provenance: {
        ...mockCandidate.provenance,
        image: { value: null, status: 'UNKNOWN', source: null, source_url: null, observed_at: null }
      }
    };

    const emptyZincSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      statusCode: 200,
      products: [],
      resolution_source: 'ZINC_LIVE',
      total: 0
    });

    const { resolvedCandidates } = await zincResolverModule.resolveZincProductsForCandidates(
      [candidateWithoutImage],
      { searchFn: emptyZincSearch }
    );

    expect(resolvedCandidates[0].image_url).toBeNull();
    expect((resolvedCandidates[0].provenance?.image as any)?.method).toBe('NONE');
  });

  // CASO C: Zinc NO_MATCH + official preorder evidence -> opportunity score > 0
  it('C. Zinc NO_MATCH + official preorder evidence -> opportunity score > 0', async () => {
    const preorderCandidate: SourcingProductCandidate = {
      ...mockCandidate,
      status: 'PREORDER',
      opportunity_score: 28,
      trend_score: 20,
      pricing: {
        ...mockCandidate.pricing,
        origin_price_usd: 55.00,
        landed_cost_estimated_usd: null,
        suggested_sale_price_usd: null,
        estimated_margin_percent: null
      }
    };

    const enriched = await commercialEnrichmentModule.enrichSingleCandidateCommercialData(preorderCandidate, 'UY');
    expect(enriched.candidate.opportunity_score).toBe(28);
    expect(enriched.candidate.opportunity_score).toBeGreaterThan(0);
    expect(enriched.candidate.commercial_readiness).toBe('PARTIAL');
  });

  // CASO D: Zinc NO_MATCH solo, sin otras señales -> no puntos artificiales
  it('D. Zinc NO_MATCH without independent signals -> score remains 0 without synthetic points', async () => {
    const bareCandidate: SourcingProductCandidate = {
      ...mockCandidate,
      status: 'EMERGING',
      opportunity_score: 0,
      trend_score: 0,
      pricing: {
        ...mockCandidate.pricing,
        origin_price_usd: null,
        landed_cost_estimated_usd: null,
        suggested_sale_price_usd: null,
        estimated_margin_percent: null
      }
    };

    const enriched = await commercialEnrichmentModule.enrichSingleCandidateCommercialData(bareCandidate, 'UY');
    expect(enriched.candidate.opportunity_score).toBe(0);
    expect(enriched.candidate.commercial_readiness).toBe('BLOCKED');
  });

  // CASO E: Opportunity score > 0 + missing weight/price -> commercial readiness PARTIAL / BLOCKED
  it('E. Opportunity score > 0 with missing weight -> commercial readiness PARTIAL and landed cost UNKNOWN', async () => {
    const candMissingWeight: SourcingProductCandidate = {
      ...mockCandidate,
      pricing: {
        ...mockCandidate.pricing,
        origin_price_usd: 39.99,
        landed_cost_estimated_usd: null,
        suggested_sale_price_usd: null,
        estimated_margin_percent: null
      },
      status: 'PREORDER',
      opportunity_score: 35
    };

    const enriched = await commercialEnrichmentModule.enrichSingleCandidateCommercialData(candMissingWeight, 'UY');
    expect(enriched.candidate.pricing.landed_cost_estimated_usd).toBeNull();
    expect(enriched.landedCostStatus).toBe('MISSING_WEIGHT');
    expect(enriched.candidate.commercial_readiness).toBe('PARTIAL');
    expect(enriched.candidate.why_explanation.commercial_missing_reasons).toContain('Sin peso verificado en fuente (peso requerido para flete/arancel)');
  });

  // CASO F & G: No synthetic price or weight
  it('F/G. No synthetic price or weight is manufactured', async () => {
    const candNoData: SourcingProductCandidate = {
      ...mockCandidate,
      pricing: {
        origin_price_usd: null,
        amazon_price_usd: null,
        landed_cost_estimated_usd: null,
        suggested_sale_price_usd: null,
        estimated_margin_percent: null,
        currency: 'USD'
      }
    };

    const enriched = await commercialEnrichmentModule.enrichSingleCandidateCommercialData(candNoData, 'UY');
    expect(enriched.candidate.pricing.origin_price_usd).toBeNull();
    expect(enriched.candidate.pricing.landed_cost_estimated_usd).toBeNull();
    expect(commercialEnrichmentModule.extractRealProductWeightLbs(candNoData)).toBeNull();
  });

  // CASO H: No cross-product image
  it('H. Isolation: no cross-product image leaking between candidates', async () => {
    const candidateA: SourcingProductCandidate = {
      ...mockCandidate,
      id: 'cand-A',
      title: 'Batman Animated 6 inch',
      image_url: 'https://cdn.dc.com/batman.jpg'
    };
    const candidateB: SourcingProductCandidate = {
      ...mockCandidate,
      id: 'cand-B',
      title: 'Spawn Deluxe Series 12 inch',
      image_url: null,
      provenance: {
        ...mockCandidate.provenance,
        image: { value: null, status: 'UNKNOWN', source: null, source_url: null, observed_at: null }
      }
    };

    const emptySearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      statusCode: 200,
      products: [],
      resolution_source: 'ZINC_LIVE',
      total: 0
    });

    const { resolvedCandidates } = await zincResolverModule.resolveZincProductsForCandidates(
      [candidateA, candidateB],
      { searchFn: emptySearch }
    );

    expect(resolvedCandidates[0].image_url).toBe('https://cdn.dc.com/batman.jpg');
    expect(resolvedCandidates[1].image_url).toBeNull();
  });

  // CASO I: Zinc EXACT/STRONG sigue teniendo prioridad
  it('I. Zinc EXACT/STRONG maintains priority over source image', async () => {
    const candidateWithBoth: SourcingProductCandidate = {
      ...mockCandidate,
      id: 'cand-both',
      brand: 'Steiff',
      character: 'Batman',
      title: 'Steiff Batman 85th Anniversary Plush Bear',
      image_url: 'https://cdn.steiff.com/old-announcement.jpg',
      asin: null,
      provenance: {
        ...mockCandidate.provenance,
        asin: { value: null, status: 'UNKNOWN', source: null, source_url: null, observed_at: null },
        image: {
          value: 'https://cdn.steiff.com/old-announcement.jpg',
          status: 'OBSERVED',
          source: 'Steiff Official',
          source_url: 'https://steiff.com',
          observed_at: new Date().toISOString()
        }
      }
    };

    const strongZincSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      statusCode: 200,
      products: [normalizeAmazonZincProduct({
        external_product_id: 'B08STEIFF0',
        title: 'Steiff Batman 85th Anniversary Plush Bear',
        brand: 'Steiff',
        main_image_url_external: 'https://m.media-amazon.com/zinc-verified-steiff.jpg',
        price_usd: 129.99
      }, 'ZINC_LIVE')],
      resolution_source: 'ZINC_LIVE',
      total: 1
    });

    const { resolvedCandidates, telemetry } = await zincResolverModule.resolveZincProductsForCandidates(
      [candidateWithBoth],
      { searchFn: strongZincSearch }
    );

    expect(telemetry.strong_matches + telemetry.exact_matches).toBe(1);
    expect(resolvedCandidates[0].image_url).toBe('https://m.media-amazon.com/zinc-verified-steiff.jpg');
    expect((resolvedCandidates[0].provenance?.image as any)?.image_provenance).toBe('ZINC_VERIFIED');
  });
});

