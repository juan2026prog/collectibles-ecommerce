import { describe, expect, it } from 'vitest';
import { CurrencyService } from '../services/currencyService';

describe('customer order currency regression', () => {
  it('does not multiply a UYU 75 order by the USD/UYU exchange rate', () => {
    const label = CurrencyService.formatMoney({
      amountUsd: 75,
      sourceCurrency: 'UYU',
      displayCurrency: 'UYU'
    });
    expect(label).toContain('75');
    expect(label).toContain('UYU');
    expect(label).not.toContain('3.188');
    expect(label).not.toContain('3,188');
  });

  it('converts genuine USD order amounts when UYU display is selected', () => {
    const label = CurrencyService.formatMoney({
      amountUsd: 75,
      sourceCurrency: 'USD',
      displayCurrency: 'UYU',
      exchangeRate: 42.5
    });
    expect(label).toContain('UYU');
    expect(label).toMatch(/3[.,]188/);
  });

  it('preserves 75 UYU for the customer invoice and refund preview', () => {
    for (const amount of [75, 75.00]) {
      const label = CurrencyService.formatMoney({
        amountUsd: amount,
        sourceCurrency: 'UYU',
        displayCurrency: 'UYU'
      });
      expect(label).toMatch(/75\s+UYU/);
    }
  });
});
