import { describe, expect, it } from 'vitest';
import { evaluateOpportunityScore } from '../services/sourcing/opportunityScoringEngine';

describe('Collectibles Part 3 guardrails', () => {
  it('does not manufacture seller trust or market-gap evidence', () => {
    const r = evaluateOpportunityScore({
      demandScore: 0,
      marginPercent: 0,
      profitUsd: 0,
      matchConfidence: 0,
      inStock: false,
      isOfficialVerified: false
    });
    expect(r.breakdown.seller).toBe(0);
    expect(r.breakdown.market_gap).toBe(0);
    expect(r.breakdown.availability).toBe(0);
  });

  it('keeps deterministic opportunity score bounded', () => {
    const r = evaluateOpportunityScore({
      demandScore: 100,
      sellerTrustScore: 100,
      marginPercent: 100,
      profitUsd: 100,
      matchConfidence: 1,
      inStock: true,
      isOfficialVerified: true,
      uruguayMarketGapScore: 100,
      radarInterest: 10,
      trendVelocity: 100
    });
    expect(r.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(r.opportunityScore).toBeLessThanOrEqual(100);
  });
});
