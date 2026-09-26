import { describe, it, expect } from 'vitest';
import { calculateFinancialMetrics } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 4 - Financial Control & Margin Engine', () => {
  it('correctly calculates financial metrics distinguishing Markup from Margin', () => {
    // Example: Product shipped to Chile
    // Estimated SkyPostal Total Cost = $20.00
    // Estimated Customer Shipping Price = $27.00 (with 35% markup on cost)
    const metrics = calculateFinancialMetrics({
      providerCostEstimated: 20.0,
      customerShippingCharged: 27.0,
      providerCostReal: 21.0
    });

    // Estimated:
    // Profit = $7.00
    // Real: Cost actual was $21.00 instead of $20.00
    // Real Profit = $6.00
    // Real Markup = (6.00 / 21.00) * 100 = 28.57%
    // Real Margin = (6.00 / 27.00) * 100 = 22.22%
    expect(metrics.grossProfitEstimatedUsd).toBe(7.0);
    expect(metrics.grossProfitRealUsd).toBe(6.0);
    expect(metrics.effectiveMarkupPercent).toBe(28.57);
    expect(metrics.effectiveMarginPercent).toBe(22.22);

    // Variance:
    // Cost variance = 21.0 - 20.0 = +1.00 (cost went up)
    // Profit variance = 6.0 - 7.0 = -1.00 (profit went down)
    expect(metrics.costVarianceUsd).toBe(1.0);
    expect(metrics.profitVarianceUsd).toBe(-1.0);
    expect(metrics.isNegativeProfit).toBe(false);
  });

  it('triggers negative profit alert when real cost exceeds customer price', () => {
    // Incurred higher weight surcharge or penalty
    const metrics = calculateFinancialMetrics({
      providerCostEstimated: 20.0,
      customerShippingCharged: 27.0,
      providerCostReal: 30.0
    });

    expect(metrics.grossProfitRealUsd).toBe(-3.0);
    expect(metrics.isNegativeProfit).toBe(true);
    expect(metrics.profitVarianceUsd).toBe(-10.0);
    expect(metrics.effectiveMarginPercent).toBe(-11.11);
    expect(metrics.alertReason).toContain('Alerta Financiera: Margen negativo');
  });

  it('handles default metrics when real cost is not yet available (in-flight quote)', () => {
    const metrics = calculateFinancialMetrics({
      providerCostReal: 15.0,
      customerShippingCharged: 20.25
    });

    expect(metrics.grossProfitEstimatedUsd).toBe(5.25);
    expect(metrics.grossProfitRealUsd).toBe(5.25);
    expect(metrics.effectiveMarkupPercent).toBe(35.0);
    expect(metrics.effectiveMarginPercent).toBe(25.93);
    expect(metrics.costVarianceUsd).toBe(0);
    expect(metrics.profitVarianceUsd).toBe(0);
    expect(metrics.isNegativeProfit).toBe(false);
  });
});
