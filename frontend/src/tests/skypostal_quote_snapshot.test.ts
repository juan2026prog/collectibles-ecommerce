// frontend/src/tests/skypostal_quote_snapshot.test.ts

import { describe, it, expect } from 'vitest';
import { calculateSkyPostalQuote } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 2 — Quote Snapshot Generation & Invariance', () => {
  it('should generate an immutable quote snapshot with TTL and breakdown', () => {
    const input = {
      countryCode: 'CL',
      product: {
        title: 'Saint Seiya Myth Cloth EX',
        fobValueUsd: 140,
        quantity: 1,
        actualWeightKg: 1.2,
        dimensions: { lengthCm: 25, widthCm: 20, heightCm: 15 } // Dim wt: (25*20*15)/5000 = 1.500 kg
      },
      options: {
        orderId: 'ORD-9988',
        suborderId: 'SUB-1',
        quoteTtlSeconds: 86400
      }
    };

    const snapshot = calculateSkyPostalQuote(input);

    expect(snapshot.quoteId).toMatch(/^SPQ-/);
    expect(snapshot.orderId).toBe('ORD-9988');
    expect(snapshot.suborderId).toBe('SUB-1');
    expect(snapshot.countryCode).toBe('CL');
    expect(snapshot.provider).toBe('skypostal');
    expect(snapshot.rateCardCode).toBe('CL-340');

    // Dimensional check: actual 1.2 vs dim 1.5 -> billable 1.5
    expect(snapshot.packageDetails.actualWeightKg).toBe(1.200);
    expect(snapshot.packageDetails.dimensionalWeightKg).toBe(1.500);
    expect(snapshot.packageDetails.billableWeightKg).toBe(1.500);
    expect(snapshot.packageDetails.isDimensional).toBe(true);

    // Rate for 1.5 kg in CL-340 is $17.25
    expect(snapshot.pricingBreakdown.transportationChargeUsd).toBe(17.25);

    // Snapshot TTL: expiresAt should be approx 24 hours from createdAt
    const createdTime = new Date(snapshot.createdAt).getTime();
    const expireTime = new Date(snapshot.expiresAt).getTime();
    const diffSeconds = Math.round((expireTime - createdTime) / 1000);
    expect(diffSeconds).toBe(86400);
  });
});
