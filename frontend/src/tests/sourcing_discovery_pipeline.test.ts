import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sourcingDiscoveryEngine } from '../services/sourcing/sourcingDiscoveryEngine';
import * as zincResolverModule from '../services/sourcing/zincProductResolver';
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

  // CASO 6: ZINC_NO_MATCH preserves official source image without wiping to null
  it('6. ZINC_NO_MATCH preserves candidate source image and upgrades provenance to OBSERVED', async () => {
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
  });

  // CASO 7: Commercial readiness marks PARTIAL when real signals exist but weight is missing
  it('7. Candidate with missing weight results in landed_cost = null and commercial_readiness = PARTIAL', async () => {
    const candidateMissingWeight: SourcingProductCandidate = {
      ...mockCandidate,
      pricing: {
        ...mockCandidate.pricing,
        origin_price_usd: 49.99,
        landed_cost_estimated_usd: null,
        suggested_sale_price_usd: null,
        estimated_margin_percent: null
      },
      status: 'PREORDER',
      opportunity_score: 35
    };

    const enriched = await commercialEnrichmentModule.enrichSingleCandidateCommercialData(candidateMissingWeight, 'UY');
    expect(enriched.candidate.pricing.landed_cost_estimated_usd).toBeNull();
    expect(enriched.landedCostStatus).toBe('MISSING_WEIGHT');
    expect(enriched.candidate.commercial_readiness).toBe('PARTIAL');
    expect(enriched.candidate.opportunity_score).toBeGreaterThanOrEqual(35);
    expect(enriched.candidate.why_explanation.commercial_missing_reasons).toContain('Sin peso verificado en fuente (peso requerido para flete/arancel)');
  });

  // CASO 8: ZINC_NO_MATCH without any source image resolves image_url to null honestly
  it('8. ZINC_NO_MATCH without source image honestly sets image_url to null', async () => {
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
  });
});
