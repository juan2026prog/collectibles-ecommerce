// frontend/src/tests/skypostal_tracking_normalizer.test.ts

import { describe, it, expect } from 'vitest';
import { normalizeSkyPostalTrackingStatus } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 3 — Tracking Normalizer & Action Alerts', () => {
  it('should normalize standard happy-path lifecycle events', () => {
    expect(normalizeSkyPostalTrackingStatus('CREATED').normalizedStatus).toBe('SHIPMENT_CREATED');
    expect(normalizeSkyPostalTrackingStatus('MANIFESTED').normalizedStatus).toBe('MANIFESTED');
    expect(normalizeSkyPostalTrackingStatus('IN_TRANSIT').normalizedStatus).toBe('IN_TRANSIT');
    expect(normalizeSkyPostalTrackingStatus('CUSTOMS_PROCESSING').normalizedStatus).toBe('CUSTOMS');
    expect(normalizeSkyPostalTrackingStatus('OUT_FOR_DELIVERY').normalizedStatus).toBe('OUT_FOR_DELIVERY');
    expect(normalizeSkyPostalTrackingStatus('DELIVERED').normalizedStatus).toBe('DELIVERED');
  });

  it('should trigger DOCUMENT_REQUIRED action when missing national tax ID', () => {
    const res = normalizeSkyPostalTrackingStatus('RUT_REQUIRED');
    expect(res.normalizedStatus).toBe('EXCEPTION');
    expect(res.actionRequired).toBe('DOCUMENT_REQUIRED');
    expect(res.description).toMatch(/documento de identidad/i);
  });

  it('should trigger CUSTOMS_INFORMATION_REQUIRED action when customs requests invoice/info', () => {
    const res = normalizeSkyPostalTrackingStatus('CUSTOMS_HOLD');
    expect(res.normalizedStatus).toBe('EXCEPTION');
    expect(res.actionRequired).toBe('CUSTOMS_INFORMATION_REQUIRED');
  });
});
