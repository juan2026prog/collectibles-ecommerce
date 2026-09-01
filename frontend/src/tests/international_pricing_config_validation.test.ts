import { describe, it, expect } from 'vitest';
import {
  validateInternationalPricingConfig,
  assertValidInternationalPricingConfig,
  calculateInternationalPricing
} from '../lib/internationalPricing';

describe('INTERNATIONAL PRICING CONFIG VALIDATION — TEST SUITE', () => {

  const validBaseConfig = {
    zinc_fee_usd: 1.00,
    financial_fee_percent: 2.50,
    financial_fee_fixed_usd: 0.50,
    financial_fee_tax_rate: 0.22,
    florida_sales_tax_percent: 0.00,
    min_profit_usd: 3.99,
    min_absolute_profit_usd: 3.99,
    target_margin_percent: 15.00,
    fixed_markup_usd: 6.00
  };

  it('TEST A: target_margin_percent = 15 is VALID and passes', () => {
    const res = validateInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: 15 });
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
    expect(() => assertValidInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: 15 })).not.toThrow();
  });

  it('TEST B: target_margin_percent = 0 is VALID (disables percentage protection, floor holds)', () => {
    const res = validateInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: 0 });
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
    expect(() => assertValidInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: 0 })).not.toThrow();
  });

  it('TEST C: target_margin_percent = -5 is REJECTED', () => {
    const res = validateInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: -5 });
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('margen objetivo'))).toBe(true);
    expect(() => assertValidInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: -5 }))
      .toThrowError(/INTERNATIONAL_PRICING_CONFIG_INVALID/);
  });

  it('TEST D: target_margin_percent = 100 is REJECTED', () => {
    const res = validateInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: 100 });
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('margen objetivo'))).toBe(true);
    expect(() => assertValidInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: 100 }))
      .toThrowError(/INTERNATIONAL_PRICING_CONFIG_INVALID/);
  });

  it('TEST E: target_margin_percent = 120 is REJECTED', () => {
    const res = validateInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: 120 });
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('margen objetivo'))).toBe(true);
    expect(() => assertValidInternationalPricingConfig({ ...validBaseConfig, target_margin_percent: 120 }))
      .toThrowError(/INTERNATIONAL_PRICING_CONFIG_INVALID/);
  });

  it('TEST F: zinc_fee_usd = -1 is REJECTED', () => {
    const res = validateInternationalPricingConfig({ ...validBaseConfig, zinc_fee_usd: -1 });
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('Zinc'))).toBe(true);
    expect(() => assertValidInternationalPricingConfig({ ...validBaseConfig, zinc_fee_usd: -1 }))
      .toThrowError(/INTERNATIONAL_PRICING_CONFIG_INVALID/);
  });

  it('TEST G: financial_fee_fixed_usd = -0.50 is REJECTED', () => {
    const res = validateInternationalPricingConfig({ ...validBaseConfig, financial_fee_fixed_usd: -0.50 });
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('fee fijo financiero'))).toBe(true);
    expect(() => assertValidInternationalPricingConfig({ ...validBaseConfig, financial_fee_fixed_usd: -0.50 }))
      .toThrowError(/INTERNATIONAL_PRICING_CONFIG_INVALID/);
  });

  it('TEST H: min_absolute_profit_usd = -3 is REJECTED', () => {
    const res = validateInternationalPricingConfig({ ...validBaseConfig, min_absolute_profit_usd: -3 });
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('ganancia mínima'))).toBe(true);
    expect(() => assertValidInternationalPricingConfig({ ...validBaseConfig, min_absolute_profit_usd: -3 }))
      .toThrowError(/INTERNATIONAL_PRICING_CONFIG_INVALID/);
  });

  it('TEST I: financial_fee_tax_rate >= 1 is REJECTED', () => {
    const res = validateInternationalPricingConfig({ ...validBaseConfig, financial_fee_tax_rate: 1.22 });
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes('impuesto financiero'))).toBe(true);
    expect(() => assertValidInternationalPricingConfig({ ...validBaseConfig, financial_fee_tax_rate: 1.22 }))
      .toThrowError(/INTERNATIONAL_PRICING_CONFIG_INVALID/);
  });

  it('TEST J: Valid configuration computes canonical prices accurately', () => {
    assertValidInternationalPricingConfig(validBaseConfig);
    const pricing = calculateInternationalPricing({ amazonPrice: 34.99, usaShipping: 0 }, validBaseConfig);
    expect(pricing.realCost).toBe(37.67);
    expect(pricing.finalPrice).toBe(44.32);
    expect(pricing.estimatedProfit).toBe(6.65);
    expect(pricing.pricingProtectionReason).toBe('target_margin');
  });

});
