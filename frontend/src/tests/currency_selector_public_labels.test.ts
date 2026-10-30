import { describe, expect, it } from 'vitest';
import { PUBLIC_CURRENCY_OPTIONS } from '../components/CurrencySelector';
import { resolveProductNativeCurrency, formatProductMoney } from '../lib/priceResolver';

describe('Public currency selector — presentation only', () => {
  it('uses UYU first and customer-friendly labels (no internal accounting terminology)', () => {
    expect(PUBLIC_CURRENCY_OPTIONS.map((option) => option.code)).toEqual(['UYU', 'USD']);
    expect(PUBLIC_CURRENCY_OPTIONS[0].label).toBe('Pesos uruguayos');
    expect(PUBLIC_CURRENCY_OPTIONS[1].label).toBe('Dólares estadounidenses');
    expect(PUBLIC_CURRENCY_OPTIONS.some((option) => /canónica|local/i.test(option.label))).toBe(false);
  });

  it('does not change the native currency or amount of local vendor and imported items', () => {
    const vendor = { base_price: 2490, vendor_id: 'vendor-id' };
    const imported = { base_price: 25, is_international: true, source_provider: 'amazon' };
    expect(resolveProductNativeCurrency(vendor)).toBe('UYU');
    expect(formatProductMoney({ amount: vendor.base_price, currency: 'UYU' })).toContain('2.490');
    expect(resolveProductNativeCurrency(imported)).toBe('USD');
    expect(formatProductMoney({ amount: imported.base_price, currency: 'USD' })).toContain('25');
  });
});
