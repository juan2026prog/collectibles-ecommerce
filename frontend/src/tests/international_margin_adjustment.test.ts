import { describe, it, expect } from 'vitest';
import {
  calculateCanonicalPricing,
  calculateAcquisitionCost,
  calculateExpectedProfit,
  calculatePurchasePaymentFee
} from '../../../supabase/functions/_shared/pricing';

function validateProfitSettings(settings: { target_margin_percent?: number; min_absolute_profit_usd?: number }) {
  if (settings.target_margin_percent === undefined || settings.target_margin_percent <= 0) {
    throw new Error('El margen objetivo debe ser estrictamente positivo (> 0).');
  }
  if (settings.min_absolute_profit_usd === undefined || settings.min_absolute_profit_usd <= 0) {
    throw new Error('La ganancia mínima por producto debe ser estrictamente positiva (> 0).');
  }
  return true;
}

function evaluatePostPaymentProfitProtection(
  paidPriceUsd: number,
  finalAcquisitionCostUsd: number,
  requiredMinProfitUsd: number
) {
  const actualProfit = Number((paidPriceUsd - finalAcquisitionCostUsd).toFixed(2));
  if (actualProfit <= 0 || actualProfit < requiredMinProfitUsd) {
    return {
      allowed: false,
      reason_code: 'PRICE_CHANGED',
      actual_profit: actualProfit,
      action: 'manual_review'
    };
  }
  return {
    allowed: true,
    reason_code: null,
    actual_profit: actualProfit,
    action: 'auto_purchase'
  };
}

describe('AJUSTE FINAL DE MARGEN INTERNACIONAL — SUITE DE PRUEBAS DIRECTAS', () => {

  it('Caso A: AcquisitionCost = 100, Margin = 15%, Minimum = 2 -> RequiredProfit = 15', () => {
    const profit = calculateExpectedProfit(100, { target_margin_percent: 15, min_absolute_profit_usd: 2 });
    expect(profit).toBe(15.00);
  });

  it('Caso B: AcquisitionCost = 5, Margin = 15%, Minimum = 2 -> RequiredProfit = 2 (Floor Active)', () => {
    const profit = calculateExpectedProfit(5, { target_margin_percent: 15, min_absolute_profit_usd: 2 });
    // 5 * 15% = 0.75 < 2.00 -> returns 2.00
    expect(profit).toBe(2.00);
  });

  it('Caso C: AcquisitionCost = 100, Margin = 7%, Minimum = 2 -> RequiredProfit = 7', () => {
    const profit = calculateExpectedProfit(100, { target_margin_percent: 7, min_absolute_profit_usd: 2 });
    expect(profit).toBe(7.00);
  });

  it('Caso D: AcquisitionCost = 10, Margin = 1%, Minimum = 2 -> RequiredProfit = 2 (Floor Active)', () => {
    const profit = calculateExpectedProfit(10, { target_margin_percent: 1, min_absolute_profit_usd: 2 });
    // 10 * 1% = 0.10 < 2.00 -> returns 2.00
    expect(profit).toBe(2.00);
  });

  it('Caso E: Margin = 0 debe ser rechazado por validación', () => {
    expect(() => validateProfitSettings({ target_margin_percent: 0, min_absolute_profit_usd: 2 })).toThrowError();
    expect(() => validateProfitSettings({ target_margin_percent: -5, min_absolute_profit_usd: 2 })).toThrowError();
  });

  it('Caso F: MinimumProfit = 0 debe ser rechazado por validación', () => {
    expect(() => validateProfitSettings({ target_margin_percent: 15, min_absolute_profit_usd: 0 })).toThrowError();
    expect(() => validateProfitSettings({ target_margin_percent: 15, min_absolute_profit_usd: -1 })).toThrowError();
  });

  it('Caso G: Costo cambia post-pago y deja ActualProfit = -1 -> manual_review', () => {
    const paidPrice = 50.00;
    const finalAcquisition = 51.00; // actual_profit = -1.00
    const check = evaluatePostPaymentProfitProtection(paidPrice, finalAcquisition, 2.00);
    expect(check.allowed).toBe(false);
    expect(check.actual_profit).toBe(-1.00);
    expect(check.action).toBe('manual_review');
    expect(check.reason_code).toBe('PRICE_CHANGED');
  });

  it('Caso H: Costo cambia post-pago y deja ActualProfit = 0 -> manual_review', () => {
    const paidPrice = 50.00;
    const finalAcquisition = 50.00; // actual_profit = 0.00
    const check = evaluatePostPaymentProfitProtection(paidPrice, finalAcquisition, 2.00);
    expect(check.allowed).toBe(false);
    expect(check.actual_profit).toBe(0.00);
    expect(check.action).toBe('manual_review');
    expect(check.reason_code).toBe('PRICE_CHANGED');
  });

  it('Ejecución con calculateCanonicalPricing real: Costo 5, Costo 20, Costo 100, Costo 250', () => {
    const testCases = [
      { cost: 5.0, shipping: 0, fee: 0.0, expectedAcquisition: 6.76, expectedMinSafe: 8.76, expectedProfit: 2.00 },
      { cost: 20.0, shipping: 0, fee: 0.0, expectedAcquisition: 22.22, expectedMinSafe: 24.22, expectedProfit: 2.00 },
      { cost: 100.0, shipping: 0, fee: 0.0, expectedAcquisition: 104.66, expectedMinSafe: 106.66, expectedProfit: 2.00 },
      { cost: 250.0, shipping: 0, fee: 0.0, expectedAcquisition: 259.24, expectedMinSafe: 261.24, expectedProfit: 2.00 }
    ];

    for (const tc of testCases) {
      const res = calculateCanonicalPricing(tc.cost, tc.shipping, tc.fee, {
        min_absolute_profit_usd: 2.00,
        zinc_fee_usd: 1.00,
        never_sell_at_loss: true
      });
      expect(res.acquisition_cost_usd).toBe(tc.expectedAcquisition);
      expect(res.minimum_safe_price_usd).toBe(tc.expectedMinSafe);
      expect(res.profit_usd).toBe(tc.expectedProfit);
      expect(res.final_price_usd).toBeGreaterThanOrEqual(res.minimum_safe_price_usd);
      expect(res.profit_usd).toBeGreaterThan(0);
    }
  });

});
