// frontend/src/tests/skypostal_markup_pricing.test.ts

import { describe, it, expect } from 'vitest';
import { calculateSkyPostalQuote } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 2 — Commercial Markup & Pricing Pipeline', () => {
  it('should calculate provider cost and apply default 35% markup on cost', () => {
    // Chile, 1.0 kg -> base rate $14.73, neutral fuel $0.00 -> provider cost $14.73
    // Markup 35% -> $14.73 * 0.35 = $5.16
    // Customer price -> $14.73 + $5.16 = $19.89
    const quote = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Goku Figure',
        fobValueUsd: 50,
        quantity: 1,
        actualWeightKg: 1.0
      },
      options: {
        spotPriceUsd: 2.45,
        markupPercentOverride: 35.0
      }
    });

    expect(quote.isEligible).toBe(true);
    expect(quote.pricingBreakdown.transportationChargeUsd).toBe(14.73);
    expect(quote.pricingBreakdown.fuelAmountUsd).toBe(0.00);
    expect(quote.pricingBreakdown.providerCostUsd).toBe(14.73);
    expect(quote.pricingBreakdown.markupPercent).toBe(35.0);
    expect(quote.pricingBreakdown.markupAmountUsd).toBe(5.16);
    expect(quote.pricingBreakdown.customerShippingPriceUsd).toBe(19.89);
  });

  it('should support customized markup overrides (e.g. 50%)', () => {
    // Provider cost $14.73 with 50% markup -> $14.73 * 0.50 = $7.37 -> customer $22.10
    const quote = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Goku Figure',
        fobValueUsd: 50,
        quantity: 1,
        actualWeightKg: 1.0
      },
      options: {
        spotPriceUsd: 2.45,
        markupPercentOverride: 50.0
      }
    });

    expect(quote.pricingBreakdown.markupAmountUsd).toBe(7.37);
    expect(quote.pricingBreakdown.customerShippingPriceUsd).toBe(22.10);
  });

  it('should correctly incorporate positive and negative fuel surcharges into cost before markup', () => {
    // Base $14.73, Spot $3.30 (+3%) -> Fuel: $0.44 -> Provider Cost: $15.17
    // Markup 35% on $15.17 -> $5.31 -> Customer Price: $20.48
    const quotePositiveFuel = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Goku Figure',
        fobValueUsd: 50,
        quantity: 1,
        actualWeightKg: 1.0
      },
      options: {
        spotPriceUsd: 3.30,
        markupPercentOverride: 35.0
      }
    });

    expect(quotePositiveFuel.pricingBreakdown.fuelAmountUsd).toBe(0.44);
    expect(quotePositiveFuel.pricingBreakdown.providerCostUsd).toBe(15.17);
    expect(quotePositiveFuel.pricingBreakdown.customerShippingPriceUsd).toBe(20.48);
  });
});
