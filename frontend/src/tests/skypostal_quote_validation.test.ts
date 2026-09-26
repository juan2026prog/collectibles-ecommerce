// frontend/src/tests/skypostal_quote_validation.test.ts

import { describe, it, expect } from 'vitest';
import { calculateSkyPostalQuote, validateQuoteSnapshot } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 3 — Server-Side Quote Validation', () => {
  it('should accept valid and fresh quote snapshots', () => {
    const validQuote = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Action Figure',
        fobValueUsd: 50,
        quantity: 1,
        actualWeightKg: 0.5
      }
    });

    const res = validateQuoteSnapshot(validQuote, { expectedCountryCode: 'CL' });
    expect(res.isValid).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it('should reject expired quote snapshots', () => {
    const expiredQuote = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Action Figure',
        fobValueUsd: 50,
        quantity: 1,
        actualWeightKg: 0.5
      }
    });

    // Artificially expire quote
    expiredQuote.expiresAt = new Date(Date.now() - 1000).toISOString();

    const res = validateQuoteSnapshot(expiredQuote, { expectedCountryCode: 'CL' });
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('expirado');
  });

  it('should reject destination country mismatches', () => {
    const quoteForChile = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Action Figure',
        fobValueUsd: 50,
        quantity: 1,
        actualWeightKg: 0.5
      }
    });

    const res = validateQuoteSnapshot(quoteForChile, { expectedCountryCode: 'PE' });
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('no coincide');
  });

  it('should reject prohibited product quotes', () => {
    const prohibitedQuote = calculateSkyPostalQuote({
      countryCode: 'CL',
      product: {
        title: 'Airsoft Weapon Replica',
        fobValueUsd: 150,
        quantity: 1,
        isWeaponOrReplica: true
      }
    });

    expect(prohibitedQuote.isEligible).toBe(false);
    const res = validateQuoteSnapshot(prohibitedQuote, { expectedCountryCode: 'CL' });
    expect(res.isValid).toBe(false);
  });
});
