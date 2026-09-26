// frontend/src/tests/skypostal_cost_variance.test.ts

import { describe, it, expect } from 'vitest';
import { calculateSkyPostalQuote, calculateFuelSurcharge } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 3 — Financial Precision & Cost Variance', () => {
  it('should preserve historic customer charge while updating real provider cost and margin', () => {
    // 1. Initial quote at checkout (Estimated 0.5kg in Chile CL-340: $10.53 + 35% markup = $14.22)
    const initialQuote = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Action Figure',
        fobValueUsd: 40,
        quantity: 1,
        actualWeightKg: 0.5
      }
    });

    const customerCharged = initialQuote.pricingBreakdown.customerShippingPriceUsd; // $14.22
    const estimatedCost = initialQuote.pricingBreakdown.providerCostUsd; // $10.53
    const estimatedMargin = initialQuote.pricingBreakdown.markupAmountUsd; // $3.69

    expect(customerCharged).toBe(14.22);
    expect(estimatedCost).toBe(10.53);
    expect(estimatedMargin).toBe(3.69);

    // 2. Physical reception at US Hub with higher measured weight (0.8 kg -> $13.76 base rate)
    const measuredQuote = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Action Figure',
        fobValueUsd: 40,
        quantity: 1,
        actualWeightKg: 0.8,
        weightSource: 'MEASURED'
      }
    });

    const realCost = measuredQuote.pricingBreakdown.providerCostUsd; // $13.76
    const realMargin = Number((customerCharged - realCost).toFixed(2)); // $14.22 - $13.76 = $0.46

    // Historical customer charge is invariant
    expect(customerCharged).toBe(14.22);
    expect(realCost).toBe(13.76);
    expect(realMargin).toBe(0.46);
  });

  it('should audit estimated fuel vs final fuel at manifest date', () => {
    // Estimated fuel at checkout (Spot $2.45 -> 0.0%)
    const estFuel = calculateFuelSurcharge(100.00, 2.45);
    expect(estFuel.adjustmentPercent).toBe(0.0);
    expect(estFuel.fuelAmountUsd).toBe(0.00);

    // Final fuel at dispatch/manifest date (Spot increased to $3.30 -> +3.0%)
    const finalFuel = calculateFuelSurcharge(100.00, 3.30);
    expect(finalFuel.adjustmentPercent).toBe(3.0);
    expect(finalFuel.fuelAmountUsd).toBe(3.00);
  });
});
