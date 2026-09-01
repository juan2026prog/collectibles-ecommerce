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

  // TEST 1 — Actual Production Case ($34.99)
  it('TEST 1: Standard Current Case — Amazon $34.99, Zinc $1.00, Target $3.99, Min Fee $6.00', () => {
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
    // Protected price: 37.667195 + 3.99 = 41.657195 -> 41.66
    expect(res.profitProtectedPrice).toBe(41.66);
    // Final price must be max(40.99, 41.66) = 41.66
    expect(res.finalPrice).toBe(41.66);
    // Required fee to guarantee target profit: 41.66 - 34.99 = 6.67
    expect(res.appliedFee).toBe(6.67);
    // Profit Protection MUST be triggered
    expect(res.profitProtectionTriggered).toBe(true);
    // Estimated profit must equal target profit
    expect(res.estimatedProfit).toBe(3.99);
    expect(res.estimatedProfit).toBeGreaterThanOrEqual(standardConfig.min_profit_usd);
  });

  // TEST 2 — Mandatory Test: Zinc Fee increases to USD 4.00
  it('TEST 2 (MANDATORY): Zinc fee rises to USD 4.00 — Profit protection reacts immediately', () => {
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
    // Protected price: 40.667195 + 3.99 = 44.657195 -> 44.66
    expect(res.profitProtectedPrice).toBe(44.66);
    // Commercial base price would have been 40.99, which is a loss!
    expect(res.commercialPrice).toBe(40.99);
    // Final price MUST be protected price
    expect(res.finalPrice).toBe(44.66);
    // Fee applied increases to absorb the Zinc fee rise: 44.66 - 34.99 = 9.67
    expect(res.appliedFee).toBe(9.67);
    // Profit Protection MUST be triggered
    expect(res.profitProtectionTriggered).toBe(true);
    // Profit remains guaranteed at $3.99
    expect(res.estimatedProfit).toBe(3.99);
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
    // Protected price: 42.67 + 3.99 = 46.66
    expect(res.profitProtectedPrice).toBe(46.66);
    // Final price
    expect(res.finalPrice).toBe(46.66);
    expect(res.profitProtectionTriggered).toBe(true);
    expect(res.estimatedProfit).toBe(3.99);
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
    // Protected price: 38.31 + 3.99 = 42.30
    expect(res.profitProtectedPrice).toBe(42.30);
    expect(res.finalPrice).toBe(42.30);
    expect(res.estimatedProfit).toBe(3.99);
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
    // Protected price: 38.89 + 3.99 = 42.88
    expect(res.profitProtectedPrice).toBe(42.88);
    expect(res.finalPrice).toBe(42.88);
    expect(res.estimatedProfit).toBe(3.99);
  });

  // TEST 6 — Zinc Fee decreases to USD 0.50
  it('TEST 6: Zinc fee decreases to USD 0.50 — Automatically reflects in cost and price', () => {
    const configZincLow = {
      ...standardConfig,
      zinc_fee_usd: 0.50
    };

    const res = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 0 },
      configZincLow
    );

    // Real Cost: 34.99 + 0.50 + 1.68 = 37.17
    expect(res.realCost).toBe(37.17);
    // Protected price: 37.17 + 3.99 = 41.16
    expect(res.profitProtectedPrice).toBe(41.16);
    expect(res.finalPrice).toBe(41.16);
    expect(res.estimatedProfit).toBe(3.99);
  });

  // TEST 7 — Target Profit changes from 3.99 to 5.99
  it('TEST 7: Target profit increases from USD 3.99 to USD 5.99', () => {
    const configTargetHigh = {
      ...standardConfig,
      min_profit_usd: 5.99,
      target_profit: 5.99
    };

    const res = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 0 },
      configTargetHigh
    );

    // Protected price: 37.67 + 5.99 = 43.66
    expect(res.profitProtectedPrice).toBe(43.66);
    expect(res.finalPrice).toBe(43.66);
    expect(res.appliedFee).toBe(8.67);
    expect(res.estimatedProfit).toBe(5.99);
  });

  // TEST 8 — Commercial fee is sufficient (No unnecessary fee inflation)
  it('TEST 8: Base commercial fee is sufficient — Profit Protection does NOT inflate unnecessarily', () => {
    const res = calculateInternationalPricing(
      { amazonPrice: 100.00, usaShipping: 0 },
      {
        ...standardConfig,
        fixed_markup_usd: 25.00,
        target_profit: 3.99
      }
    );

    // Prex fee: ((100 * 0.025) + 0.50) * 1.22 = 3.00 * 1.22 = 3.66
    // Real Cost: 100 + 1.00 + 3.66 = 104.66
    expect(res.realCost).toBe(104.66);
    // Target profit: 3.99
    expect(res.targetProfit).toBe(3.99);
    // Protected price: 104.66 + 3.99 = 108.65
    expect(res.profitProtectedPrice).toBe(108.65);
    // Commercial price: 100 + 25.00 = 125.00
    expect(res.commercialPrice).toBe(125.00);
    // Final price: MAX(125.00, 108.65) = 125.00
    expect(res.finalPrice).toBe(125.00);
    // Commercial fee was sufficient!
    expect(res.profitProtectionTriggered).toBe(false);
    expect(res.appliedFee).toBe(25.00);
    // Real profit: 125.00 - 104.66 = 20.34 (well above target 3.99)
    expect(res.estimatedProfit).toBe(20.34);
    expect(res.estimatedProfit).toBeGreaterThanOrEqual(res.targetProfit);
  });

  // TEST 9 — Rounding Integrity: Profit is never undermined by rounding
  it('TEST 9: Rounding never reduces profit below target profit', () => {
    const testPrices = [9.99, 14.50, 27.89, 49.95, 89.00, 199.99];

    for (const p of testPrices) {
      const res = calculateInternationalPricing(
        { amazonPrice: p, usaShipping: 0 },
        standardConfig
      );

      expect(res.finalPrice - res.realCost).toBeGreaterThanOrEqual(Number((res.targetProfit - 0.01).toFixed(2)));
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
    expect(resUndefined.estimatedProfit).toBeGreaterThanOrEqual(2.00);
    expect(isNaN(resUndefined.finalPrice)).toBe(false);

    const resEmpty = calculateInternationalPricing(
      { amazonPrice: 34.99 },
      {}
    );

    expect(resEmpty.realCost).toBe(37.67);
    expect(resEmpty.finalPrice).toBe(41.66);
    expect(resEmpty.estimatedProfit).toBe(3.99);
    expect(isNaN(resEmpty.finalPrice)).toBe(false);
  });

});
