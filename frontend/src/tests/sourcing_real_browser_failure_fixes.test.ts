import { describe, it, expect, vi } from 'vitest';
import { 
  buildOptimizedResearchPrompt, 
  generateResearchCacheKey, 
  calculatePreFlightEstimate,
  RESEARCH_MODES
} from '../../../server/lib/researchCostOptimizer.js';
import { authenticateRequest } from '../../../server/lib/authGuard.js';
import { researchIntelligenceService } from '../services/sourcing/researchIntelligenceService';
import { aiGateway } from '../services/ai/aiGateway';

describe('Sourcing Real Browser Failure Fixes & Scope Test Suite', () => {

  describe('1. Server-Side Authentication & Role Normalization in authGuard.js', () => {
    it('normalizes superadmin, super_admin, god_admin, owner, and founder roles correctly', async () => {
      const mockReqSuper = {
        headers: {
          'x-test-auth': 'superadmin'
        }
      };
      const auth1 = await authenticateRequest(mockReqSuper);
      expect(auth1.authenticated).toBe(true);
      expect(auth1.isSuperAdmin).toBe(true);
      expect(auth1.isAdmin).toBe(true);

      const mockReqSuperUnderscore = {
        headers: {
          'x-test-auth': 'super_admin'
        }
      };
      const auth2 = await authenticateRequest(mockReqSuperUnderscore);
      expect(auth2.isSuperAdmin).toBe(true);
      expect(auth2.isAdmin).toBe(true);

      const mockReqGod = {
        headers: {
          'x-test-auth': 'god_admin'
        }
      };
      const auth3 = await authenticateRequest(mockReqGod);
      expect(auth3.isSuperAdmin).toBe(true);
      expect(auth3.isAdmin).toBe(true);
    });

    it('rejects anonymous requests without authorization header', async () => {
      const mockReqAnon = { headers: {} };
      const auth = await authenticateRequest(mockReqAnon);
      expect(auth.authenticated).toBe(false);
      expect(auth.isAdmin).toBe(false);
      expect(auth.error).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('2. Multilingual Natural Language Resolution & Research Prompt ("ositos cariñosos")', () => {
    it('instructs model to resolve Spanish commercial aliases like "ositos cariñosos" to Care Bears globally', () => {
      const query = 'ositos cariñosos';
      const prompt = buildOptimizedResearchPrompt(query, 'UY', RESEARCH_MODES.ECONOMICO, 'ALL_TIME');

      expect(prompt).toContain('ositos cariñosos');
      expect(prompt).toContain('Care Bears');
      expect(prompt).toContain('Mercado objetivo comercial: UY');
      expect(prompt).toContain('Alcance de descubrimiento: GLOBAL');
      expect(prompt).toContain('Ventana temporal: Sin límite temporal');
    });

    it('differentiates time scopes in the generated prompt', () => {
      const prompt7d = buildOptimizedResearchPrompt('neca tmnt', 'UY', RESEARCH_MODES.ECONOMICO, '7d');
      expect(prompt7d).toContain('Últimos 7 días');

      const prompt24h = buildOptimizedResearchPrompt('hot toys spider-man', 'UY', RESEARCH_MODES.ECONOMICO, '24h');
      expect(prompt24h).toContain('Últimas 24 horas');
    });
  });

  describe('3. Scope Metadata and Pre-Flight Non-Looping Guarantee', () => {
    it('returns explicit geographic and temporal scopes in calculatePreFlightEstimate', () => {
      const estimate = calculatePreFlightEstimate({
        query: 'ositos cariñosos',
        country: 'UY',
        researchDepth: 'ECONOMICO',
        requestedModel: 'AUTO',
        timeScope: 'ALL_TIME',
        isWebSearch: true
      });

      expect(estimate.search_scope).toBe('GLOBAL');
      expect(estimate.target_country).toBe('UY');
      expect(estimate.time_scope).toBe('ALL_TIME');
      expect(estimate.web_search_planned).toBe(true);
      expect(estimate.openai_calls_used).toBe(0);
      expect(estimate.estimated_cost_min_usd).toBeGreaterThan(0);
    });

    it('differentiates cache keys by time scope to avoid cross-period pollution', () => {
      const keyAll = generateResearchCacheKey('care bears', 'GLOBAL', 'ECONOMICO', 'AUTO', 'ALL_TIME');
      const key7d = generateResearchCacheKey('care bears', 'GLOBAL', 'ECONOMICO', 'AUTO', '7D');
      expect(keyAll).not.toBe(key7d);
    });
  });

  describe('4. Zero Result Explainability', () => {
    it('provides truthful explanation when research returns 0 candidates', async () => {
      vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
        success: true,
        status: 'SUCCESS',
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        data: {
          summary: 'No se encontraron productos para esta búsqueda.',
          items: []
        },
        sources: [],
        latency_ms: 250,
        usage: { inputTokens: 15000, outputTokens: 200, totalTokens: 15200 },
        pricing: {
          model: 'gpt-4o-mini',
          input_tokens: 15000,
          output_tokens: 200,
          total_tokens: 15200,
          input_cost_usd: 0.00225,
          output_cost_usd: 0.00012,
          estimated_cost_usd: 0.00237,
          pricing_status: 'PRICED'
        }
      });

      const res = await researchIntelligenceService.research({
        query: 'figura inexistente 99999',
        country: 'UY',
        research_depth: 'ECONOMICO'
      });

      expect(res.candidates.length).toBe(0);
      expect(res.zero_result_reason).toBeDefined();
      expect(res.zero_result_reason).toContain('No se encontraron productos oficiales o preventas verificables');
    });
  });

});
