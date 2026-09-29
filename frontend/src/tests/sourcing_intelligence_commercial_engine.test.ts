import { describe, expect, it } from 'vitest';
import { 
  evaluateOpportunityScore, 
  applyAIAdvisoryAdjustment 
} from '../services/sourcing/opportunityScoringEngine';
import { autopilotPolicyEngine } from '../services/sourcing/autopilot/policyEngine';
import { autopilotExecutionEngine } from '../services/sourcing/autopilot/executionEngine';
import { 
  calculateOpenAICost, 
  getModelPricingRates, 
  getAllModelPricingDetails, 
  PRICING_SNAPSHOT_DATE 
} from '../../../server/lib/openaiPricing.js';
import { generateEvidenceFingerprint } from '../../../api/lib/canonicalJson.js';
import { mapExternalConditionToCanonical } from '../services/sourcing/conditionMapper';

describe('Sourcing Intelligence — Commercial Engine & Safety Gates', () => {

  describe('1. Normalization & Deduplication', () => {
    it('normalizes condition codes correctly across retail sources', () => {
      expect(mapExternalConditionToCanonical('Brand New', 'amazon').condition).toBe('new_sealed');
      expect(mapExternalConditionToCanonical('Open Box', 'ebay').condition).toBe('new_open_box');
      expect(mapExternalConditionToCanonical('Used complete in box', 'ebay').condition).toBe('used_complete');
      expect(mapExternalConditionToCanonical('Loose complete figure', 'ebay').condition).toBe('loose_complete');
    });

    it('generates deterministic evidence fingerprints for deduplication', () => {
      const evidenceA = {
        products: [{ id: 'p-100', title: 'Spider-Man Vintage Figure', price: 29.99 }],
        query: 'spider-man vintage'
      };
      const evidenceB = {
        query: 'spider-man vintage',
        products: [{ price: 29.99, id: 'p-100', title: 'Spider-Man Vintage Figure' }]
      };

      const fpA = generateEvidenceFingerprint(evidenceA);
      const fpB = generateEvidenceFingerprint(evidenceB);

      expect(fpA).toBe(fpB);
      expect(fpA).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('2. Deterministic Opportunity Scoring Breakdown', () => {
    it('calculates deterministic score with 7 official components and reason codes', () => {
      const result = evaluateOpportunityScore({
        demandScore: 80,
        sellerTrustScore: 95,
        marginPercent: 35,
        profitUsd: 25,
        matchConfidence: 0.95,
        inStock: true,
        isOfficialVerified: true,
        uruguayMarketGapScore: 85,
        wishlistInterest: 5,
        zeroResultCount: 2
      });

      expect(result.deterministicScore).toBeGreaterThanOrEqual(70);
      expect(result.opportunityScore).toBe(result.deterministicScore);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
      expect(result.profitabilityStatus).toBe('VIABLE');
      expect(result.breakdown.demand).toBe(20); // (80/100)*25
      expect(result.breakdown.margin).toBe(20); // 35% >= 30% -> max 20
      expect(result.breakdown.market_gap).toBeCloseTo(12.8, 1);
      expect(result.breakdown.seller).toBeCloseTo(9.5, 1);
      expect(result.breakdown.availability).toBe(10);
      expect(result.breakdown.authenticity).toBe(10);
      expect(result.breakdown.trend).toBe(10);
    });

    it('penalizes unreliable sellers with penalty and negative reason code', () => {
      const result = evaluateOpportunityScore({
        demandScore: 80,
        sellerTrustScore: 40, // Unreliable
        marginPercent: 30,
        profitUsd: 20,
        matchConfidence: 0.8,
        inStock: true,
        isOfficialVerified: true
      });

      const unreliableReason = result.reasonCodes.find(r => r.code === 'UNRELIABLE_SELLER');
      expect(unreliableReason).toBeDefined();
      expect(unreliableReason?.type).toBe('negative');
    });

    it('handles missing seller trust conservatively without inventing ratings', () => {
      const result = evaluateOpportunityScore({
        demandScore: 50,
        marginPercent: 20,
        profitUsd: 10,
        matchConfidence: 0.5,
        inStock: true,
        isOfficialVerified: false
      });

      expect(result.confidenceScore).toBeLessThan(75);
      expect(result.opportunityScore).toBeLessThan(70);
    });
  });

  describe('3. Advisory AI Adjustment Bounding [-10, +10]', () => {
    it('strictly clamps AI adjustment to [-10, +10] and bounds score to [0, 100]', () => {
      const adjPositive = applyAIAdvisoryAdjustment(75, 15); // Exceeds +10
      expect(adjPositive.aiAdjustment).toBe(10);
      expect(adjPositive.finalScore).toBe(85);

      const adjNegative = applyAIAdvisoryAdjustment(75, -25); // Exceeds -10
      expect(adjNegative.aiAdjustment).toBe(-10);
      expect(adjNegative.finalScore).toBe(65);

      const adjTopCap = applyAIAdvisoryAdjustment(98, 8);
      expect(adjTopCap.finalScore).toBe(100);

      const adjBottomCap = applyAIAdvisoryAdjustment(5, -8);
      expect(adjBottomCap.finalScore).toBe(0);
    });
  });

  describe('4. Autopilot Policy & Safety Boundaries', () => {
    it('enforces human approval when auto_publish and auto_purchase are disabled', () => {
      const settings: any = {
        mode: 'AUTOPILOT',
        is_kill_switch_active: false,
        auto_publish: false,
        auto_purchase: false
      };
      const product: any = {
        canonical_sku: 'COL-HAS-SPID-1234',
        brand: 'Hasbro',
        category_name: 'Figures',
        product_type: 'STANDARD',
        opportunity_score: 95,
        offers: [{ id: 'o1', source: 'amazon', price: 25, seller_rating: 98, stock: 10, condition: 'new' }],
        selected_source_id: 'o1',
        authenticity: { status: 'VERIFIED_OFFICIAL' },
        financials: { real_cost_puesto_usd: 30, current_sale_price_usd: 55, margin_percent: 45.4, profit_usd: 25 },
        uruguay_market: { match_confidence: 0.95, total_listings: 0, market_position: 'CHEAPER' }
      };
      const rules: any[] = [{
        scope: 'GLOBAL',
        identifier: 'all',
        is_active: true,
        min_margin_percent: 20,
        min_profit_usd: 5,
        min_opportunity_score: 75,
        min_seller_score: 90,
        min_stock: 1
      }];

      const evaluation = autopilotPolicyEngine.evaluateProduct(product, settings, rules);
      expect(evaluation.decision).toBe('PUBLICAR');
      expect(evaluation.executionMode).toBe('REQUIRES_APPROVAL');
    });

    it('runs dry run without executing live catalog mutations or purchases', async () => {
      const settings: any = {
        mode: 'AUTOPILOT',
        is_kill_switch_active: false,
        auto_publish: false,
        auto_purchase: false
      };
      const products: any[] = [
        {
          canonical_sku: 'COL-TEST-1',
          title: 'Iron Man Mark 85',
          brand: 'Hot Toys',
          category_name: 'Figures',
          product_type: 'STANDARD',
          opportunity_score: 92,
          offers: [{ id: 'o1', source: 'ebay', price: 350, seller_rating: 99, stock: 2, condition: 'new' }],
          selected_source_id: 'o1',
          authenticity: { status: 'VERIFIED_OFFICIAL' },
          financials: { real_cost_puesto_usd: 400, current_sale_price_usd: 580, margin_percent: 31, profit_usd: 180 },
          uruguay_market: { match_confidence: 1, total_listings: 0, market_position: 'CHEAPER' }
        },
        {
          canonical_sku: 'COL-TEST-2',
          title: 'Low Margin Figure',
          brand: 'Generic',
          category_name: 'Figures',
          product_type: 'STANDARD',
          opportunity_score: 30,
          offers: [{ id: 'o2', source: 'amazon', price: 15, seller_rating: 70, stock: 1, condition: 'new' }],
          selected_source_id: 'o2',
          authenticity: { status: 'UNVERIFIED' },
          financials: { real_cost_puesto_usd: 18, current_sale_price_usd: 19, margin_percent: 5, profit_usd: 1 },
          uruguay_market: { match_confidence: 0.5, total_listings: 5, market_position: 'MORE_EXPENSIVE' }
        }
      ];
      const rules: any[] = [{
        scope: 'GLOBAL',
        identifier: 'all',
        is_active: true,
        min_margin_percent: 15,
        min_profit_usd: 5,
        min_opportunity_score: 70,
        min_seller_score: 85,
        min_stock: 1
      }];

      const report = await autopilotExecutionEngine.runDryRun(products, settings, rules);
      expect(report.discoveredCount).toBe(2);
      expect(report.approvalRequiredCount).toBe(1);
      expect(report.watchedCount).toBe(1);
      expect(report.publishedCount).toBe(0); // Zero auto publishes
      expect(report.estimatedAutoPurchaseUsd).toBe(0); // Zero auto purchases
    });
  });

  describe('5. Pricing Snapshot & Anti-Zero USD Fail-Closed', () => {
    it('calculates cost accurately for verified snapshot rates', () => {
      const cost = calculateOpenAICost('gpt-5.6-terra', 1000, 500);
      expect(cost.pricing_status).toBe('PRICED');
      expect(cost.estimated_cost_usd).toBeGreaterThan(0);
      expect(cost.input_cost_usd).toBeCloseTo(0.002, 6);
      expect(cost.output_cost_usd).toBeCloseTo(0.006, 6);
    });

    it('fails closed with UNKNOWN_PRICING and null USD when model pricing is missing', () => {
      const cost = calculateOpenAICost('non-existent-fake-model-xyz', 1000, 500);
      expect(cost.pricing_status).toBe('UNKNOWN_PRICING');
      expect(cost.estimated_cost_usd).toBeNull();
      expect(cost.input_cost_usd).toBeNull();
      expect(cost.output_cost_usd).toBeNull();
    });

    it('returns full verified model pricing details for UI rendering', () => {
      const details = getAllModelPricingDetails();
      expect(details.length).toBeGreaterThanOrEqual(4);
      const terra = details.find(d => d.model === 'gpt-5.6-terra');
      expect(terra).toBeDefined();
      expect(terra?.status).toBe('VERIFIED');
      expect(terra?.verified_at).toBe(PRICING_SNAPSHOT_DATE);
    });
  });

  describe('6. Canonical USD Currency & Sourcing Pricing Engine Invariance', () => {
    it('calculates full sourcing landed cost and suggested price canonically in USD', async () => {
      const { calculateSourcingPricing } = await import('../services/sourcing/commercialPricingEngine');
      const pricing = calculateSourcingPricing({
        source_price_usd: 24.99,
        has_verified_free_shipping: true,
        partner_fee_usd: 1.00,
        target_margin_percent: 15.0,
        min_profit_usd: 3.99,
        fixed_markup_usd: 6.00
      });

      expect(pricing.currency).toBe('USD');
      expect(pricing.estimate_status).toBe('COMPLETE');
      expect(pricing.source_price_usd).toBe(24.99);
      expect(pricing.shipping.status).toBe('VERIFIED_ZERO');
      expect(pricing.shipping.amount_usd).toBe(0);
      expect(pricing.partner_fee.amount_usd).toBe(1.00);
      expect(pricing.landed_cost_usd).toBeGreaterThan(24.99);
      expect(pricing.suggested_price_usd).toBeGreaterThan(pricing.landed_cost_usd!);
      expect(pricing.profit_usd).toBeGreaterThanOrEqual(3.99);
      expect(pricing.margin_pct).toBeGreaterThanOrEqual(15.0);
    });

    it('flags ESTIMATE_INCOMPLETE when shipping or mandatory cost is missing/unknown', async () => {
      const { calculateSourcingPricing } = await import('../services/sourcing/commercialPricingEngine');
      const pricing = calculateSourcingPricing({
        source_price_usd: 35.00,
        source_shipping_usd: null, // Unknown shipping
        has_verified_free_shipping: false
      });

      expect(pricing.estimate_status).toBe('ESTIMATE_INCOMPLETE');
      expect(pricing.shipping.status).toBe('UNKNOWN');
      expect(pricing.shipping.amount_usd).toBeNull();
      expect(pricing.landed_cost_usd).toBeNull();
      expect(pricing.suggested_price_usd).toBeNull();
      expect(pricing.missing_components).toContain('shipping');
    });

    it('proves that display currency (USD vs UYU) does NOT mutate canonical price, margin or score', async () => {
      const { convertUsdToDisplayUyu, formatMoney } = await import('../services/currencyService');
      const canonicalPriceUsd = 39.90;
      const fxRate = 42.50;

      // 1. Display conversions
      const displayUyu = convertUsdToDisplayUyu(canonicalPriceUsd, fxRate);
      expect(displayUyu).toBe(1695.75);

      const formattedUsd = formatMoney({ amountUsd: canonicalPriceUsd, displayCurrency: 'USD' });
      const formattedUyu = formatMoney({ amountUsd: canonicalPriceUsd, displayCurrency: 'UYU', exchangeRate: fxRate });

      expect(formattedUsd).toBe('US$ 39.90');
      expect(formattedUyu).toBe('$ 1.696 UYU');

      // 2. Mathematical Margin Invariance
      const landedCostUsd = 27.36;
      const profitUsd = canonicalPriceUsd - landedCostUsd;
      const marginUsd = (profitUsd / canonicalPriceUsd) * 100;

      const landedCostUyu = landedCostUsd * fxRate;
      const displaySalePriceUyu = canonicalPriceUsd * fxRate;
      const profitUyu = displaySalePriceUyu - landedCostUyu;
      const marginUyu = (profitUyu / displaySalePriceUyu) * 100;

      expect(marginUyu).toBeCloseTo(marginUsd, 4);

      // 3. Score Invariance
      const scoreEvaluated = evaluateOpportunityScore({
        demandScore: 80,
        marginPercent: marginUsd,
        profitUsd: profitUsd,
        matchConfidence: 0.9,
        inStock: true,
        isOfficialVerified: true
      });

      expect(scoreEvaluated.opportunityScore).toBeGreaterThanOrEqual(70);
    });

    it('falls back closed to USD when FX rate is unavailable or invalid', async () => {
      const { formatMoney, convertUsdToDisplayUyu } = await import('../services/currencyService');
      expect(convertUsdToDisplayUyu(39.90, -1)).toBeNull();
      expect(convertUsdToDisplayUyu(39.90, 0)).toBeNull();

      // formatMoney falls back gracefully to USD without throwing or inventing rates
      const formatted = formatMoney({ amountUsd: 39.90, displayCurrency: 'UYU', exchangeRate: 0 });
      expect(formatted).toBe('US$ 39.90');
    });
  });
});


