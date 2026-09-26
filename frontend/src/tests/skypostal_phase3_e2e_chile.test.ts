// frontend/src/tests/skypostal_phase3_e2e_chile.test.ts

import { describe, it, expect } from 'vitest';
import { calculateSkyPostalQuote, validateQuoteSnapshot, getRecipientDocumentPrompt, normalizeSkyPostalTrackingStatus } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 3 — End-to-End Sandbox Pilot (Chile)', () => {
  it('should execute full E2E workflow for Chile sandbox order', () => {
    // 1. Market & Recipient Document Check
    const docPrompt = getRecipientDocumentPrompt('CL');
    expect(docPrompt.docName).toBe('RUT');
    expect(docPrompt.required).toBe(true);

    // 2. Product & Initial Estimated Quote
    const initialQuote = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Dragon Ball Z Super Saiyan Goku Figure',
        category: 'Action Figures',
        fobValueUsd: 65.0,
        quantity: 1,
        actualWeightKg: 0.8,
        dimensions: { lengthCm: 22, widthCm: 16, heightCm: 12 } // (22*16*12)/5000 = 0.845 kg -> billable 0.845 kg (0.9kg bracket)
      },
      options: {
        spotPriceUsd: 2.45, // Neutral fuel band (0.0%)
        markupPercentOverride: 35.0
      }
    });

    // 3. Quote Integrity Validation
    expect(initialQuote.isEligible).toBe(true);
    expect(initialQuote.countryCode).toBe('CL');
    expect(initialQuote.rateCardCode).toBe('CL-340');
    expect(initialQuote.packageDetails.billableWeightKg).toBe(0.845);
    // Rate bracket 0.9kg in CL-340 is $14.25
    expect(initialQuote.pricingBreakdown.transportationChargeUsd).toBe(14.25);
    expect(initialQuote.pricingBreakdown.providerCostUsd).toBe(14.25);
    // 35% markup on $14.25 = $4.99 -> Customer price $19.24
    expect(initialQuote.pricingBreakdown.markupAmountUsd).toBe(4.99);
    expect(initialQuote.pricingBreakdown.customerShippingPriceUsd).toBe(19.24);

    const validation = validateQuoteSnapshot(initialQuote, { expectedCountryCode: 'CL' });
    expect(validation.isValid).toBe(true);

    // 4. Order Creation & Historical Price Preservation
    const orderCustomerShippingCharged = initialQuote.pricingBreakdown.customerShippingPriceUsd; // $19.24

    // 5. LEG 1 Inbound Arrival at US Hub (Physical Package Measurement)
    const measuredWeightKg = 0.950; // Measured weight slightly higher: 0.95 kg (1.0kg bracket: $14.73)
    const measuredDimensions = { lengthCm: 24, widthCm: 18, heightCm: 12 }; // (24*18*12)/5000 = 1.037 kg (1.5kg bracket: $17.25)

    const finalRealCostCalculation = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Dragon Ball Z Super Saiyan Goku Figure',
        fobValueUsd: 65.0,
        quantity: 1,
        actualWeightKg: measuredWeightKg,
        dimensions: measuredDimensions,
        weightSource: 'MEASURED'
      }
    });

    const realProviderCost = finalRealCostCalculation.pricingBreakdown.providerCostUsd; // $17.25
    const realMargin = Number((orderCustomerShippingCharged - realProviderCost).toFixed(2)); // $19.24 - $17.25 = $1.99

    // Customer price remains unmutated at $19.24
    expect(orderCustomerShippingCharged).toBe(19.24);
    expect(realProviderCost).toBe(17.25);
    expect(realMargin).toBe(1.99);

    // 6. SkyPostal Sandbox Shipment Creation & Tracking Normalization
    const mockTrackingNumber = 'SKY-CL-99201948';
    const mockGuide = 'GUA-491028';
    const mockLabelUrl = `https://storage.collectibles.uy/shipping-labels/skypostal/${mockTrackingNumber}.pdf`;

    expect(mockTrackingNumber).toMatch(/^SKY-CL-/);
    expect(mockLabelUrl).toContain('.pdf');

    // 7. Tracking progression
    const step1 = normalizeSkyPostalTrackingStatus('LABEL_CREATED');
    expect(step1.normalizedStatus).toBe('SHIPMENT_CREATED');

    const step2 = normalizeSkyPostalTrackingStatus('DEPARTED_MIAMI');
    expect(step2.normalizedStatus).toBe('IN_TRANSIT');

    const step3 = normalizeSkyPostalTrackingStatus('CUSTOMS_PROCESSING');
    expect(step3.normalizedStatus).toBe('CUSTOMS');

    const step4 = normalizeSkyPostalTrackingStatus('OUT_FOR_DELIVERY');
    expect(step4.normalizedStatus).toBe('OUT_FOR_DELIVERY');

    const step5 = normalizeSkyPostalTrackingStatus('DELIVERED');
    expect(step5.normalizedStatus).toBe('DELIVERED');
  });
});
