import { describe, it, expect } from 'vitest';
import { calculateInternationalPricing as backendPricing } from '../../../supabase/functions/_shared/pricing';
import { calculateInternationalPricing as frontendPricing } from '../lib/internationalPricing';

describe('INTERNATIONAL PRICING ENGINE — BACKEND / FRONTEND STRICT PARITY SUITE', () => {

  const testConfigs = [
    {
      name: 'Default Production Config (15% Margin, $3.99 floor, $6.00 fee)',
      config: {
        zinc_fee_usd: 1.00,
        financial_fee_percent: 2.50,
        financial_fee_fixed_usd: 0.50,
        financial_fee_tax_rate: 0.22,
        min_profit_usd: 3.99,
        target_margin_percent: 15.00,
        fixed_markup_usd: 6.00
      }
    },
    {
      name: 'Zinc Surge to $4.00',
      config: {
        zinc_fee_usd: 4.00,
        financial_fee_percent: 2.50,
        financial_fee_fixed_usd: 0.50,
        financial_fee_tax_rate: 0.22,
        min_profit_usd: 3.99,
        target_margin_percent: 15.00,
        fixed_markup_usd: 6.00
      }
    },
    {
      name: 'Margin 0% (Absolute Profit Floor Only)',
      config: {
        zinc_fee_usd: 1.00,
        financial_fee_percent: 2.50,
        financial_fee_fixed_usd: 0.50,
        financial_fee_tax_rate: 0.22,
        min_profit_usd: 3.99,
        target_margin_percent: 0.00,
        fixed_markup_usd: 6.00
      }
    },
    {
      name: 'High Commercial Markup ($25.00)',
      config: {
        zinc_fee_usd: 1.00,
        financial_fee_percent: 2.50,
        financial_fee_fixed_usd: 0.50,
        financial_fee_tax_rate: 0.22,
        min_profit_usd: 3.99,
        target_margin_percent: 15.00,
        fixed_markup_usd: 25.00
      }
    }
  ];

  const testInputs = [
    { amazonPrice: 12.99, usaShipping: 0 },
    { amazonPrice: 34.99, usaShipping: 0 },
    { amazonPrice: 34.99, usaShipping: 5.50 },
    { amazonPrice: 34.99, usaShipping: 0, salesTax: 2.45 },
    { amazonPrice: 89.00, usaShipping: 0 },
    { amazonPrice: 150.00, usaShipping: 12.00 },
    { amazonPrice: 350.00, usaShipping: 0 }
  ];

  for (const tc of testConfigs) {
    describe(`Parity Group: ${tc.name}`, () => {
      for (const input of testInputs) {
        it(`Amazon Price: $${input.amazonPrice}, Shipping: $${input.usaShipping || 0}, Tax: $${input.salesTax || 0}`, () => {
          const backend = backendPricing(input, tc.config);
          const frontend = frontendPricing(input, tc.config);

          // 1. Real Cost
          expect(frontend.realCost).toBe(backend.realCost);
          // 2. Financial Fees
          expect(frontend.financialFeeTotal).toBe(backend.financialFeeTotal);
          expect(frontend.salesTax).toBe(backend.salesTax);
          // 3. Protected Prices
          expect(frontend.absoluteProtectedPrice).toBe(backend.absoluteProtectedPrice);
          expect(frontend.marginProtectedPrice).toBe(backend.marginProtectedPrice);
          expect(frontend.commercialPrice).toBe(backend.commercialPrice);
          expect(frontend.profitProtectedPrice).toBe(backend.profitProtectedPrice);
          // 4. Final Output Metrics
          expect(frontend.finalPrice).toBe(backend.finalPrice);
          expect(frontend.appliedFee).toBe(backend.appliedFee);
          expect(frontend.estimatedProfit).toBe(backend.estimatedProfit);
          expect(frontend.netMarginPercentage).toBe(backend.netMarginPercentage);
          // 5. Trigger and Reason
          expect(frontend.profitProtectionTriggered).toBe(backend.profitProtectionTriggered);
          expect(frontend.pricingProtectionReason).toBe(backend.pricingProtectionReason);
        });
      }
    });
  }

});
