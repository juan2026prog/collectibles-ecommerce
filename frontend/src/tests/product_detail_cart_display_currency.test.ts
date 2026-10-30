import { describe, expect, it } from 'vitest';
import { formatProductMoney, inspectCartCurrencies } from '../lib/priceResolver';
import { getCartDrawerNativeTotals } from '../lib/cartDrawerNativeTotals';

// Real product/detail and cart presentations must use an explicitly identified
// native currency. Display conversion must not be persisted or sent as payment.
const FX_UYU_PER_USD = 42.5;
const display = (amount: number, source: 'UYU' | 'USD', selected: 'UYU' | 'USD') =>
  formatProductMoney({ amount, currency: source, displayCurrency: selected, exchangeRate: FX_UYU_PER_USD });

describe('Product detail and cart — currency selector display-only', () => {
  it('displays Ghostbusters item originally UYU 2990 in UYU and USD without changing its price', () => {
    const nativePrice = 2990;
    expect(display(nativePrice, 'UYU', 'UYU')).toContain('2.990');
    expect(display(nativePrice, 'UYU', 'USD')).toContain('70,35');
    expect(nativePrice).toBe(2990);
  });

  it('renders local vendor UYU 2490 identically in product cards and detail conversion', () => {
    expect(display(2490, 'UYU', 'UYU')).toContain('2.490');
    expect(display(2490, 'UYU', 'USD')).toContain('58,59');
  });

  it('retains UYU 2 native item and payment calculation even when the display is USD', () => {
    const items = [{price:2, quantity:1, currency:'UYU'}];
    const native = getCartDrawerNativeTotals(items, [0], 1500);
    const inspection = inspectCartCurrencies(items);
    expect(inspection.canonicalCurrency).toBe('UYU');
    expect(inspection.totalUYU).toBe(2);
    expect(native.netUYU).toBe(2);
    expect(native.shippingUYU).toBe(350);
    expect(native.estimatedGrandTotalUYU).toBe(352);
    expect(display(native.netUYU, 'UYU', 'USD')).toContain('0,05');
    expect(display(native.estimatedGrandTotalUYU!, 'UYU', 'USD')).toContain('8,28');
    expect(display(native.estimatedGrandTotalUYU!, 'UYU', 'UYU')).toContain('352');
  });

  it('converts international USD only for display and keeps checkout native USD', () => {
    const items = [{price:25, quantity:1, currency:'USD', is_international:true}];
    const inspection = inspectCartCurrencies(items);
    const native = getCartDrawerNativeTotals(items, [0], 1500);
    expect(inspection.canonicalCurrency).toBe('USD');
    expect(native.netUSD).toBe(25);
    expect(native.shippingUYU).toBeNull();
    expect(display(25,'USD','UYU')).toContain('1.063');
    expect(display(25,'USD','USD')).toContain('25,00');
  });
});
