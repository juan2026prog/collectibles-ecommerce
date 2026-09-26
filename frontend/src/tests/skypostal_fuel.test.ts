// frontend/src/tests/skypostal_fuel.test.ts

import { describe, it, expect } from 'vitest';
import { calculateFuelSurcharge } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 2 — Fuel Surcharge Engine (EIA 10 Bands)', () => {
  it('should apply 0.0% neutral adjustment for baseline spot price $2.45', () => {
    const res = calculateFuelSurcharge(100.00, 2.45);
    expect(res.adjustmentPercent).toBe(0.0);
    expect(res.fuelAmountUsd).toBe(0.00);
    expect(res.isNegative).toBe(false);
  });

  it('should apply positive adjustment (+3.0%) for spot price $3.30', () => {
    const res = calculateFuelSurcharge(50.00, 3.30);
    expect(res.adjustmentPercent).toBe(3.0);
    expect(res.fuelAmountUsd).toBe(1.50); // 50 * 0.03 = 1.50
    expect(res.isNegative).toBe(false);
  });

  it('should apply maximum positive cap (+4.0%) for spot prices >= $3.55', () => {
    const res1 = calculateFuelSurcharge(100.00, 3.75);
    expect(res1.adjustmentPercent).toBe(4.0);
    expect(res1.fuelAmountUsd).toBe(4.00);

    const res2 = calculateFuelSurcharge(100.00, 4.20);
    expect(res2.adjustmentPercent).toBe(4.0);
    expect(res2.fuelAmountUsd).toBe(4.00);
  });

  it('should calculate negative fuel adjustment (-2.0%) for spot price $1.20', () => {
    const res = calculateFuelSurcharge(80.00, 1.20);
    expect(res.adjustmentPercent).toBe(-2.0);
    expect(res.fuelAmountUsd).toBe(-1.60); // 80 * -0.02 = -1.60
    expect(res.isNegative).toBe(true);
  });

  it('should apply maximum negative floor (-4.0%) for spot prices < $0.75', () => {
    const res = calculateFuelSurcharge(100.00, 0.50);
    expect(res.adjustmentPercent).toBe(-4.0);
    expect(res.fuelAmountUsd).toBe(-4.00);
  });
});
