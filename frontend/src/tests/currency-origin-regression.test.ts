import { describe, expect, it } from 'vitest';
import { resolveProductPrice, inspectCartCurrencies, formatProductMoney } from '../lib/priceResolver';
import { CurrencyService } from '../services/currencyService';

describe('native product currency regression', () => {
  it('preserves a local UYU price without multiplying by the dollar rate', () => {
    const local = resolveProductPrice({ base_price: 7500, variants: [], vendor_id: null });
    expect(local.currency).toBe('UYU');
    expect(local.amount).toBe(7500);
    expect(formatProductMoney({ amount: local.amount, currency: local.currency })).toContain('7.500');
    expect(CurrencyService.formatMoney({ amountUsd: 7500, sourceCurrency: 'UYU', displayCurrency: 'UYU', exchangeRate: 42.5 })).toContain('7.500');
  });

  it('preserves international USD prices', () => {
    const international = resolveProductPrice({ base_price: 50, is_international: true, source_provider: 'amazon' });
    expect(international.currency).toBe('USD');
    expect(international.amount).toBe(50);
    expect(CurrencyService.formatMoney({ amountUsd: 50, sourceCurrency: 'USD', displayCurrency: 'UYU', exchangeRate: 42.5 })).toContain('2.125');
  });

  it('converts UYU to USD only when requested', () => {
    expect(formatProductMoney({ amount: 7500, currency: 'UYU', displayCurrency: 'USD', exchangeRate: 40 })).toContain('187,50');
  });

  it('does not combine local UYU and international USD cart totals', () => {
    const mixed = inspectCartCurrencies([
      { price: 1990, quantity: 1, currency: 'UYU' },
      { price: 50, quantity: 1, currency: 'USD', is_international: true }
    ]);
    expect(mixed.isMixed).toBe(true);
    expect(mixed.canonicalCurrency).toBeNull();
    expect(mixed.totalUYU).toBe(1990);
    expect(mixed.totalUSD).toBe(50);
  });

  it('keeps single-currency totals canonical', () => {
    const local = inspectCartCurrencies([{ price: 1990, quantity: 2, currency: 'UYU' }]);
    expect(local.isMixed).toBe(false);
    expect(local.canonicalCurrency).toBe('UYU');
    expect(local.totalUYU).toBe(3980);
  });
});
