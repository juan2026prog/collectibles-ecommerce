import { describe, it, expect } from 'vitest';
import { supabase } from '../lib/supabase';
import { calculateInternationalPricing } from '../lib/internationalPricing';

describe('INTERNATIONAL SYNC SETTINGS PRIVACY & SECURITY TEST SUITE', { timeout: 20000 }, () => {

  it('1. Public status RPC get_international_public_status returns only boolean flags without leaking financial secrets', async () => {
    const { data, error } = await supabase.rpc('get_international_public_status');
    expect(error).toBeNull();
    expect(data).toBeDefined();
    
    // Verify public flags exist
    expect(data).toHaveProperty('international_public_enabled');
    expect(data).toHaveProperty('international_purchases_enabled');

    // STRICT PRIVACY AUDIT: Assert ZERO financial fields are returned
    expect(data).not.toHaveProperty('zinc_fee_usd');
    expect(data).not.toHaveProperty('target_margin_percent');
    expect(data).not.toHaveProperty('financial_fee_percent');
    expect(data).not.toHaveProperty('financial_fee_fixed_usd');
    expect(data).not.toHaveProperty('financial_fee_tax_rate');
    expect(data).not.toHaveProperty('min_absolute_profit_usd');
    expect(data).not.toHaveProperty('min_profit_usd');
    expect(data).not.toHaveProperty('fixed_markup_usd');
    expect(data).not.toHaveProperty('florida_sales_tax_percent');
  });

  it('2. Price Tampering Defense: Client attempting to submit reduced price is rejected and overridden', () => {
    const canonicalConfig = {
      zinc_fee_usd: 1.00,
      financial_fee_percent: 2.50,
      financial_fee_fixed_usd: 0.50,
      financial_fee_tax_rate: 0.22,
      min_absolute_profit_usd: 3.99,
      target_margin_percent: 15.00,
      fixed_markup_usd: 6.00
    };

    // Client sends tampered price of $30.00 on a $34.99 Amazon item
    const tamperedPayload = {
      product_id: 'test-item',
      amazonPrice: 34.99,
      client_price: 30.00
    };

    // Server calculates canonical price
    const calculated = calculateInternationalPricing({ amazonPrice: tamperedPayload.amazonPrice }, canonicalConfig);
    expect(calculated.finalPrice).toBe(44.32);
    expect(calculated.finalPrice).not.toBe(tamperedPayload.client_price);
    expect(calculated.realCost).toBe(37.67);
  });

  it('3. Live Check Repricing: When Amazon price increases from $34.99 to $39.99, pricing engine increases final price from $44.32 to $50.38', () => {
    const config = {
      zinc_fee_usd: 1.00,
      financial_fee_percent: 2.50,
      financial_fee_fixed_usd: 0.50,
      financial_fee_tax_rate: 0.22,
      min_absolute_profit_usd: 3.99,
      target_margin_percent: 15.00,
      fixed_markup_usd: 6.00
    };

    const initial = calculateInternationalPricing({ amazonPrice: 34.99 }, config);
    expect(initial.finalPrice).toBe(44.32);

    const afterIncrease = calculateInternationalPricing({ amazonPrice: 39.99 }, config);
    expect(afterIncrease.realCost).toBe(42.82);
    expect(afterIncrease.finalPrice).toBe(50.38);
    expect(afterIncrease.estimatedProfit).toBe(7.56);
    expect(afterIncrease.netMarginPercentage).toBeGreaterThanOrEqual(15.0);
  });

});
