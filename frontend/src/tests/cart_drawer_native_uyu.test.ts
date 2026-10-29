import { describe, expect, it } from 'vitest';
import { getCartDrawerNativeTotals } from '../lib/cartDrawerNativeTotals';
import { formatProductMoney } from '../lib/priceResolver';

describe('Cart drawer: native currency regression — UYU must never be treated as USD', () => {
  it('does not multiply UYU $2 by FX 42.5 in local totals or promotions', () => {
    const summary = getCartDrawerNativeTotals([
      { price: 2, quantity: 1, currency: 'UYU' },
    ], [0], 1500);
    expect(summary.netUYU).toBe(2);
    expect(summary.shippingUYU).toBe(350);
    expect(summary.estimatedGrandTotalUYU).toBe(352);
    expect(summary.freeShippingRemainingUYU).toBe(1498);
    expect(formatProductMoney({ amount: summary.estimatedGrandTotalUYU!, currency: 'UYU' })).toContain('352');
    expect(formatProductMoney({ amount: 1500, currency: 'UYU' })).toContain('1.500');
  });

  it('preserves ordinary local vendor checkout amounts', () => {
    const summary = getCartDrawerNativeTotals([
      { price: 1090, quantity: 2, currency: 'UYU' },
    ], [0], 1500);
    expect(summary.shippingUYU).toBe(0);
    expect(summary.estimatedGrandTotalUYU).toBe(2180);
  });

  it('treats international USD as a separate currency, never adding a UYU 350 to USD', () => {
    const summary = getCartDrawerNativeTotals([
      { price: 25, quantity: 1, currency: 'USD', is_international: true },
    ], [0], 1500);
    expect(summary.netUSD).toBe(25);
    expect(summary.shippingUYU).toBeNull();
    expect(summary.estimatedGrandTotalUYU).toBeNull();
  });

  it('does not combine UYU and USD, or show misleading UYU shipping', () => {
    const summary = getCartDrawerNativeTotals([
      { price: 2, quantity: 1, currency: 'UYU' },
      { price: 25, quantity: 1, currency: 'USD', is_international: true },
    ], [0, 0], 1500);
    expect(summary.isMixed).toBe(true);
    expect(summary.netUYU).toBe(2);
    expect(summary.netUSD).toBe(25);
    expect(summary.shippingUYU).toBeNull();
  });

  it('applies local promotions in UYU and keeps amount positive', () => {
    const summary = getCartDrawerNativeTotals([
      { price: 1000, quantity: 1, currency: 'UYU' },
    ], [200], 1500);
    expect(summary.netUYU).toBe(800);
    expect(summary.discountUYU).toBe(200);
    expect(summary.freeShippingRemainingUYU).toBe(700);
    expect(summary.estimatedGrandTotalUYU).toBe(1150);
  });
});
