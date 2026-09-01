import { describe, it, expect } from 'vitest';
import { 
  calculateInternationalPricing, 
  calculateCanonicalPricing,
  calculateAcquisitionCost,
  calculateExpectedProfit,
  calculatePurchasePaymentFee
} from '../lib/internationalPricing';

describe('DYNAMIC & CENTRALIZED PROFIT PROTECTION ENGINE — PHASE 22 TESTS', () => {

  const standardConfig = {
    zinc_fee_usd: 1.00,
    financial_fee_percent: 2.50,
    financial_fee_fixed_usd: 0.50,
    financial_fee_tax_rate: 0.22,
    target_profit: 3.99,
    min_profit_usd: 3.99,
    fixed_markup_usd: 6.00,
    target_margin_percent: 15.00,
    pricing_mode: 'amazon_price_plus_fee'
  };

  // TEST 1 — Actual Production Case ($34.99) with 15% Net Margin
  it('TEST 1: Standard Current Case — Amazon $34.99, Zinc $1.00, Target Margin 15%, Min Fee $6.00', () => {
    const res = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 0 },
      standardConfig
    );

    // Prex fee: ((34.99 * 0.025) + 0.50) * 1.22 = 1.37475 * 1.22 = 1.677195 -> 1.68
    expect(res.financialFeeTotal).toBe(1.68);
    // Real Cost: 34.99 + 0 + 1.00 + 1.677195 = 37.667195 -> 37.67
    expect(res.realCost).toBe(37.67);
    // Commercial price: 34.99 + 6.00 = 40.99
    expect(res.commercialPrice).toBe(40.99);
    // Absolute Protected price: 37.67 + 3.99 = 41.66
    expect(res.absoluteProtectedPrice).toBe(41.66);
    // Margin Protected price (15% on final): 37.67 / 0.85 = 44.317... -> 44.32
    expect(res.marginProtectedPrice).toBe(44.32);
    // Final price must be max(40.99, 41.66, 44.32) = 44.32
    expect(res.finalPrice).toBe(44.32);
    // Required fee: 44.32 - 34.99 = 9.33
    expect(res.appliedFee).toBe(9.33);
    // Protection reason must be target_margin
    expect(res.pricingProtectionReason).toBe('target_margin');
    expect(res.profitProtectionTriggered).toBe(true);
    // Estimated profit: 44.32 - 37.67 = 6.65
    expect(res.estimatedProfit).toBe(6.65);
    expect(res.estimatedProfit).toBeGreaterThanOrEqual(standardConfig.min_profit_usd);
    expect(res.netMarginPercentage).toBeGreaterThanOrEqual(15.0);
  });

  // TEST 2 — Mandatory Test: Zinc Fee increases to USD 4.00 + 15% Margin
  it('TEST 2 (MANDATORY): Zinc fee rises to USD 4.00 — Margin 15% reacts to approx USD 47.85', () => {
    const configZinc4 = {
      ...standardConfig,
      zinc_fee_usd: 4.00
    };

    const res = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 0 },
      configZinc4
    );

    // Real Cost: 34.99 + 0 + 4.00 + 1.677195 = 40.667195 -> 40.67
    expect(res.realCost).toBe(40.67);
    // Commercial base price would have been 40.99, which is a loss!
    expect(res.commercialPrice).toBe(40.99);
    // Absolute Protected price: 40.67 + 3.99 = 44.66
    expect(res.absoluteProtectedPrice).toBe(44.66);
    // Margin Protected price (15% on final): 40.67 / 0.85 = 47.847... -> 47.85
    expect(res.marginProtectedPrice).toBe(47.85);
    // Final price MUST be 47.85
    expect(res.finalPrice).toBe(47.85);
    // Fee applied increases to absorb the Zinc fee rise: 47.85 - 34.99 = 12.86
    expect(res.appliedFee).toBe(12.86);
    expect(res.pricingProtectionReason).toBe('target_margin');
    expect(res.profitProtectionTriggered).toBe(true);
    // Profit: 47.85 - 40.67 = 7.18
    expect(res.estimatedProfit).toBe(7.18);
    expect(res.netMarginPercentage).toBeGreaterThanOrEqual(15.0);
  });

  // TEST 3 — Amazon USA Shipping (Domestic Freight in origin)
  it('TEST 3: Amazon USA Shipping = USD 5.00 — Absorbed dynamically into Real Cost', () => {
    const res = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 5.00 },
      standardConfig
    );

    // Real Cost: 34.99 + 5.00 + 1.00 + 1.68 = 42.67
    expect(res.realCost).toBe(42.67);
    // Commercial price: 34.99 + 5.00 + 6.00 = 45.99
    expect(res.commercialPrice).toBe(45.99);
    // Margin Protected price (15%): 42.67 / 0.85 = 50.20
    expect(res.marginProtectedPrice).toBe(50.20);
    expect(res.finalPrice).toBe(50.20);
    expect(res.profitProtectionTriggered).toBe(true);
    expect(res.estimatedProfit).toBe(7.53);
    expect(res.netMarginPercentage).toBeGreaterThanOrEqual(15.0);
  });

  // TEST 4 — Prex Card Processing % increases to 4.0%
  it('TEST 4: Prex percentage changes from 2.5% to 4.0%', () => {
    const configPrex4 = {
      ...standardConfig,
      financial_fee_percent: 4.00
    };

    const res = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 0 },
      configPrex4
    );

    // Prex fee: ((34.99 * 0.04) + 0.50) * 1.22 = (1.3996 + 0.50) * 1.22 = 2.3175 -> 2.32
    expect(res.financialFeeTotal).toBe(2.32);
    // Real Cost: 34.99 + 1.00 + 2.32 = 38.31
    expect(res.realCost).toBe(38.31);
    // Margin Protected price (15%): 38.31 / 0.85 = 45.07
    expect(res.marginProtectedPrice).toBe(45.07);
    expect(res.finalPrice).toBe(45.07);
    expect(res.estimatedProfit).toBe(6.76);
  });

  // TEST 5 — Prex Fixed Fee changes from 0.50 to 1.50
  it('TEST 5: Prex fixed charge changes from USD 0.50 to USD 1.50', () => {
    const configFixedFee = {
      ...standardConfig,
      financial_fee_fixed_usd: 1.50
    };

    const res = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 0 },
      configFixedFee
    );

    // Prex fee: ((34.99 * 0.025) + 1.50) * 1.22 = (0.87475 + 1.50) * 1.22 = 2.897 -> 2.90
    expect(res.financialFeeTotal).toBe(2.90);
    // Real Cost: 34.99 + 1.00 + 2.90 = 38.89
    expect(res.realCost).toBe(38.89);
    // Margin Protected price: 38.89 / 0.85 = 45.75
    expect(res.marginProtectedPrice).toBe(45.75);
    expect(res.finalPrice).toBe(45.75);
    expect(res.estimatedProfit).toBe(6.86);
  });

  // TEST 6 — Margin Disabled (target_margin_percent = 0): Absolute Protection Dominates
  it('TEST 6: Margin Disabled (0%) — Absolute profit floor ($3.99) takes precedence', () => {
    const configMargin0 = {
      ...standardConfig,
      target_margin_percent: 0.0
    };

    const res = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 0 },
      configMargin0
    );

    // Real Cost: 37.67
    expect(res.realCost).toBe(37.67);
    // Absolute Protected: 37.67 + 3.99 = 41.66
    expect(res.absoluteProtectedPrice).toBe(41.66);
    // Margin Protected is inactive (equals realCost 37.67)
    expect(res.marginProtectedPrice).toBe(37.67);
    // Commercial price: 40.99
    expect(res.commercialPrice).toBe(40.99);
    // Final price is absolute protected price: 41.66
    expect(res.finalPrice).toBe(41.66);
    expect(res.pricingProtectionReason).toBe('absolute_profit');
    expect(res.appliedFee).toBe(6.67);
    expect(res.estimatedProfit).toBe(3.99);
  });

  // TEST 7 — Sales Tax dynamically absorbed into Real Cost
  it('TEST 7: Real Sales Tax ($2.45) dynamically absorbed by Profit Protection', () => {
    const res = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 0, salesTax: 2.45 },
      standardConfig
    );

    // Real Cost: 37.67 + 2.45 = 40.12
    expect(res.realCost).toBe(40.12);
    expect(res.salesTax).toBe(2.45);
    // Margin Protected price (15%): 40.12 / 0.85 = 47.20
    expect(res.marginProtectedPrice).toBe(47.20);
    expect(res.finalPrice).toBe(47.20);
    expect(res.estimatedProfit).toBe(7.08);
    expect(res.netMarginPercentage).toBeGreaterThanOrEqual(15.0);
  });

  // TEST 8 — Commercial fee is sufficient (No unnecessary fee inflation)
  it('TEST 8: Base commercial fee is sufficient — Profit Protection does NOT inflate unnecessarily', () => {
    const res = calculateInternationalPricing(
      { amazonPrice: 100.00, usaShipping: 0 },
      {
        ...standardConfig,
        fixed_markup_usd: 25.00,
        target_margin_percent: 15.0,
        target_profit: 3.99
      }
    );

    // Prex fee: ((100 * 0.025) + 0.50) * 1.22 = 3.00 * 1.22 = 3.66
    // Real Cost: 100 + 1.00 + 3.66 = 104.66
    expect(res.realCost).toBe(104.66);
    // Absolute protected price: 104.66 + 3.99 = 108.65
    expect(res.absoluteProtectedPrice).toBe(108.65);
    // Margin protected price (15%): 104.66 / 0.85 = 123.13
    expect(res.marginProtectedPrice).toBe(123.13);
    // Commercial price: 100 + 25.00 = 125.00
    expect(res.commercialPrice).toBe(125.00);
    // Final price: MAX(125.00, 108.65, 123.13) = 125.00
    expect(res.finalPrice).toBe(125.00);
    // Commercial fee was sufficient!
    expect(res.pricingProtectionReason).toBe('commercial_fee');
    expect(res.profitProtectionTriggered).toBe(false);
    expect(res.appliedFee).toBe(25.00);
    // Real profit: 125.00 - 104.66 = 20.34
    expect(res.estimatedProfit).toBe(20.34);
    expect(res.netMarginPercentage).toBe(16.27);
  });

  // TEST 9 — Rounding Integrity: Profit and Margin are never undermined by rounding
  it('TEST 9: Rounding never reduces profit below target profit or margin', () => {
    const testPrices = [9.99, 14.50, 27.89, 49.95, 89.00, 199.99];

    for (const p of testPrices) {
      const res = calculateInternationalPricing(
        { amazonPrice: p, usaShipping: 0 },
        standardConfig
      );

      expect(res.finalPrice - res.realCost).toBeGreaterThanOrEqual(Number((res.minAbsoluteProfit - 0.01).toFixed(2)));
      expect(res.netMarginPercentage).toBeGreaterThanOrEqual(14.99);
    }
  });

  // TEST 10 — Fail Safe: Incomplete or undefined configuration uses safe defaults
  it('TEST 10: Fail Safe — Missing configuration defaults safely without selling at loss', () => {
    const resUndefined = calculateInternationalPricing(
      { amazonPrice: 34.99 },
      undefined
    );

    expect(resUndefined.realCost).toBeGreaterThan(34.99);
    expect(resUndefined.finalPrice).toBeGreaterThan(resUndefined.realCost);
    expect(resUndefined.estimatedProfit).toBeGreaterThanOrEqual(3.99);
    expect(isNaN(resUndefined.finalPrice)).toBe(false);

    const resEmpty = calculateInternationalPricing(
      { amazonPrice: 34.99 },
      {}
    );

    expect(resEmpty.realCost).toBe(37.67);
    expect(resEmpty.finalPrice).toBe(44.32);
    expect(resEmpty.estimatedProfit).toBe(6.65);
    expect(isNaN(resEmpty.finalPrice)).toBe(false);
  });

});
