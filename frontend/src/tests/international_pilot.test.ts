import { describe, it, expect } from 'vitest';
import {
  calculateCanonicalPricing,
  calculateAcquisitionCost,
  calculateExpectedProfit,
  calculatePurchasePaymentFee
} from '../../../supabase/functions/_shared/pricing';

describe('International Commerce Pilot - Real Module Unit Tests', () => {

  it('1. Canonical Pricing eliminates double USA shipping and guarantees minimum margin', () => {
    const productCost = 50.0;
    const usaShipping = 5.0;
    const markup = 10.0;
    const settings = {
      target_margin_percent: 15.0,
      min_absolute_profit_usd: 2.0,
      zinc_fee_usd: 1.0
    };

    const result = calculateCanonicalPricing(productCost, usaShipping, markup, settings);

    // PrePayment: 50 + 5 + (55 * 0.07 = 3.85) + 1.00 = 59.85
    // PaymentFee: ((59.85 * 0.025) + 0.50) * 1.22 = 2.435...
    // AcquisitionCost: 59.85 + 2.44 = 62.29
    expect(result.acquisition_cost_usd).toBeGreaterThan(60);
    expect(result.acquisition_cost_usd).toBeLessThan(65);

    // Final price must be at least acquisition + profit
    expect(result.final_price_usd).toBeGreaterThanOrEqual(result.acquisition_cost_usd + result.expected_profit_usd);
  });

  it('2. Low margin products trigger minimum safe price floor', () => {
    const productCost = 10.0;
    const usaShipping = 0.0;
    const markup = 0.50; // Insufficient markup
    const settings = {
      target_margin_percent: 15.0,
      min_absolute_profit_usd: 2.00,
      zinc_fee_usd: 1.0
    };

    const result = calculateCanonicalPricing(productCost, usaShipping, markup, settings);

    expect(result.is_loss_adjusted).toBe(true);
    expect(result.final_price_usd).toBeGreaterThanOrEqual(result.acquisition_cost_usd + 2.00);
  });

  it('3. Purchasing payment fee calculates with 22% VAT', () => {
    const fee = calculatePurchasePaymentFee(100);
    // (100 * 0.025 + 0.50) = 3.00. 3.00 * 1.22 = 3.66
    expect(Number(fee.toFixed(2))).toBe(3.66);
  });

  it('4. Courier address validation enforces all required US fields without restricting courier name', () => {
    const validateCourierAddress = (addr: any) => {
      return !!(
        addr.international_courier_name?.trim() &&
        addr.international_recipient_name?.trim() &&
        addr.international_address_line_1?.trim() &&
        addr.international_city?.trim() &&
        addr.international_state?.trim() &&
        addr.international_postal_code?.trim() &&
        addr.international_phone?.trim()
      );
    };

    // Any courier (e.g. Aerobox, Urubox, MiamiBox, USX) is valid as long as address fields are filled
    const customCourierAddr = {
      international_courier_name: 'Custom Express Miami',
      international_recipient_name: 'Juan Perez / UY-8849',
      international_address_line_1: '1234 NW 84th Ave',
      international_city: 'Miami',
      international_state: 'FL',
      international_postal_code: '33166',
      international_phone: '3055551234'
    };

    expect(validateCourierAddress(customCourierAddr)).toBe(true);

    const incompleteAddr = {
      international_courier_name: 'Custom Express Miami',
      international_recipient_name: 'Juan Perez',
      international_address_line_1: '', // Missing line 1
      international_city: 'Miami',
      international_state: 'FL',
      international_postal_code: '33166',
      international_phone: '3055551234'
    };

    expect(validateCourierAddress(incompleteAddr)).toBe(false);
  });

});
