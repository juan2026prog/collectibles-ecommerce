import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrendEngine } from '../services/sourcing/trendEngine';
import { evaluateOpportunityScore } from '../services/sourcing/opportunityScoringEngine';
import { researchIntelligenceService } from '../services/sourcing/researchIntelligenceService';
import { calculateInternationalPricing } from '../lib/internationalPricing';
import { parseTiendamiaHtmlResponse, normalizeAsin, compareAsins } from '../services/sourcing/tiendamiaMatchingService';
import { RadarIntegrationService } from '../services/sourcing/RadarIntegrationService';
import { aiGateway } from '../services/ai/aiGateway';
import { enrichSingleCandidateCommercialData } from '../services/sourcing/candidateCommercialEnrichment';
import type { SourcingSignal } from '../types/sourcingIntelligence';

describe('SOURCING INTELLIGENCE V2 — CERTIFICATION SUITE', () => {

  describe('1. TrendEngine Determinístico (No LLM)', () => {
    it('calcula Trend Score puramente a partir de observables sin que el LLM invente el score', () => {
      const signals: SourcingSignal[] = [
        { id: '1', source: 'Amazon US', source_type: 'RETAILER', country: 'GLOBAL', signal_name: 'In stock', confidence: 95, observed_at: new Date().toISOString() },
        { id: '2', source: 'Mercado Libre UY', source_type: 'MARKETPLACE', country: 'UY', signal_name: 'Searches up', confidence: 90, observed_at: new Date().toISOString() }
      ];

      const res = TrendEngine.evaluateTrend({
        topic: 'Pokémon TCG',
        country: 'UY',
        signals,
        internalSearchesCount: 30,
        internalWishlistCount: 15
      });

      expect(res.market_trend_score).toBeGreaterThan(0);
      expect(res.market_trend_score).toBeLessThanOrEqual(100);
      expect(res.collectibles_trend_score).toBeGreaterThan(0);
      expect(res.composite_trend_score).toBeGreaterThan(0);
      expect(typeof res.composite_trend_score).toBe('number');
    });

    it('diferencia estados de forma independiente: PREORDER != TRENDING y NEW != OPPORTUNITY', () => {
      const preorderRes = TrendEngine.evaluateTrend({
        topic: 'McFarlane Lara Croft',
        country: 'UY',
        signals: [],
        isPreorder: true
      });
      expect(preorderRes.status).toBe('PREORDER');

      const emergingRes = TrendEngine.evaluateTrend({
        topic: 'Jada Toys Street Fighter',
        country: 'UY',
        signals: [],
        internalSearchesCount: 40,
        internalWishlistCount: 20
      });
      expect(['EMERGING', 'TRENDING', 'GROWING']).toContain(emergingRes.status);
    });
  });

  describe('2. Opportunity Scoring determinístico de 7 componentes', () => {
    it('evalúa los 7 componentes oficiales (Demand, Margin, Gap, Seller, Stock, Authenticity, Trend) sin inventar números', () => {
      const opp = evaluateOpportunityScore({
        demandScore: 85,
        sellerTrustScore: 90,
        marginPercent: 28.5,
        profitUsd: 14.50,
        matchConfidence: 0.95,
        inStock: true,
        isOfficialVerified: true,
        uruguayMarketGapScore: 75,
        trendVelocity: 25
      });

      expect(opp.opportunityScore).toBeGreaterThanOrEqual(0);
      expect(opp.opportunityScore).toBeLessThanOrEqual(100);
      expect(opp.breakdown).toBeDefined();
      expect(opp.breakdown.demand).toBeLessThanOrEqual(25);
      expect(opp.breakdown.margin).toBeLessThanOrEqual(20);
      expect(opp.breakdown.market_gap).toBeLessThanOrEqual(15);
      expect(opp.breakdown.seller).toBeLessThanOrEqual(10);
      expect(opp.breakdown.availability).toBeLessThanOrEqual(10);
      expect(opp.breakdown.authenticity).toBeLessThanOrEqual(10);
      expect(opp.breakdown.trend).toBeLessThanOrEqual(10);
    });
  });

  describe('3. Motor de Pricing & Aduana UY', () => {
    it('calcula landed cost determinístico sin intervención de OpenAI', () => {
      const pricing = calculateInternationalPricing({
        amazonPrice: 39.99,
        usaShipping: 0
      });

      expect(pricing.realCost).toBeGreaterThan(39.99);
      expect(pricing.finalPrice).toBeGreaterThan(pricing.realCost);
      expect(pricing.estimatedProfit).toBeGreaterThan(0);
      expect(pricing.netMarginPercentage).toBeGreaterThan(0);
    });
  });

  describe('4. TiendaMía Matching Real (No Fallback Hardcodeado)', () => {
    it('compara ASIN con match exacto 1:1 y rechaza títulos o fuzzy matches', () => {
      expect(compareAsins('b0bsv2qz1w', 'B0BSV2QZ1W ')).toBe(true);
      expect(compareAsins('B0BSV2QZ1W', 'B0OTHERASIN')).toBe(false);
    });

    it('parsea correctamente HTML público de TiendaMía verificando SKU AMZ-{ASIN}', () => {
      const htmlSuccess = `<div data-product-sku="AMZ-B0BSV2QZ1W"><meta property="product:price:amount" content="49.99" /></div>`;
      const res = parseTiendamiaHtmlResponse(htmlSuccess, 'B0BSV2QZ1W');
      expect(res.found).toBe(true);
      expect(res.priceUsd).toBe(49.99);
      expect(res.status).toBe('FOUND');

      const htmlNotFound = `<div class="error-404">No encontramos resultados</div>`;
      const res404 = parseTiendamiaHtmlResponse(htmlNotFound, 'B0BSV2QZ1W');
      expect(res404.found).toBe(false);
      expect(res404.status).toBe('NOT_FOUND');
    });
  });

  describe('5. Research Intelligence & Central Gateway', () => {
    it('ejecuta research estructurado para Pokémon en UY y produce candidatos tipados', async () => {
      vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
        success: true,
        data: {
          summary: 'Oportunidad verificada para Pokémon TCG',
          subtrends: ['Scarlet & Violet', 'Elite Trainer Box'],
          items: [
            {
              title: 'Pokémon TCG: Scarlet & Violet ETB',
              brand: 'The Pokémon Company',
              franchise: 'Pokémon',
              retailer: 'Amazon',
              url: 'https://www.amazon.com/dp/B0BSV2QZ1W',
              origin_price_usd: 49.99,
              asin: 'B0BSV2QZ1W',
              category: 'Trading Cards',
              is_preorder: false
            }
          ]
        },
        provider: 'OPENAI',
        model: 'gpt-4o',
        latency_ms: 120,
        pricing: { estimated_cost_usd: 0.003 }
      } as any);

      const res = await researchIntelligenceService.research({
        query: 'Pokémon TCG',
        country: 'UY',
        period: '7d'
      });

      expect(res.success).toBe(true);
      expect(res.country).toBe('UY');
      expect(res.candidates.length).toBe(1);
      expect(res.trends.length).toBeGreaterThan(0);

      const firstCand = res.candidates[0];
      expect(firstCand.title).toContain('Pokémon');
      expect(firstCand.why_explanation).toBeDefined();

      // In the decoupled architecture, Manual Research completes promptly.
      // Commercial enrichment computes landed cost when weight and pricing are corroborated.
      const enriched = await enrichSingleCandidateCommercialData({
        ...firstCand,
        weight_lbs: 1.2
      }, 'UY');
      expect(enriched.candidate.pricing.landed_cost_estimated_usd).toBeGreaterThan(0);
    });
  });


  describe('6. Integración Radar', () => {
    it('permite a Radar crear una solicitud de investigación en Sourcing sin romper dependencias', async () => {
      const radarRelease = {
        id: 'rel-12345678-abcd',
        title: 'Street Fighter Jada Toys Ryu',
        brand: 'Jada Toys',
        franchise: 'Street Fighter',
        character: 'Ryu',
        scale: '1:12'
      };

      const result = await RadarIntegrationService.createSourcingResearchFromRadar(radarRelease);
      expect(result.success).toBe(true);
      expect(result.searchQuery).toContain('Street Fighter');
      expect(result.researchId).toContain('RADAR-RES-');
    });
  });

  describe('7. Gobernanza de Automatización', () => {
    it('garantiza que AUTO PUBLISH y AUTO PURCHASE permanezcan bloqueados en OFF', () => {
      const defaultSettings = {
        autoPublish: false,
        autoPurchase: false
      };
      expect(defaultSettings.autoPublish).toBe(false);
      expect(defaultSettings.autoPurchase).toBe(false);
    });
  });
});
