import { describe, it, expect, beforeEach } from 'vitest';
import { countryEngine } from '../services/sourcing/countryEngine';
import { currencyService } from '../services/sourcing/currencyService';
import { calculateMultiCountryLandedCost } from '../services/sourcing/multiCountryLandedCost';
import { 
  calculateCountryOpportunityScore, 
  calculateMarketGapScore, 
  calculateGlobalOpportunityScore,
  SourcingRiskEngine 
} from '../services/sourcing/latamOpportunityEngine';
import { selectBestMarket } from '../services/sourcing/bestMarketSelector';
import type { SourceOffer } from '../types/sourcing';

describe('SOURCING INTELLIGENCE FASE 6 — LATAM / MULTI-COUNTRY ENGINE', () => {
  beforeEach(async () => {
    await countryEngine.initialize();
    await currencyService.syncRatesFromDb();
  });

  describe('1. CountryEngine & Configuration Resolution', () => {
    it('preserves Uruguay (UY) as 100% active operational baseline market', () => {
      const uyConfig = countryEngine.getCountryConfig('UY');
      const uyReadiness = countryEngine.getCountryReadiness('UY');

      expect(uyConfig.country_code).toBe('UY');
      expect(uyConfig.currency).toBe('UYU');
      expect(uyConfig.enabled).toBe(true);
      expect(uyConfig.sourcing_enabled).toBe(true);
      expect(uyReadiness.status).toBe('OPERATIVO');
      expect(uyReadiness.readiness_score).toBeGreaterThanOrEqual(90);
    });

    it('reports disabled/unconfigured LATAM markets honestly without claiming operativity', () => {
      const arReadiness = countryEngine.getCountryReadiness('AR');
      expect(arReadiness.country_code).toBe('AR');
      expect(arReadiness.status).not.toBe('OPERATIVO');
      expect(arReadiness.missing_requirements.length).toBeGreaterThan(0);
    });

    it('enforces category prohibition and restriction rules', () => {
      const prohibitedCheck = countryEngine.isCategoryAllowed('UY', 'armas_y_combustibles');
      expect(prohibitedCheck.allowed).toBe(false);
      expect(prohibitedCheck.reason).toContain('prohibida');

      const allowedCheck = countryEngine.isCategoryAllowed('UY', 'figures_statues');
      expect(allowedCheck.allowed).toBe(true);
    });
  });

  describe('2. CurrencyService & Multi-Currency Exchange', () => {
    it('converts USD to UYU and LATAM currencies with rate freshness state', () => {
      const uyuConversion = currencyService.convertUsdToLocal(100, 'UYU');
      expect(uyuConversion.amountLocal).toBeGreaterThan(3000);
      expect(uyuConversion.status).toBe('ACTUALIZADO');

      const clpConversion = currencyService.convertUsdToLocal(50, 'CLP');
      expect(clpConversion.amountLocal).toBeGreaterThan(40000);
    });
  });

  describe('3. Multi-Country Landed Cost Calculation', () => {
    it('calculates Uruguay Urubox landed cost under franchise threshold ($200 USD / 4.4 lbs)', () => {
      const result = calculateMultiCountryLandedCost({
        originPriceUsd: 45.00,
        usaShippingUsd: 0,
        weightLbs: 2.0,
        destinationCountry: 'UY'
      });

      expect(result.destination_country).toBe('UY');
      expect(result.is_franchise_eligible).toBe(true);
      expect(result.customs_tax_usd).toBe(0);
      expect(result.vat_tax_usd).toBe(0);
      expect(result.total_landed_cost_usd).toBeLessThan(80.00);
      expect(result.calculation_confidence).toBeGreaterThanOrEqual(90);
    });

    it('applies standard import tax and VAT when exceeding franchise limits', () => {
      const result = calculateMultiCountryLandedCost({
        originPriceUsd: 250.00, // Exceeds $200 USD UY limit
        usaShippingUsd: 10.00,
        weightLbs: 3.0,
        destinationCountry: 'UY'
      });

      expect(result.destination_country).toBe('UY');
      expect(result.is_franchise_eligible).toBe(false);
      expect(result.exceeds_value_limit).toBe(true);
      expect(result.customs_tax_usd).toBeGreaterThan(0);
      expect(result.total_landed_cost_usd).toBeGreaterThan(350.00);
    });

    it('calculates parameterized landed cost for Chile and Argentina', () => {
      const clResult = calculateMultiCountryLandedCost({
        originPriceUsd: 80.00,
        weightLbs: 2.0,
        destinationCountry: 'CL'
      });

      expect(clResult.destination_country).toBe('CL');
      expect(clResult.currency).toBe('CLP');
      expect(clResult.converted_landed_cost_local).toBeGreaterThan(50000);
    });
  });

  describe('4. LatamOpportunityEngine & Market Gap', () => {
    it('calculates market gap score correctly based on trend and local competition', () => {
      const gapHigh = calculateMarketGapScore(85, 0, false); // High trend, 0 competition
      expect(gapHigh).toBe(91); // 85*0.6 = 51 + 40 = 91

      const gapSaturated = calculateMarketGapScore(85, 10, true);
      expect(gapSaturated).toBe(56);
    });

    it('computes country opportunity score and global opportunity score', () => {
      const mockOffer: SourceOffer = {
        id: 'off-1',
        source: 'amazon',
        source_product_id: 'B0CHRYU123',
        url: 'https://amazon.com/dp/B0CHRYU123',
        seller: 'Amazon.com',
        seller_verified: true,
        sold_by_retailer: true,
        price: 34.99,
        currency: 'USD',
        domestic_shipping: 0,
        availability: 'in_stock',
        condition: 'new',
        status: 'LIVE',
        data_source: 'LIVE',
        is_zinc_compatible: true,
        reliability_score: 98,
        last_checked_at: new Date().toISOString(),
      };

      const globalScore = calculateGlobalOpportunityScore('COL-RYU-001', {
        canonicalId: 'COL-RYU-001',
        title: 'Street Fighter Ryu Figure',
        brand: 'Storm Collectibles',
        bestOffer: mockOffer,
        trendScore: 90
      });

      expect(globalScore.canonical_id).toBe('COL-RYU-001');
      expect(globalScore.global_opportunity_score).toBeGreaterThan(60);
      expect(globalScore.top_countries.length).toBeGreaterThan(0);
      expect(globalScore.best_country).toBeDefined();
    });
  });

  describe('5. BestMarketSelector & Risk Engine', () => {
    it('selects optimal market deterministically with structured explainability', () => {
      const mockOffer: SourceOffer = {
        id: 'off-1',
        source: 'amazon',
        source_product_id: 'B0CHRYU123',
        url: 'https://amazon.com/dp/B0CHRYU123',
        seller: 'Amazon.com',
        seller_verified: true,
        sold_by_retailer: true,
        price: 34.99,
        currency: 'USD',
        domestic_shipping: 0,
        availability: 'in_stock',
        condition: 'new',
        status: 'LIVE',
        data_source: 'LIVE',
        is_zinc_compatible: true,
        reliability_score: 98,
        last_checked_at: new Date().toISOString(),
      };

      const bestMarket = selectBestMarket({
        canonicalId: 'COL-RYU-001',
        title: 'Street Fighter Ryu Figure',
        brand: 'Storm Collectibles',
        bestOffer: mockOffer,
        trendScore: 90
      });

      expect(bestMarket.best_country).toBe('UY');
      expect(bestMarket.opportunity_score).toBeGreaterThan(60);
      expect(bestMarket.decision).toMatch(/PUBLISH|REVIEW|WATCH/);
      expect(bestMarket.explanation.length).toBeGreaterThan(0);
    });

    it('blocks products with insufficient margin or missing source offer', () => {
      const risk = SourcingRiskEngine.evaluateRisk('UY', null, 50, 40);
      expect(risk.riskLevel).toBe('BLOCKED');
      expect(risk.reasonCodes).toContain('NO_SOURCE_OFFER');
    });
  });
});
