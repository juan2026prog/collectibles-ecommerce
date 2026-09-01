import { describe, it, expect } from 'vitest';
import {
  calculateCanonicalPricing,
  calculateAcquisitionCost,
  calculateExpectedProfit,
  calculatePurchasePaymentFee
} from '../../../supabase/functions/_shared/pricing';

describe('REAL PRODUCTION PRICING ENGINE VERIFICATION', () => {

  const settings = {
    target_margin_percent: 15.0,
    min_absolute_profit_usd: 2.00,
    never_sell_at_loss: true,
    zinc_fee_usd: 1.00
  };

  it('1. Execute calculateCanonicalPricing on ProductCost = USD 5', () => {
    const rawResult = calculateCanonicalPricing(5.0, 0.0, 0.0, settings);
    console.log('RAW RESULT [ProductCost = 5, usaShipping = 0, commercialFee = 0]:\n', JSON.stringify(rawResult, null, 2));

    expect(rawResult.acquisition_cost_usd).toBe(6.76);
    expect(rawResult.expected_profit_usd).toBe(2.00);
    expect(rawResult.minimum_safe_price_usd).toBe(8.76);
    expect(rawResult.final_price_usd).toBe(8.76);
    expect(rawResult.is_loss_adjusted).toBe(true);
    expect(rawResult.profit_usd).toBe(2.00);
  });

  it('2. Execute calculateCanonicalPricing on ProductCost = USD 20', () => {
    const rawResult = calculateCanonicalPricing(20.0, 0.0, 0.0, settings);
    console.log('RAW RESULT [ProductCost = 20, usaShipping = 0, commercialFee = 0]:\n', JSON.stringify(rawResult, null, 2));

    expect(rawResult.acquisition_cost_usd).toBe(22.22);
    expect(rawResult.expected_profit_usd).toBe(2.00);
    expect(rawResult.minimum_safe_price_usd).toBe(24.22);
    expect(rawResult.final_price_usd).toBe(24.22);
  });

  it('3. Execute calculateCanonicalPricing on ProductCost = USD 100', () => {
    const rawResult = calculateCanonicalPricing(100.0, 0.0, 0.0, settings);
    console.log('RAW RESULT [ProductCost = 100, usaShipping = 0, commercialFee = 0]:\n', JSON.stringify(rawResult, null, 2));

    expect(rawResult.acquisition_cost_usd).toBe(104.66);
    expect(rawResult.expected_profit_usd).toBe(2.00);
    expect(rawResult.minimum_safe_price_usd).toBe(106.66);
    expect(rawResult.final_price_usd).toBe(106.66);
  });

  it('4. Execute calculateCanonicalPricing on ProductCost = USD 250', () => {
    const rawResult = calculateCanonicalPricing(250.0, 0.0, 0.0, settings);
    console.log('RAW RESULT [ProductCost = 250, usaShipping = 0, commercialFee = 0]:\n', JSON.stringify(rawResult, null, 2));

    expect(rawResult.acquisition_cost_usd).toBe(259.24);
    expect(rawResult.expected_profit_usd).toBe(2.00);
    expect(rawResult.minimum_safe_price_usd).toBe(261.24);
    expect(rawResult.final_price_usd).toBe(261.24);
  });

  it('5. Execute calculateCanonicalPricing on ProductCost = USD 20 + UsaShipping = USD 5', () => {
    const rawResult = calculateCanonicalPricing(20.0, 5.0, 0.0, settings);
    console.log('RAW RESULT [ProductCost = 20, usaShipping = 5, commercialFee = 0]:\n', JSON.stringify(rawResult, null, 2));

    expect(rawResult.acquisition_cost_usd).toBe(27.22);
    expect(rawResult.expected_profit_usd).toBe(2.00);
    expect(rawResult.minimum_safe_price_usd).toBe(29.22);
    expect(rawResult.final_price_usd).toBe(29.22);
  });

});
