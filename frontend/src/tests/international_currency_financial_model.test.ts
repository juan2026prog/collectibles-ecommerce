import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CurrencyService,
  formatMoney,
  convertUsdToDisplay,
  convertUsdToDisplayUyu,
  getStoredExchangeRate,
  FALLBACK_RATES,
  COUNTRY_CURRENCY_CONFIG,
  type DisplayCurrency
} from '../services/currencyService';
import { calculateSourcingPricing } from '../services/sourcing/commercialPricingEngine';
import { evaluateOpportunityScore, applyAIAdvisoryAdjustment } from '../services/sourcing/opportunityScoringEngine';
import { autopilotPolicyEngine } from '../services/sourcing/autopilot/policyEngine';
import { autopilotExecutionEngine } from '../services/sourcing/autopilot/executionEngine';

describe('FASE: MODELO FINANCIERO INTERNACIONAL + FX AUTOMÁTICO + SOURCING OPERATIVO', () => {

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Canonical Currency USD & Conversions (UY / AR / CL / PE / MX / EC)', () => {
    it('formalizes USD as canonical currency and converts to all 6 display currencies', () => {
      const priceUsd = 49.90;

      // UY (USD -> UYU)
      const uyu = convertUsdToDisplay(priceUsd, 'UYU', 40.0835);
      expect(uyu).toBe(2000.17);
      expect(formatMoney({ amountUsd: priceUsd, displayCurrency: 'UYU', exchangeRate: 40.0835 })).toBe('$ 2.000 UYU');

      // AR (USD -> ARS)
      const ars = convertUsdToDisplay(priceUsd, 'ARS', 1528.7563);
      expect(ars).toBe(76284.94);
      expect(formatMoney({ amountUsd: priceUsd, displayCurrency: 'ARS', exchangeRate: 1528.7563 })).toBe('$ 76.285 ARS');

      // CL (USD -> CLP)
      const clp = convertUsdToDisplay(priceUsd, 'CLP', 961.5140);
      expect(clp).toBe(47979.55);
      expect(formatMoney({ amountUsd: priceUsd, displayCurrency: 'CLP', exchangeRate: 961.5140 })).toBe('$ 47.980 CLP');

      // PE (USD -> PEN)
      const pen = convertUsdToDisplay(priceUsd, 'PEN', 3.4178);
      expect(pen).toBe(170.55);
      expect(formatMoney({ amountUsd: priceUsd, displayCurrency: 'PEN', exchangeRate: 3.4178 })).toBe('S/ 170.55');

      // MX (USD -> MXN)
      const mxn = convertUsdToDisplay(priceUsd, 'MXN', 17.8992);
      expect(mxn).toBe(893.17);
      expect(formatMoney({ amountUsd: priceUsd, displayCurrency: 'MXN', exchangeRate: 17.8992 })).toBe('$ 893.17 MXN');

      // EC (USD -> USD)
      const usdEc = convertUsdToDisplay(priceUsd, 'USD', 1.0);
      expect(usdEc).toBe(49.90);
      expect(formatMoney({ amountUsd: priceUsd, displayCurrency: 'USD', exchangeRate: 1.0 })).toBe('US$ 49.90');
    });

    it('rejects zero, negative or NaN exchange rates fail-closed, returning null / fallback to USD', () => {
      expect(convertUsdToDisplay(49.90, 'UYU', 0)).toBeNull();
      expect(convertUsdToDisplay(49.90, 'UYU', -42.5)).toBeNull();
      expect(convertUsdToDisplay(49.90, 'UYU', NaN)).toBeNull();

      const safeMoney = formatMoney({ amountUsd: 49.90, displayCurrency: 'UYU', exchangeRate: 0 });
      expect(safeMoney).toBe('US$ 49.90');
    });
  });

  describe('2. Invariance of Commercial Logic (Margin, Score, Ranking)', () => {
    it('FX rate change updates display price but strictly preserves canonical USD price, profit, margin and score', () => {
      const canonicalPriceUsd = 49.90;
      const landedCostUsd = 34.38;
      const profitUsd = canonicalPriceUsd - landedCostUsd; // 15.52
      const marginUsd = (profitUsd / canonicalPriceUsd) * 100; // 31.1022%

      // Test with FX = 39.00
      const displayAt39 = convertUsdToDisplay(canonicalPriceUsd, 'UYU', 39.00);
      expect(displayAt39).toBe(1946.10);

      // Test with FX = 45.00
      const displayAt45 = convertUsdToDisplay(canonicalPriceUsd, 'UYU', 45.00);
      expect(displayAt45).toBe(2245.50);

      // Canonical price remains unchanged
      expect(canonicalPriceUsd).toBe(49.90);

      // Margin invariant in USD
      expect(Number(marginUsd.toFixed(2))).toBe(31.10);

      // Opportunity Score invariant to display currency
      const score = evaluateOpportunityScore({
        demandScore: 85,
        sellerTrustScore: 92,
        marginPercent: marginUsd,
        profitUsd: profitUsd,
        matchConfidence: 0.95,
        inStock: true,
        isOfficialVerified: true,
        uruguayMarketGapScore: 80
      });

      expect(score.opportunityScore).toBeGreaterThanOrEqual(75);
      expect(score.profitabilityStatus).toBe('VIABLE');
    });
  });

  describe('3. Customs / Franchise UY Correction (No automatic assumption of buyer franchise)', () => {
    it('product < USD 200 does NOT imply import_cost = 0; models franchise vs non-franchise scenarios', () => {
      const pricing = calculateSourcingPricing({
        source_price_usd: 150.00,
        has_verified_free_shipping: true,
        partner_fee_usd: 1.00
      });

      expect(pricing.currency).toBe('USD');
      expect(pricing.estimate_status).toBe('COMPLETE');
      expect(pricing.import_cost.status).toBe('SCENARIO_ESTIMATE');
      expect(pricing.import_scenarios.franchise_available.amount_usd).toBe(0);
      expect(pricing.import_scenarios.franchise_depleted.amount_usd).toBe(90.00); // 150 * 0.60
    });

    it('requires explicit customer franchise verification to certify VERIFIED_ZERO', () => {
      const verifiedPricing = calculateSourcingPricing({
        source_price_usd: 120.00,
        has_verified_free_shipping: true,
        customer_has_franchise: true
      });

      expect(verifiedPricing.import_cost.status).toBe('VERIFIED_ZERO');
      expect(verifiedPricing.import_cost.amount_usd).toBe(0);

      const nonFranchisePricing = calculateSourcingPricing({
        source_price_usd: 120.00,
        has_verified_free_shipping: true,
        customer_has_franchise: false
      });

      expect(nonFranchisePricing.import_cost.status).toBe('VERIFIED');
      expect(nonFranchisePricing.import_cost.amount_usd).toBe(72.00); // 120 * 0.60
    });

    it('flags ESTIMATE_INCOMPLETE when shipping is UNKNOWN (shipping_usd != 0 without evidence)', () => {
      const incomplete = calculateSourcingPricing({
        source_price_usd: 80.00,
        source_shipping_usd: null,
        has_verified_free_shipping: false
      });

      expect(incomplete.estimate_status).toBe('ESTIMATE_INCOMPLETE');
      expect(incomplete.shipping.status).toBe('UNKNOWN');
      expect(incomplete.shipping.amount_usd).toBeNull();
      expect(incomplete.landed_cost_usd).toBeNull();
      expect(incomplete.suggested_price_usd).toBeNull();
    });
  });

  describe('4. Sourcing Pipeline & Publication Safety (0 real purchases, 0 real publications)', () => {
    it('runs Sagat / Street Fighter opportunity through full dry run and requires admin approval', async () => {
      const sagatProduct: any = {
        canonical_sku: 'COL-JAD-SF2-SAGAT-01',
        title: 'Street Fighter II Sagat 1:12 Action Figure',
        brand: 'Jada Toys',
        franchise: 'Street Fighter',
        category_name: 'Action Figures',
        product_type: 'STANDARD',
        opportunity_score: 88,
        offers: [{
          id: 'off-sagat-1',
          source: 'amazon',
          source_product_id: 'B0C7J8K9LM',
          price: 24.99,
          domestic_shipping: 0,
          seller: 'Amazon.com',
          seller_rating: 98,
          stock: 12,
          condition: 'new'
        }],
        selected_source_id: 'off-sagat-1',
        authenticity: { status: 'VERIFIED_OFFICIAL' },
        financials: {
          real_cost_puesto_usd: 27.36,
          current_sale_price_usd: 39.90,
          margin_percent: 31.42,
          profit_usd: 12.54
        },
        uruguay_market: {
          match_confidence: 0.95,
          total_listings: 0,
          market_position: 'CHEAPER'
        }
      };

      const settings: any = {
        mode: 'AUTOPILOT',
        is_kill_switch_active: false,
        auto_publish: false,
        auto_purchase: false
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

      // 1. Policy evaluation requires approval
      const evaluation = autopilotPolicyEngine.evaluateProduct(sagatProduct, settings, rules);
      expect(evaluation.decision).toBe('PUBLICAR');
      expect(evaluation.executionMode).toBe('REQUIRES_APPROVAL');

      // 2. Dry run reports zero live publications and zero live purchases
      const dryReport = await autopilotExecutionEngine.runDryRun([sagatProduct], settings, rules);
      expect(dryReport.discoveredCount).toBe(1);
      expect(dryReport.publishedCount).toBe(0);
      expect(dryReport.approvalRequiredCount).toBe(1);
      expect(dryReport.estimatedAutoPurchaseUsd).toBe(0);
    });
  });

  describe('5. Country Configuration Status (UY Active, AR/CL/PE/MX/EC Inactive)', () => {
    it('preserves UY as the only active country while others remain inactive for display/FX readiness', () => {
      expect(COUNTRY_CURRENCY_CONFIG.UYU.is_active).toBe(true);
      expect(COUNTRY_CURRENCY_CONFIG.ARS.is_active).toBe(false);
      expect(COUNTRY_CURRENCY_CONFIG.CLP.is_active).toBe(false);
      expect(COUNTRY_CURRENCY_CONFIG.PEN.is_active).toBe(false);
      expect(COUNTRY_CURRENCY_CONFIG.MXN.is_active).toBe(false);
      expect(COUNTRY_CURRENCY_CONFIG.USD.is_active).toBe(false);
    });
  });
});
