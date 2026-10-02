import { describe, it, expect } from 'vitest';
import { 
  calculatePreFlightEstimate, 
  analyzeQueryComplexity, 
  RESEARCH_MODES,
  generateResearchCacheKey
} from '../../../server/lib/researchCostOptimizer.js';

describe('AI Pre-Flight Calibration V2 — Real Web Search Cost Estimation', () => {

  describe('1. Grounded Backtest: gpt-5.6-luna Live Production Telemetry', () => {
    it('accurately encloses the real 21,147 tokens and $0.004949 cost from production', () => {
      const query = 'nuevas figuras de Star Wars';
      const actualInputTokens = 21147;
      const actualOutputTokens = 600;
      const actualCostUsd = 0.004949;

      const estimate = calculatePreFlightEstimate({
        query,
        country: 'UY',
        researchDepth: 'ECONOMICO',
        requestedModel: 'gpt-5.6-luna',
        isWebSearch: true
      });

      expect(estimate.model).toBe('gpt-5.6-luna');
      expect(estimate.is_manual_override).toBe(true);
      expect(estimate.openai_calls_used).toBe(0);

      // Verify input token bounds
      expect(estimate.estimated_input_tokens_min).toBeLessThanOrEqual(actualInputTokens);
      expect(estimate.estimated_input_tokens_max).toBeGreaterThanOrEqual(actualInputTokens);
      expect(actualInputTokens).toBeGreaterThanOrEqual(16000);
      expect(actualInputTokens).toBeLessThanOrEqual(27000);

      // Verify cost bounds
      expect(estimate.estimated_cost_min_usd).toBeLessThanOrEqual(actualCostUsd);
      expect(estimate.estimated_cost_max_usd).toBeGreaterThanOrEqual(actualCostUsd);

      // Verify error between expected and actual is within strict tolerance (< 10%)
      const percentageDiff = Math.abs(estimate.estimated_cost_expected_usd - actualCostUsd) / actualCostUsd;
      expect(percentageDiff).toBeLessThan(0.10);
    });
  });

  describe('2. Default ECONOMICO (gpt-4o-mini) Calibration', () => {
    it('calculates realistic web search costs for gpt-4o-mini without underestimation', () => {
      const query = 'productos de pokemon';
      const estimate = calculatePreFlightEstimate({
        query,
        country: 'UY',
        researchDepth: 'ECONOMICO',
        requestedModel: 'AUTO',
        isWebSearch: true
      });

      expect(estimate.model).toBe('gpt-4o-mini');
      expect(estimate.is_manual_override).toBe(false);
      expect(estimate.estimated_input_tokens_min).toBeGreaterThanOrEqual(16500);
      expect(estimate.estimated_input_tokens_max).toBeLessThanOrEqual(28000);
      
      // Expected cost for 4o-mini with ~21K input tokens (~$0.0026 to $0.0043)
      expect(estimate.estimated_cost_min_usd).toBeGreaterThan(0.0020);
      expect(estimate.estimated_cost_max_usd).toBeLessThan(0.0055);
      expect(estimate.openai_calls_used).toBe(0);
    });
  });

  describe('3. Query Complexity Factor (Zero LLM Calls)', () => {
    it('adjusts token allowance deterministically for multi-entity and complex queries', () => {
      const simple = analyzeQueryComplexity('figuras de naruto');
      expect(simple.factor).toBe(1.0);
      expect(simple.confidence).toBe('HIGH');

      const complex = analyzeQueryComplexity('goku vs vegeta sh figuarts comparativa linea completa coleccion 2026');
      expect(complex.factor).toBeGreaterThan(1.0);
      expect(complex.factor).toBeLessThanOrEqual(1.25);
      expect(complex.reasons.length).toBeGreaterThan(0);

      const complexEstimate = calculatePreFlightEstimate({
        query: 'goku vs vegeta sh figuarts comparativa linea completa coleccion 2026',
        country: 'UY',
        researchDepth: 'ECONOMICO',
        requestedModel: 'AUTO',
        isWebSearch: true
      });

      expect(complexEstimate.estimated_input_tokens_expected).toBeGreaterThan(21000);
      expect(complexEstimate.query_complexity.factor).toBeGreaterThan(1.0);
    });
  });

  describe('4. Modes & Web Search vs No Web Search Profiles', () => {
    it('differentiates ESTANDAR, PROFUNDO, and NO_WEB_SEARCH', () => {
      const estandar = calculatePreFlightEstimate({
        query: 'hot toys batman',
        researchDepth: 'ESTANDAR',
        isWebSearch: true
      });
      expect(estandar.estimated_input_tokens_min).toBeGreaterThanOrEqual(22000);
      expect(estandar.estimated_input_tokens_max).toBeLessThanOrEqual(38000);

      const profundo = calculatePreFlightEstimate({
        query: 'hot toys batman',
        researchDepth: 'PROFUNDO',
        isWebSearch: true
      });
      expect(profundo.estimated_input_tokens_min).toBeGreaterThanOrEqual(30000);
      expect(profundo.estimated_input_tokens_max).toBeLessThanOrEqual(60000);

      const noWeb = calculatePreFlightEstimate({
        query: 'hot toys batman',
        researchDepth: 'ECONOMICO',
        isWebSearch: false
      });
      expect(noWeb.estimated_input_tokens_max).toBeLessThan(2500);
      expect(noWeb.estimated_cost_max_usd).toBeLessThan(0.001);
    });
  });

  describe('5. Cache Semantics ($0 on HIT, Paid on MISS)', () => {
    it('returns $0.0000 cost when cache is HIT', () => {
      const estimateHit = calculatePreFlightEstimate({
        query: 'marvel legends',
        researchDepth: 'ECONOMICO',
        requestedModel: 'AUTO',
        isWebSearch: true,
        cacheInfo: { status: 'HIT', age_seconds: 120, cached_items_count: 5 }
      });

      expect(estimateHit.estimated_total_min_usd).toBe(0);
      expect(estimateHit.estimated_total_avg_usd).toBe(0);
      expect(estimateHit.estimated_total_max_usd).toBe(0);
      expect(estimateHit.cache.status).toBe('HIT');
    });

    it('returns full paid estimate when cache is MISS or refreshed', () => {
      const estimateMiss = calculatePreFlightEstimate({
        query: 'marvel legends',
        researchDepth: 'ECONOMICO',
        requestedModel: 'AUTO',
        isWebSearch: true,
        cacheInfo: { status: 'MISS', age_seconds: null }
      });

      expect(estimateMiss.estimated_total_min_usd).toBeGreaterThan(0);
      expect(estimateMiss.estimated_total_max_usd).toBeGreaterThan(0);
    });
  });

});
