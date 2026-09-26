// frontend/src/tests/skypostal_rates.test.ts

import { describe, it, expect } from 'vitest';
import { calculateTransportationCharge } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 2 — Authoritative Rate Engine (Contractual Excel)', () => {
  describe('Chile (CL-340)', () => {
    it('should match exact contractual rates for key brackets', () => {
      expect(calculateTransportationCharge('CL', 0.1).transportationChargeUsd).toBe(8.59);
      expect(calculateTransportationCharge('CL', 0.5).transportationChargeUsd).toBe(10.53);
      expect(calculateTransportationCharge('CL', 1.0).transportationChargeUsd).toBe(14.73);
      expect(calculateTransportationCharge('CL', 2.0).transportationChargeUsd).toBe(19.67);
      expect(calculateTransportationCharge('CL', 5.0).transportationChargeUsd).toBe(36.12);
      expect(calculateTransportationCharge('CL', 10.0).transportationChargeUsd).toBe(61.98);
    });

    it('should extrapolate weights above 10.0 kg using additional 500g fee ($3.90)', () => {
      // 11.0 kg -> 10.0 kg ($61.98) + 2 * $3.90 = $69.78
      const res11 = calculateTransportationCharge('CL', 11.0);
      expect(res11.isExtrapolated).toBe(true);
      expect(res11.additionalUnitsCount).toBe(2);
      expect(res11.transportationChargeUsd).toBe(69.78);

      // 12.5 kg -> 10.0 kg ($61.98) + 5 * $3.90 = $81.48
      const res125 = calculateTransportationCharge('CL', 12.5);
      expect(res125.transportationChargeUsd).toBe(81.48);
    });
  });

  describe('Peru (PE-340)', () => {
    it('should match exact contractual rates for Peru', () => {
      expect(calculateTransportationCharge('PE', 0.1).transportationChargeUsd).toBe(11.11);
      expect(calculateTransportationCharge('PE', 0.5).transportationChargeUsd).toBe(12.31);
      expect(calculateTransportationCharge('PE', 1.0).transportationChargeUsd).toBe(13.81);
      expect(calculateTransportationCharge('PE', 10.0).transportationChargeUsd).toBe(47.17);
    });
  });

  describe('Brazil (BR-340)', () => {
    it('should match exact contractual rates for Brazil', () => {
      expect(calculateTransportationCharge('BR', 0.1).transportationChargeUsd).toBe(7.97);
      expect(calculateTransportationCharge('BR', 0.5).transportationChargeUsd).toBe(10.53);
      expect(calculateTransportationCharge('BR', 1.0).transportationChargeUsd).toBe(13.92);
      expect(calculateTransportationCharge('BR', 10.0).transportationChargeUsd).toBe(71.75);
    });
  });

  describe('Colombia (CO-340)', () => {
    it('should match exact contractual rates for Colombia', () => {
      expect(calculateTransportationCharge('CO', 0.1).transportationChargeUsd).toBe(8.21);
      expect(calculateTransportationCharge('CO', 0.5).transportationChargeUsd).toBe(9.07);
      expect(calculateTransportationCharge('CO', 1.0).transportationChargeUsd).toBe(10.74);
      expect(calculateTransportationCharge('CO', 10.0).transportationChargeUsd).toBe(46.89);
    });
  });

  describe('Ecuador (EC-340)', () => {
    it('should match exact contractual rates for Ecuador', () => {
      expect(calculateTransportationCharge('EC', 0.1).transportationChargeUsd).toBe(9.54);
      expect(calculateTransportationCharge('EC', 0.5).transportationChargeUsd).toBe(11.11);
      expect(calculateTransportationCharge('EC', 1.0).transportationChargeUsd).toBe(13.07);
      expect(calculateTransportationCharge('EC', 10.0).transportationChargeUsd).toBe(53.88);
    });
  });

  describe('Mexico Standard (MX-340) vs Regulated (MX-340-R)', () => {
    it('should route standard to MX-340 and regulated to MX-340-R', () => {
      const std = calculateTransportationCharge('MX', 1.0, { tariffCategory: 'STANDARD' });
      expect(std.rateCardCode).toBe('MX-340');
      expect(std.transportationChargeUsd).toBe(11.09);

      const reg = calculateTransportationCharge('MX', 1.0, { tariffCategory: 'REGULATED' });
      expect(reg.rateCardCode).toBe('MX-340-R');
      expect(reg.transportationChargeUsd).toBe(14.95);
    });
  });
});
