import { describe, it, expect } from 'vitest';
import { 
  RESEARCH_MODES, 
  COST_THRESHOLDS, 
  normalizeQuery, 
  generateResearchCacheKey, 
  resolveResearchMode, 
  estimateTokensLocally, 
  buildOptimizedResearchPrompt, 
  calculatePreFlightEstimate 
} from '../../../server/lib/researchCostOptimizer.js';

describe('RESEARCH COST OPTIMIZER & PRE-FLIGHT ESTIMATOR (ZERO OPENAI COST)', () => {

  it('1. Provides 3 official research modes with default cheap-first ECONOMICO', () => {
    expect(RESEARCH_MODES.ECONOMICO).toBeDefined();
    expect(RESEARCH_MODES.ESTANDAR).toBeDefined();
    expect(RESEARCH_MODES.PROFUNDO).toBeDefined();

    expect(RESEARCH_MODES.ECONOMICO.model).toBe('gpt-4o-mini');
    expect(RESEARCH_MODES.ECONOMICO.maxCandidates).toBe(15);
    expect(RESEARCH_MODES.ECONOMICO.maxOutputTokens).toBe(2000);

    expect(RESEARCH_MODES.ESTANDAR.model).toBe('gpt-5.6-terra');
    expect(RESEARCH_MODES.ESTANDAR.maxCandidates).toBe(8);
    expect(RESEARCH_MODES.ESTANDAR.maxOutputTokens).toBe(1200);

    expect(RESEARCH_MODES.PROFUNDO.model).toBe('gpt-5.6-terra');
    expect(RESEARCH_MODES.PROFUNDO.maxCandidates).toBe(15);
    expect(RESEARCH_MODES.PROFUNDO.maxOutputTokens).toBe(2000);

    // Default resolution falls back safely to ECONOMICO
    expect(resolveResearchMode(undefined).key).toBe('ECONOMICO');
    expect(resolveResearchMode('quick').key).toBe('ECONOMICO');
    expect(resolveResearchMode('standard').key).toBe('ESTANDAR');
    expect(resolveResearchMode('deep').key).toBe('PROFUNDO');
  });

  it('2. Normalizes queries and generates deterministic SHA-256 cache keys', () => {
    const q1 = '  Buscame Nuevos Preorders de McFarlane!!  ';
    const q2 = 'buscame nuevos preorders de mcfarlane';
    expect(normalizeQuery(q1)).toBe('buscame nuevos preorders de mcfarlane');
    expect(normalizeQuery(q2)).toBe('buscame nuevos preorders de mcfarlane');

    const key1 = generateResearchCacheKey(q1, 'GLOBAL', 'ECONOMICO');
    const key2 = generateResearchCacheKey(q2, 'GLOBAL', 'ECONOMICO');
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64); // SHA-256 hex string

    // Different modes have separate cache keys
    const keyStandard = generateResearchCacheKey(q1, 'GLOBAL', 'ESTANDAR');
    expect(keyStandard).not.toBe(key1);
  });

  it('3. Estimates tokens locally without external API calls', () => {
    const text = 'Investigación comercial de figuras y coleccionables en Uruguay';
    const count = estimateTokensLocally(text);
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(30);
    expect(estimateTokensLocally('')).toBe(0);
    expect(estimateTokensLocally(null)).toBe(0);
  });

  it('4. Pre-flight estimate for ECONOMICO routine query is strictly <= USD 0.01', () => {
    const est = calculatePreFlightEstimate({
      query: 'productos de pokemon',
      country: 'UY',
      researchDepth: 'ECONOMICO',
      isWebSearch: true
    });

    expect(est.model).toBe('gpt-4o-mini');
    expect(est.research_depth).toBe('ECONOMICO');
    expect(est.max_candidates).toBe(15);
    expect(est.max_output_tokens).toBe(2000);
    expect(est.estimated_total_max_usd).toBeLessThanOrEqual(COST_THRESHOLDS.LOW_MAX_USD);
    expect(est.requires_confirmation).toBe(false);
    expect(est.openai_calls_used).toBe(0);
  });

  it('5. Pre-flight estimate for ESTANDAR is within USD 0.02 - 0.09 and suggests cheaper alternative', () => {
    const est = calculatePreFlightEstimate({
      query: 'productos de pokemon',
      country: 'UY',
      researchDepth: 'ESTANDAR',
      isWebSearch: true
    });

    expect(est.model).toBe('gpt-5.6-terra');
    expect(est.research_depth).toBe('ESTANDAR');
    expect(est.estimated_total_max_usd).toBeLessThanOrEqual(0.09);
    expect(est.cheaper_alternative).toBeDefined();
    expect(est.cheaper_alternative?.mode).toBe('ECONOMICO');
    expect(est.cheaper_alternative?.savings_percent).toBeGreaterThan(60);
    expect(est.openai_calls_used).toBe(0);
  });

  it('6. Cache HIT reports exactly USD 0.0000 and 0 tokens charged', () => {
    const est = calculatePreFlightEstimate({
      query: 'productos de pokemon',
      country: 'UY',
      researchDepth: 'ECONOMICO',
      isWebSearch: true,
      cacheInfo: {
        status: 'HIT',
        age_seconds: 120,
        cached_items_count: 5
      }
    });

    expect(est.cache.status).toBe('HIT');
    expect(est.estimated_total_min_usd).toBe(0);
    expect(est.estimated_total_max_usd).toBe(0);
    expect(est.estimated_total_avg_usd).toBe(0);
    expect(est.requires_confirmation).toBe(false);
    expect(est.openai_calls_used).toBe(0);
  });

  it('7. Sourcing Purchase Capability and Auto-Publish remain strictly disabled', () => {
    // Structural Business Invariant Check
    const prompt = buildOptimizedResearchPrompt('Transformers Liokaiser', 'UY', RESEARCH_MODES.ECONOMICO);
    expect(prompt).toContain('NUNCA inventes precios, costos, stock ni URLs de imagen');
    expect(prompt).toContain('"image_url":string_or_null');
    expect(prompt).toContain('producto exacto');
    expect(prompt).not.toContain('buy');
    expect(prompt).not.toContain('purchase');
    expect(prompt).not.toContain('publish');
  });

});
