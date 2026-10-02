import { describe, it, expect } from 'vitest';
import {
  normalizeResultLimit,
  planResearchBatches,
  deduplicateResearchCandidates,
  calculatePreFlightEstimate
} from '../../../server/lib/researchCostOptimizer.js';

describe('Result Limit and Batching Protocol', () => {
  it('normalizes result limits correctly with canonical fallback', () => {
    expect(normalizeResultLimit(10)).toBe(10);
    expect(normalizeResultLimit(25)).toBe(25);
    expect(normalizeResultLimit(50)).toBe(50);
    expect(normalizeResultLimit(100)).toBe(100);
    expect(normalizeResultLimit('100')).toBe(100);
    expect(normalizeResultLimit('AUTO')).toBe('AUTO');
    expect(normalizeResultLimit('invalid')).toBe('AUTO');
    expect(normalizeResultLimit(null)).toBe('AUTO');
  });

  it('plans batches properly according to result limits', () => {
    const mode = { key: 'ECONOMICO', model: 'gpt-4o-mini', maxCandidates: 15, maxOutputTokens: 1200 };
    
    // AUTO -> 1 batch, 15 target
    const planAuto = planResearchBatches('AUTO', mode);
    expect(planAuto.batchCount).toBe(1);
    expect(planAuto.targetCount).toBe(15);

    // 10 -> 1 batch, 10 target
    const plan10 = planResearchBatches(10, mode);
    expect(plan10.batchCount).toBe(1);
    expect(plan10.targetCount).toBe(10);

    // 25 -> 2 batches
    const plan25 = planResearchBatches(25, mode);
    expect(plan25.batchCount).toBe(2);
    expect(plan25.batches.length).toBe(2);
    expect(plan25.targetCount).toBe(25);

    // 50 -> 3 batches
    const plan50 = planResearchBatches(50, mode);
    expect(plan50.batchCount).toBe(3);
    expect(plan50.batches.length).toBe(3);
    expect(plan50.targetCount).toBe(50);

    // 100 -> 5 batches
    const plan100 = planResearchBatches(100, mode);
    expect(plan100.batchCount).toBe(5);
    expect(plan100.batches.length).toBe(5);
    expect(plan100.targetCount).toBe(100);
  });

  it('multiplies estimated pre-flight cost and tokens proportionally to batch count', () => {
    const estAuto = calculatePreFlightEstimate({ query: 'ositos cariñosos', resultLimit: 'AUTO' });
    const est100 = calculatePreFlightEstimate({ query: 'ositos cariñosos', resultLimit: 100 });

    expect(estAuto.batches_planned).toBe(1);
    expect(est100.batches_planned).toBe(5);
    expect(est100.estimated_input_tokens_expected).toBeGreaterThan(estAuto.estimated_input_tokens_expected * 4);
    expect(est100.estimated_cost_expected_usd).toBeGreaterThan(estAuto.estimated_cost_expected_usd * 4);
  });

  it('deduplicates candidates preserving distinct variants and merging evidence', () => {
    const existing = [
      {
        title: 'Care Bears Cheer Bear 14" Plush',
        brand: 'Basic Fun',
        franchise: 'Care Bears',
        origin_price_usd: 14.99,
        evidence: [{ url: 'https://amazon.com/item1', title: 'Amazon' }]
      }
    ];

    const incoming = [
      // Duplicate of Cheer Bear
      {
        title: 'Care Bears Cheer Bear Plush 14 Inch',
        brand: 'Basic Fun',
        franchise: 'Care Bears',
        origin_price_usd: 15.99,
        evidence: [{ url: 'https://walmart.com/item1', title: 'Walmart' }]
      },
      // Distinct character: Grumpy Bear
      {
        title: 'Care Bears Grumpy Bear 14" Plush',
        brand: 'Basic Fun',
        franchise: 'Care Bears',
        origin_price_usd: 14.99,
        evidence: [{ url: 'https://target.com/item2', title: 'Target' }]
      }
    ];

    const merged = deduplicateResearchCandidates(existing, incoming);
    expect(merged.length).toBe(2);
    const cheer = merged.find(c => c.title.toLowerCase().includes('cheer'));
    expect(cheer.evidence.length).toBe(2);
    expect(merged.find(c => c.title.toLowerCase().includes('grumpy'))).toBeDefined();
  });
});
