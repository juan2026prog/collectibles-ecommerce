// frontend/src/tests/skypostal_package_weight.test.ts

import { describe, it, expect } from 'vitest';
import { calculateDimensionalWeight, calculateBillableWeight } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 2 — Package & Weight Engine', () => {
  describe('Dimensional Weight Formula [L x W x H / 5000]', () => {
    it('should calculate exact volumetric weight with divisor 5000', () => {
      // 20cm x 15cm x 10cm = 3000 / 5000 = 0.600 kg
      const dimWeight = calculateDimensionalWeight({ lengthCm: 20, widthCm: 15, heightCm: 10 }, 5000);
      expect(dimWeight).toBe(0.600);
    });

    it('should calculate higher dimensions accurately', () => {
      // 50cm x 40cm x 30cm = 60,000 / 5000 = 12.000 kg
      const dimWeight = calculateDimensionalWeight({ lengthCm: 50, widthCm: 40, heightCm: 30 }, 5000);
      expect(dimWeight).toBe(12.000);
    });

    it('should handle missing or zero dimensions gracefully', () => {
      expect(calculateDimensionalWeight(undefined)).toBe(0);
      expect(calculateDimensionalWeight({ lengthCm: 0, widthCm: 10, heightCm: 10 })).toBe(0);
    });
  });

  describe('Billable Weight Selection MAX(actual, dimensional)', () => {
    it('should choose actual weight when actual > dimensional', () => {
      // Actual: 2.5 kg, Dim: 20x15x10 (0.6 kg) -> Billable: 2.5 kg
      const res = calculateBillableWeight({
        actualWeightKg: 2.5,
        dimensions: { lengthCm: 20, widthCm: 15, heightCm: 10 },
        weightSource: 'CATALOG'
      });

      expect(res.billableWeightKg).toBe(2.500);
      expect(res.actualWeightKg).toBe(2.500);
      expect(res.dimensionalWeightKg).toBe(0.600);
      expect(res.isDimensional).toBe(false);
      expect(res.weightSource).toBe('CATALOG');
    });

    it('should choose dimensional weight when dimensional > actual', () => {
      // Actual: 0.3 kg, Dim: 40x30x20 (4.8 kg) -> Billable: 4.8 kg
      const res = calculateBillableWeight({
        actualWeightKg: 0.3,
        dimensions: { lengthCm: 40, widthCm: 30, heightCm: 20 },
        weightSource: 'ESTIMATED'
      });

      expect(res.billableWeightKg).toBe(4.800);
      expect(res.actualWeightKg).toBe(0.300);
      expect(res.dimensionalWeightKg).toBe(4.800);
      expect(res.isDimensional).toBe(true);
    });

    it('should enforce minimum billable weight of 0.100 kg', () => {
      const res = calculateBillableWeight({ actualWeightKg: 0.02 });
      expect(res.billableWeightKg).toBe(0.100);
    });
  });
});
