import { describe, it, expect, vi } from 'vitest';
import { validateCandidate, isSafeImageUrl } from '../../../shared/sourcingCandidateValidation.js';
import { enrichCandidatesCommercialData } from '../services/sourcing/candidateCommercialEnrichment';
import { researchIntelligenceService } from '../services/sourcing/researchIntelligenceService';
import { aiGateway } from '../services/ai/aiGateway';
import { callOpenAIResponses } from '../../../server/lib/openai.js';

describe('Sourcing Master Final Verification Suite (Deterministic & Offline)', () => {

  // 1. IMAGE SAFETY: Sideshow product page URL rejected as image
  it('1. Sideshow product page URL rejected as image and falls back to null', () => {
    const sideshowUrl = 'https://www.sideshow.com/collectibles/marvel-iron-man-mark-vii-sideshow-collectibles-400388';
    expect(isSafeImageUrl(sideshowUrl)).toBe(false);

    const candidate = validateCandidate({
      title: 'Iron Man Mark VII',
      url: sideshowUrl,
      image_url: sideshowUrl
    });
    expect(candidate.image_url).toBeNull();
  });

  // 2. IMAGE SAFETY: Amazon /dp/ route rejected as image
  it('2. Amazon /dp/ and HTML routes rejected as image', () => {
    expect(isSafeImageUrl('https://www.amazon.com/dp/B08552JGRF')).toBe(false);
    expect(isSafeImageUrl('https://m.media-amazon.com/images/I/71xyz.jpg')).toBe(true);
  });

  // 3. SIGNAL PROPAGATION: Radar / Release novelty preserved into Opportunity Score
  it('3. Real signal + missing weight produces Opportunity Score > 0 and Commercial Readiness = PARTIAL', async () => {
    const rawCandidate = {
      id: 'cand-radar-001',
      title: 'Marvel Legends Retro Sentinel',
      brand: 'Hasbro',
      retailer: 'Hasbro Pulse',
      url: 'https://hasbropulse.com/products/sentinel',
      origin_price_usd: 99.99,
      is_preorder: true,
      trend_score: 25,
      opportunity_score: 28,
      status: 'PREORDER' as const,
      weight_lbs: null // Missing weight!
    };

    const validated = validateCandidate(rawCandidate, {
      country: 'UY',
      origin: 'RADAR'
    });

    const enriched = await enrichCandidatesCommercialData([validated], 'UY');
    expect(enriched).toHaveLength(1);
    const item = enriched[0];

    // Opportunity score must NOT collapse to 0
    expect(item.opportunity_score).toBeGreaterThan(0);
    // Commercial readiness must be PARTIAL because signals exist but weight is missing
    expect(item.commercial_readiness).toBe('PARTIAL');
    expect(item.why_explanation.commercial_missing_reasons).toContain('Sin peso verificado en fuente (peso requerido para flete/arancel)');
  });

  // 4. TOKEN ACCOUNTING: Responses API usage parsing
  it('4. Responses API usage extraction maps input_tokens, output_tokens, and total_tokens accurately', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'req_test_123' },
      json: async () => ({
        id: 'resp_test_01',
        output_text: JSON.stringify({ items: [] }),
        usage: {
          input_tokens: 350,
          output_tokens: 120,
          total_tokens: 470
        }
      })
    });

    const res = await callOpenAIResponses({
      model: 'gpt-4o-mini',
      input: 'test query',
      apiKey: 'test-key',
      fetchImpl: mockFetch as any
    });

    expect(res.usage.inputTokens).toBe(350);
    expect(res.usage.outputTokens).toBe(120);
    expect(res.usage.totalTokens).toBe(470);
    expect(res.pricing.estimated_cost_usd).toBeGreaterThan(0);
  });

  // 5. TOKEN ACCOUNTING: Missing usage = null / UNKNOWN (never fake 0)
  it('5. Responses API with missing usage reports null/UNKNOWN instead of fake 0', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'req_test_124' },
      json: async () => ({
        id: 'resp_test_02',
        output_text: JSON.stringify({ items: [] })
        // No usage field!
      })
    });

    const res = await callOpenAIResponses({
      model: 'gpt-4o-mini',
      input: 'test query without usage',
      apiKey: 'test-key',
      fetchImpl: mockFetch as any
    });

    expect(res.usage.inputTokens).toBeNull();
    expect(res.usage.outputTokens).toBeNull();
    expect(res.usage.totalTokens).toBeNull();
    expect(res.pricing.pricing_status).toBe('UNKNOWN_PRICING');
    expect(res.pricing.estimated_cost_usd).toBeNull();
  });

  // 6. CACHE ACCOUNTING: Cache hit has 0 incremental tokens and 0 incremental cost
  it('6. Cache hit reports incremental tokens = 0 and incremental cost = 0', async () => {
    vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'SUCCESS',
      cached: true,
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      data: {
        items: [
          {
            title: 'S.H. Figuarts Son Goku',
            brand: 'Bandai Spirits',
            url: 'https://www.amazon.com/dp/B08552TEST',
            origin_price_usd: 35.00
          }
        ]
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedTokens: 450,
        original_tokens: { input_tokens: 350, output_tokens: 100, total_tokens: 450 }
      } as any,
      pricing: {
        estimated_cost_usd: 0,
        pricing_status: 'PRICED',
        pricing_source: 'CACHE_HIT'
      } as any,
      latency_ms: 25
    });

    const res = await researchIntelligenceService.research({
      query: 'sh figuarts son goku',
      country: 'UY',
      mode: 'ECONOMICO'
    });

    expect(res.cached).toBe(true);
    expect(res.input_tokens).toBe(0);
    expect(res.output_tokens).toBe(0);
    expect(res.total_tokens).toBe(0);
    expect(res.cost_usd).toBe(0);
  });

  // 7. MANUAL RESEARCH: Real token usage reaches research response
  it('7. Real token usage reaches research response in Manual Research', async () => {
    vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'SUCCESS',
      cached: false,
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      data: {
        items: [
          {
            title: 'Transformers Legacy Motormaster',
            brand: 'Hasbro',
            url: 'https://www.amazon.com/dp/B09H123456',
            origin_price_usd: 89.99
          }
        ]
      },
      usage: {
        inputTokens: 1200,
        outputTokens: 450,
        totalTokens: 1650
      } as any,
      pricing: {
        estimated_cost_usd: 0.00045,
        pricing_status: 'PRICED',
        pricing_source: 'CENTRAL_REGISTRY'
      } as any,
      latency_ms: 650
    });

    const res = await researchIntelligenceService.research({
      query: 'transformers legacy motormaster',
      country: 'UY',
      mode: 'ECONOMICO'
    });

    expect(res.cached).toBe(false);
    expect(res.input_tokens).toBe(1200);
    expect(res.output_tokens).toBe(450);
    expect(res.total_tokens).toBe(1650);
    expect(res.cost_usd).toBe(0.00045);
  });

});
