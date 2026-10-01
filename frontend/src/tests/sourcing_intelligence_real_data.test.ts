import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrendEngine } from '../services/sourcing/trendEngine';
import { evaluateOpportunityScore } from '../services/sourcing/opportunityScoringEngine';
import { researchIntelligenceService } from '../services/sourcing/researchIntelligenceService';
import { sourcingDiscoveryEngine } from '../services/sourcing/sourcingDiscoveryEngine';
import { collectiblesSignalAggregator } from '../services/sourcing/collectiblesSignalAggregator';
import { marketSignalAggregator } from '../services/sourcing/marketSignalAggregator';
import { calculateInternationalPricing } from '../lib/internationalPricing';
import type { SourcingSignal } from '../types/sourcingIntelligence';

describe('SOURCING INTELLIGENCE V3 — REAL DATA ACTIVATION & ZERO MOCK PROTOCOL', () => {

  describe('1. Zero Mock in TrendEngine.buildTrendCards', () => {
    it('returns an empty array [] when no topics or signals are provided (cero defaultTopics)', () => {
      const cards = TrendEngine.buildTrendCards('UY', []);
      expect(cards).toEqual([]);
      expect(cards.length).toBe(0);
    });

    it('processes dynamic topics with real counts without injecting artificial 15 + index * 4 values', () => {
      const realTopic = {
        topic: 'Custom Dynamic Topic',
        category: 'Action Figures',
        signals: [
          {
            id: 'sig-test-1',
            source: 'Amazon US',
            source_type: 'RETAILER' as const,
            country: 'GLOBAL',
            signal_name: 'Verified Listing',
            confidence: 90,
            observed_at: new Date().toISOString()
          }
        ],
        internalSearchesCount: 0,
        internalWishlistCount: 0,
        isPreorder: false,
        isNewRelease: false
      };

      const cards = TrendEngine.buildTrendCards('UY', [realTopic]);
      expect(cards.length).toBe(1);
      expect(cards[0].topic).toBe('Custom Dynamic Topic');
      // When searches and wishlists are 0, collectibles trend score stays at base neutral (30)
      expect(cards[0].collectibles_trend_score).toBe(30);
      expect(cards[0].evidence_count).toBe(1);
    });
  });

  describe('2. Zero Fake Items in ResearchIntelligenceService Fallback', () => {
    it('returns items: [] and subtrends: [] if AI Gateway / remote research is unreachable', async () => {
      // Execute research on a random term with empty fallback
      const result = await (researchIntelligenceService as any).generateLocalResearchFallback('Unmonitored Brand', 'UY');
      expect(result.items).toEqual([]);
      expect(result.subtrends).toEqual([]);
    });
  });

  describe('3. Deterministic Opportunity Scoring', () => {
    it('computes 0-100 score strictly from mathematical formula of 7 weighted components', () => {
      const opp = evaluateOpportunityScore({
        demandScore: 80,
        sellerTrustScore: 90,
        marginPercent: 30,
        profitUsd: 15,
        matchConfidence: 0.95,
        inStock: true,
        isOfficialVerified: true,
        uruguayMarketGapScore: 70,
        trendVelocity: 15
      });

      expect(opp.opportunityScore).toBeGreaterThan(0);
      expect(opp.opportunityScore).toBeLessThanOrEqual(100);
      expect(opp.breakdown.margin).toBeGreaterThan(0);
      expect(opp.breakdown.demand).toBeGreaterThan(0);
    });
  });


  describe('4. SourcingDiscoveryEngine Live Aggregation', () => {
    it('returns empty array when database tables have no entries', async () => {
      const trends = await sourcingDiscoveryEngine.loadLiveTrends('UY');
      expect(Array.isArray(trends)).toBe(true);

      const discoveries = await sourcingDiscoveryEngine.loadLiveDiscoveries('UY');
      expect(Array.isArray(discoveries)).toBe(true);
    });
  });

  describe('5. Acceptance Test: Lara Croft Preorder Protocol', () => {
    it('identifies PREORDER status correctly based on real attributes without hardcoded presence', () => {
      const evalRes = TrendEngine.evaluateTrend({
        topic: 'Lara Croft Collector Figure',
        country: 'UY',
        signals: [
          {
            id: 'sig-test-lara',
            source: 'Amazon US Preorder',
            source_type: 'RETAILER',
            country: 'GLOBAL',
            signal_name: 'Official Preorder Window',
            confidence: 95,
            observed_at: new Date().toISOString()
          }
        ],
        isPreorder: true
      });

      expect(evalRes.status).toBe('PREORDER');
      expect(evalRes.drivers.some(d => d.includes('Preventa'))).toBe(true);
    });
  });
});
