import { describe, it, expect } from 'vitest';
import { 
  getAvailableAIModels, 
  validateRequestedModel, 
  MODEL_CAPABILITY_REGISTRY 
} from '../../../server/lib/openaiPricing.js';
import { 
  calculatePreFlightEstimate, 
  RESEARCH_MODES 
} from '../../../server/lib/researchCostOptimizer.js';

describe('SOURCING AI MODEL SELECTOR & DYNAMIC MANUAL OVERRIDE (ZERO OPENAI CALLS)', () => {

  it('1. Returns dynamic list of registered models without exposing server secrets', () => {
    const catalog = getAvailableAIModels({ engine: 'RESEARCH_INTELLIGENCE', requiresWebSearch: true });
    
    expect(catalog.default).toBe('AUTO');
    expect(catalog.models.length).toBeGreaterThanOrEqual(4);
    
    const ids = catalog.models.map(m => m.id);
    expect(ids).toContain('gpt-4o-mini');
    expect(ids).toContain('gpt-5.6-terra');
    expect(ids).toContain('gpt-5.6-sol');
    expect(ids).toContain('gpt-4o');

    // Confirm that model properties do not leak API secrets
    catalog.models.forEach(m => {
      expect(m.id).toBeDefined();
      expect(m.display_name).toBeDefined();
      expect(m.pricing).toBeDefined();
      expect((m as any).api_key).toBeUndefined();
      expect((m as any).secret).toBeUndefined();
    });
  });

  it('2. Model validation accepts allowed models and rejects invalid/unsupported models', () => {
    // Valid: AUTO
    const autoVal = validateRequestedModel('AUTO', { engine: 'RESEARCH_INTELLIGENCE', requiresWebSearch: true });
    expect(autoVal.valid).toBe(true);
    expect(autoVal.isAuto).toBe(true);
    expect(autoVal.model).toBeNull();

    // Valid: undefined/null falls back to AUTO
    const defVal = validateRequestedModel(undefined, { engine: 'RESEARCH_INTELLIGENCE', requiresWebSearch: true });
    expect(defVal.valid).toBe(true);
    expect(defVal.isAuto).toBe(true);
    expect(defVal.model).toBeNull();

    // Valid: explicit allowed model with web search capability
    const terraVal = validateRequestedModel('gpt-5.6-terra', { engine: 'RESEARCH_INTELLIGENCE', requiresWebSearch: true });
    expect(terraVal.valid).toBe(true);
    expect(terraVal.model).toBe('gpt-5.6-terra');
    expect(terraVal.isAuto).toBe(false);

    // Invalid: Unknown fake model
    const fakeVal = validateRequestedModel('gpt-fake-model', { engine: 'RESEARCH_INTELLIGENCE', requiresWebSearch: true });
    expect(fakeVal.valid).toBe(false);
    expect(fakeVal.error).toBe('MODEL_NOT_FOUND');

    // Invalid: Model without web search capability (e.g. gpt-5.6-luna)
    const lunaVal = validateRequestedModel('gpt-5.6-luna', { engine: 'RESEARCH_INTELLIGENCE', requiresWebSearch: true });
    expect(lunaVal.valid).toBe(false);
    expect(lunaVal.error).toBe('MODEL_DISABLED'); // Disabled / not web search compatible
  });

  it('3. Pre-Flight calculation supports AUTO vs Manual Model Override while preserving Mode constraints', () => {
    const query = 'nuevas figuras de Star Wars';
    const country = 'UY';

    // 3a. Mode: ECONOMICO, Model: AUTO -> should resolve to gpt-4o-mini
    const estAuto = calculatePreFlightEstimate({
      query,
      country,
      researchDepth: 'ECONOMICO',
      requestedModel: 'AUTO',
      isWebSearch: true
    });

    expect(estAuto.requested_model).toBe('AUTO');
    expect(estAuto.automatic_or_manual).toBe('AUTO');
    expect(estAuto.model).toBe('gpt-4o-mini');
    expect(estAuto.max_candidates).toBe(5); // ECONOMICO limit
    expect(estAuto.max_output_tokens).toBe(600); // ECONOMICO limit
    expect(estAuto.estimated_total_avg_usd).toBeLessThan(0.003);
    expect(estAuto.openai_calls_used).toBe(0);

    // 3b. Mode: ECONOMICO, Model: gpt-5.6-terra -> override model, preserve ECONOMICO limits
    const estTerra = calculatePreFlightEstimate({
      query,
      country,
      researchDepth: 'ECONOMICO',
      requestedModel: 'gpt-5.6-terra',
      isWebSearch: true
    });

    expect(estTerra.requested_model).toBe('gpt-5.6-terra');
    expect(estTerra.automatic_or_manual).toBe('MANUAL');
    expect(estTerra.model).toBe('gpt-5.6-terra');
    expect(estTerra.max_candidates).toBe(5); // Still ECONOMICO limit!
    expect(estTerra.max_output_tokens).toBe(600); // Still ECONOMICO limit!
    expect(estTerra.estimated_total_avg_usd).toBeGreaterThan(estAuto.estimated_total_avg_usd);
    expect(estTerra.cheaper_alternative).toBeDefined();
    expect(estTerra.cheaper_alternative?.model).toBe('gpt-4o-mini');
    expect(estTerra.openai_calls_used).toBe(0);
  });

  it('4. Zero-cost Pre-Flight comparisons across all supported models for "nuevas figuras de Star Wars"', () => {
    const query = 'nuevas figuras de Star Wars';
    const modelsToTest = ['AUTO', 'gpt-4o-mini', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-4o'];

    const estimates = modelsToTest.map(m => {
      return calculatePreFlightEstimate({
        query,
        country: 'UY',
        researchDepth: 'ECONOMICO',
        requestedModel: m,
        isWebSearch: true
      });
    });

    estimates.forEach(est => {
      // Must not make any real OpenAI calls
      expect(est.openai_calls_used).toBe(0);
      expect(est.estimated_input_tokens_min).toBeGreaterThan(6000);
      expect(est.estimated_input_tokens_max).toBeLessThan(12000);
      expect(est.estimated_total_min_usd).toBeGreaterThan(0);
      expect(est.estimated_total_max_usd).toBeGreaterThan(est.estimated_total_min_usd);
    });

    const autoEst = estimates.find(e => e.requested_model === 'AUTO')!;
    const terraEst = estimates.find(e => e.requested_model === 'gpt-5.6-terra')!;
    const solEst = estimates.find(e => e.requested_model === 'gpt-5.6-sol')!;
    const fourOEst = estimates.find(e => e.requested_model === 'gpt-4o')!;

    // gpt-4o-mini (AUTO) is cheapest
    expect(autoEst.estimated_total_avg_usd).toBeLessThan(terraEst.estimated_total_avg_usd);
    expect(terraEst.estimated_total_avg_usd).toBeLessThan(solEst.estimated_total_avg_usd);
  });

});
