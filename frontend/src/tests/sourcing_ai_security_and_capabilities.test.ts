import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticateRequest } from '../../../server/lib/authGuard.js';
import { 
  getAvailableAIModels, 
  validateRequestedModel, 
  MODEL_CAPABILITY_REGISTRY 
} from '../../../server/lib/openaiPricing.js';
import { 
  calculatePreFlightEstimate, 
  RESEARCH_MODES 
} from '../../../server/lib/researchCostOptimizer.js';

describe('FINAL AI SECURITY + RBAC + MODEL CAPABILITIES TEST SUITE', () => {

  // ============================================================
  // 1. ANONYMOUS ATTACK / SECURITY TESTS
  // ============================================================
  describe('A. Anonymous & Unauthorized Request Rejection (Zero OpenAI Calls)', () => {
    it('1. Rejects completely anonymous requests without Authorization header (401)', async () => {
      const mockReq: any = {
        headers: {},
        body: {
          engine: 'RESEARCH_INTELLIGENCE',
          query: 'Pokemon Figures',
          country: 'UY',
          research_depth: 'ECONOMICO',
          requested_model: 'AUTO'
        }
      };

      const auth = await authenticateRequest(mockReq, { allowCron: true });
      expect(auth.authenticated).toBe(false);
      expect(auth.error).toBe('AUTHENTICATION_REQUIRED');
      expect(auth.isAdmin).toBe(false);
      expect(auth.isSuperAdmin).toBe(false);
    });

    it('2. Rejects anonymous request attempting expensive model override', async () => {
      const mockReq: any = {
        headers: {},
        body: {
          engine: 'RESEARCH_INTELLIGENCE',
          query: 'Star Wars Figures',
          country: 'UY',
          requested_model: 'gpt-5.6-sol'
        }
      };

      const auth = await authenticateRequest(mockReq, { allowCron: true });
      expect(auth.authenticated).toBe(false);
      expect(auth.error).toBe('AUTHENTICATION_REQUIRED');
    });

    it('3. Rejects anonymous request attempting force_refresh cache bypass', async () => {
      const mockReq: any = {
        headers: {},
        body: {
          engine: 'RESEARCH_INTELLIGENCE',
          query: 'Gundam Figures',
          country: 'UY',
          force_refresh: true
        }
      };

      const auth = await authenticateRequest(mockReq, { allowCron: true });
      expect(auth.authenticated).toBe(false);
    });

    it('4. Rejects anonymous request with invalid / fake Bearer token', async () => {
      const mockReq: any = {
        headers: {
          authorization: 'Bearer invalid_tampered_token_xyz123'
        },
        body: {
          engine: 'RESEARCH_INTELLIGENCE',
          query: 'Transformers',
          country: 'UY'
        }
      };

      const auth = await authenticateRequest(mockReq, { allowCron: true });
      expect(auth.authenticated).toBe(false);
      expect(auth.isAdmin).toBe(false);
    }, 15000);
  });

  // ============================================================
  // 2. RBAC & SUPERADMIN-ONLY MANUAL MODEL OVERRIDE
  // ============================================================
  describe('B. RBAC Verification (Superadmin-Only Manual Override)', () => {
    it('1. Authorizes normal Admin for AUTO research mode', async () => {
      const mockAdminReq: any = {
        headers: {
          'x-test-auth': 'admin'
        },
        body: {
          engine: 'RESEARCH_INTELLIGENCE',
          query: 'Dragon Ball Figures',
          requested_model: 'AUTO'
        }
      };

      const auth = await authenticateRequest(mockAdminReq, { allowCron: true });
      expect(auth.authenticated).toBe(true);
      expect(auth.isAdmin).toBe(true);
      expect(auth.isSuperAdmin).toBe(false);
    });

    it('2. Distinguishes Superadmin role from standard Admin', async () => {
      const mockSuperReq: any = {
        headers: {
          'x-test-auth': 'superadmin'
        },
        body: {
          engine: 'RESEARCH_INTELLIGENCE',
          query: 'Marvel Legends',
          requested_model: 'gpt-5.6-terra'
        }
      };

      const auth = await authenticateRequest(mockSuperReq, { allowCron: true });
      expect(auth.authenticated).toBe(true);
      expect(auth.isAdmin).toBe(true);
      expect(auth.isSuperAdmin).toBe(true);
    });

    it('3. Rejects Non-Admin regular user from triggering paid AI operations', async () => {
      const mockUserReq: any = {
        headers: {
          'x-test-auth': 'user'
        },
        body: {
          engine: 'RESEARCH_INTELLIGENCE',
          query: 'Hot Toys Batman'
        }
      };

      const auth = await authenticateRequest(mockUserReq, { allowCron: true });
      expect(auth.authenticated).toBe(true);
      expect(auth.isAdmin).toBe(false);
      expect(auth.isSuperAdmin).toBe(false);
    });

    it('4. Allows Vercel Cron server-to-server trigger for automated pipelines', async () => {
      const mockCronReq: any = {
        headers: {
          'x-vercel-cron': '1'
        }
      };

      const auth = await authenticateRequest(mockCronReq, { allowCron: true });
      expect(auth.authenticated).toBe(true);
      expect(auth.isCron).toBe(true);
      expect(auth.isAdmin).toBe(true);
    });
  });

  // ============================================================
  // 3. MODEL CAPABILITIES & AUTHORITATIVE VERIFICATION
  // ============================================================
  describe('C. Model Catalog & Capabilities Audit', () => {
    it('1. gpt-4o-mini is enabled, verified, and web-search capable', () => {
      const model = MODEL_CAPABILITY_REGISTRY['gpt-4o-mini'];
      expect(model).toBeDefined();
      expect(model.enabled).toBe(true);
      expect(model.capabilities.web_search).toBe(true);
      expect(model.capabilities.research_intelligence).toBe(true);
      expect(model.pricing.input_per_million).toBe(0.15);
      expect(model.pricing.output_per_million).toBe(0.60);
    });

    it('2. gpt-5.6-terra is enabled, verified, and web-search capable', () => {
      const model = MODEL_CAPABILITY_REGISTRY['gpt-5.6-terra'];
      expect(model).toBeDefined();
      expect(model.enabled).toBe(true);
      expect(model.capabilities.web_search).toBe(true);
      expect(model.capabilities.research_intelligence).toBe(true);
      expect(model.pricing.input_per_million).toBe(2.00);
      expect(model.pricing.output_per_million).toBe(12.00);
    });

    it('3. gpt-5.6-sol is enabled, verified, and web-search capable', () => {
      const model = MODEL_CAPABILITY_REGISTRY['gpt-5.6-sol'];
      expect(model).toBeDefined();
      expect(model.enabled).toBe(true);
      expect(model.capabilities.web_search).toBe(true);
      expect(model.capabilities.research_intelligence).toBe(true);
      expect(model.pricing.input_per_million).toBe(4.00);
      expect(model.pricing.output_per_million).toBe(20.00);
    });

    it('4. gpt-4o is enabled, verified, and web-search capable', () => {
      const model = MODEL_CAPABILITY_REGISTRY['gpt-4o'];
      expect(model).toBeDefined();
      expect(model.enabled).toBe(true);
      expect(model.capabilities.web_search).toBe(true);
      expect(model.capabilities.research_intelligence).toBe(true);
      expect(model.pricing.input_per_million).toBe(2.50);
      expect(model.pricing.output_per_million).toBe(10.00);
    });

    it('5. gpt-5.6-luna is enabled, verified, and web-search capable', () => {
      const model = MODEL_CAPABILITY_REGISTRY['gpt-5.6-luna'];
      expect(model).toBeDefined();
      expect(model.enabled).toBe(true);
      expect(model.capabilities.web_search).toBe(true);
      expect(model.capabilities.research_intelligence).toBe(true);
      expect(model.pricing.input_per_million).toBe(0.20);
      expect(model.pricing.cached_input_per_million).toBe(0.02);
      expect(model.pricing.output_per_million).toBe(1.20);

      const val = validateRequestedModel('gpt-5.6-luna', { engine: 'RESEARCH_INTELLIGENCE', requiresWebSearch: true });
      expect(val.valid).toBe(true);
      expect(val.model).toBe('gpt-5.6-luna');
    });

    it('6. Dynamic catalog excludes private credentials and secrets', () => {
      const catalog = getAvailableAIModels({ engine: 'RESEARCH_INTELLIGENCE', requiresWebSearch: true });
      catalog.models.forEach(m => {
        expect((m as any).api_key).toBeUndefined();
        expect((m as any).service_role).toBeUndefined();
        expect((m as any).cron_secret).toBeUndefined();
      });
    });
  });

  // ============================================================
  // 4. PRE-FLIGHT COST & CACHE INVARIANTS
  // ============================================================
  describe('D. Pre-Flight Estimator & Cache Security Invariants', () => {
    it('1. Pre-Flight estimator uses strictly 0 OpenAI calls ($0.000)', () => {
      const est = calculatePreFlightEstimate({
        query: 'nuevas figuras de Star Wars',
        country: 'UY',
        researchDepth: 'ECONOMICO',
        requestedModel: 'AUTO',
        isWebSearch: true
      });

      expect(est.openai_calls_used).toBe(0);
      expect(est.model).toBe('gpt-4o-mini');
      expect(est.estimated_total_max_usd).toBeLessThan(0.002);
    });

    it('2. Pre-Flight calculates accurate multiplier for expensive manual models', () => {
      const est = calculatePreFlightEstimate({
        query: 'nuevas figuras de Star Wars',
        country: 'UY',
        researchDepth: 'ECONOMICO',
        requestedModel: 'gpt-5.6-sol',
        isWebSearch: true
      });

      expect(est.openai_calls_used).toBe(0);
      expect(est.automatic_or_manual).toBe('MANUAL');
      expect(est.cheaper_alternative).toBeDefined();
      expect(est.cheaper_alternative?.cost_multiplier).toBeGreaterThan(15);
      expect(est.cheaper_alternative?.savings_percent).toBeGreaterThan(90);
    });
  });

});
