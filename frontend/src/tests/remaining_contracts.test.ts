import { describe, expect, it, vi, beforeEach } from 'vitest';
import { relatedRecord } from '../lib/relatedRecord';
import { validateAndScoreImage } from '../plugins/collector-radar/core/radarAIEngine';
import { createNoDataMarketSummary } from '../services/sourcing/uruguayMarketIntelligence';
import { aiGateway } from '../services/ai/aiGateway';
import { executeOpenAIResearch } from '../services/sourcing/openaiResearchService';

vi.mock('../services/ai/aiGateway', () => ({ aiGateway: { execute: vi.fn() } }));
beforeEach(() => vi.mocked(aiGateway.execute).mockReset());

describe('Contracts used by questions, search and research', () => {
  it('keeps object-shaped relations and normalizes legacy arrays and missing parents', () => {
    const product = { id: 'product', title: 'Figura', slug: 'figura' };
    expect(relatedRecord(product)).toBe(product);
    expect(relatedRecord([product])).toBe(product);
    expect(relatedRecord([])).toBeUndefined();
    expect(relatedRecord(null)).toBeUndefined();
  });

  it.each([undefined, '', 'javascript:alert(1)'])('never publishes an absent or invalid image: %s', url => {
    expect(validateAndScoreImage({ title: 'Figura' }, url)).toMatchObject({
      isValid: false, isPublishable: false, finalImageUrl: null, provenance: 'NONE'
    });
  });

  it('does not turn an empty cache or a provider failure into verified market absence', () => {
    for (const reason of [undefined, 'provider unavailable']) {
      expect(createNoDataMarketSummary('Figura', reason)).toMatchObject({
        presence: 'UNKNOWN', market_position: 'UNKNOWN', market_verdict: 'NO_DISPONIBLE',
        min_price_usd: null, comparison_diff_percent: null,
        match_type: reason ? 'ERROR' : 'NOT_FOUND'
      });
    }
  });

  it('returns the canonical research pack metadata consumed by import', async () => {
    vi.mocked(aiGateway.execute).mockResolvedValueOnce({
      success: true, status: 'SUCCESS', provider: 'OPENAI', model: 'configured-model', latency_ms: 1,
      data: { items: [{ url: 'https://www.amazon.com/dp/B081VR7Y32', title: 'Figura' }] }
    });
    const result = await executeOpenAIResearch({ query: 'figura' });
    expect(result.pack).toMatchObject({ source: 'openai-research', status: 'READY', items_count: 1 });
    expect(result.pack?.items).toHaveLength(1);
  });

  it.each([
    ['UNAUTHORIZED', 'FORBIDDEN'], ['FORBIDDEN', 'FORBIDDEN'],
    ['COUNTRY_DISABLED', 'FEATURE_DISABLED'], ['MODEL_NOT_ALLOWED', 'MODEL_UNAVAILABLE'],
    ['PROVIDER_NOT_CONFIGURED', 'PENDING_CREDENTIAL'], ['PENDING_CREDENTIAL', 'PENDING_CREDENTIAL']
  ] as const)('preserves actionable gateway failures: %s', async (status, expected) => {
    vi.mocked(aiGateway.execute).mockResolvedValueOnce({
      success: false, status, provider: 'OPENAI', model: null, latency_ms: 1, error: 'unavailable'
    });
    expect(await executeOpenAIResearch({ query: 'figura' })).toMatchObject({ success: false, status: expected });
  });
});
