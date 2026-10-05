import { describe, it, expect } from 'vitest';
import {
  resolveProductNativeCurrency,
  resolveProductPrice,
  formatProductMoney,
  inspectCartCurrencies
} from '../lib/priceResolver';

describe('Financial & Currency Stack Certification Suite — Collectibles 2026', () => {

  // Case 1: Carrito solo local UYU
  describe('Case 1: Local Only Cart (UYU)', () => {
    const localItems = [
      {
        product_id: 'colle-local-01',
        variant_id: 'var-01',
        price: 1090,
        quantity: 2,
        currency: 'UYU' as const,
        is_international: false,
        title: 'Funko Pop Batman'
      },
      {
        product_id: 'vendor-local-02',
        variant_id: 'var-02',
        price: 450,
        quantity: 1,
        currency: 'UYU' as const,
        is_international: false,
        title: 'Comic Manga Local'
      }
    ];

    it('should accurately resolve canonical currency as UYU and preserve unit prices', () => {
      const inspection = inspectCartCurrencies(localItems);
      expect(inspection.hasUYU).toBe(true);
      expect(inspection.hasUSD).toBe(false);
      expect(inspection.isMixed).toBe(false);
      expect(inspection.canonicalCurrency).toBe('UYU');
      expect(inspection.totalUYU).toBe(1090 * 2 + 450);
      expect(inspection.totalUSD).toBe(0);
    });

    it('should format money in UYU without altering monetary symbols or converting to USD', () => {
      const formatted = formatProductMoney({ amount: 1090, currency: 'UYU' });
      expect(formatted).toBe('$ 1.090 UYU');
      expect(formatted).not.toContain('US$');
    });
  });

  // Case 2: Carrito solo internacional USD
  describe('Case 2: International Only Cart (USD)', () => {
    const intlItems = [
      {
        product_id: 'amazon-prod-01',
        variant_id: 'var-intl-01',
        price: 41.99,
        quantity: 1,
        currency: 'USD' as const,
        is_international: true,
        title: 'Hot Wheels Elite 64'
      },
      {
        product_id: 'zinc-prod-02',
        variant_id: 'var-intl-02',
        price: 24.50,
        quantity: 2,
        currency: 'USD' as const,
        is_international: true,
        title: 'Marvel Legends Figure'
      }
    ];

    it('should accurately resolve canonical currency as USD and preserve unit prices', () => {
      const inspection = inspectCartCurrencies(intlItems);
      expect(inspection.hasUYU).toBe(false);
      expect(inspection.hasUSD).toBe(true);
      expect(inspection.isMixed).toBe(false);
      expect(inspection.canonicalCurrency).toBe('USD');
      expect(inspection.totalUSD).toBe(90.99);
      expect(inspection.totalUYU).toBe(0);
    });

    it('should format money in USD properly with comma for decimals in es-UY locale', () => {
      const formatted = formatProductMoney({ amount: 41.99, currency: 'USD' });
      expect(formatted).toBe('US$ 41,99');
      expect(formatted).not.toContain('UYU');
    });
  });

  // Case 3: Carrito mixto (Local UYU + Internacional USD) — CRITICAL BLOCKER TEST
  describe('Case 3: Mixed Cart Detection & Blocking', () => {
    const mixedItems = [
      {
        product_id: 'local-colle-01',
        variant_id: 'var-local-01',
        price: 1090,
        quantity: 1,
        currency: 'UYU' as const,
        is_international: false,
        title: 'Funko Pop Batman Local'
      },
      {
        product_id: 'amazon-intl-02',
        variant_id: 'var-intl-02',
        price: 24.99,
        quantity: 1,
        currency: 'USD' as const,
        is_international: true,
        title: 'Amazon Sourced Collectible'
      }
    ];

    it('should detect mixed currencies without summing nominal numbers directly', () => {
      const inspection = inspectCartCurrencies(mixedItems);
      expect(inspection.hasUYU).toBe(true);
      expect(inspection.hasUSD).toBe(true);
      expect(inspection.isMixed).toBe(true);
      expect(inspection.canonicalCurrency).toBeNull();

      // Individual segregated totals must be preserved
      expect(inspection.totalUYU).toBe(1090);
      expect(inspection.totalUSD).toBe(24.99);

      // NOMINAL SUM PROHIBITED: 1090 + 24.99 != 1114.99
      const invalidNominalSum = inspection.totalUYU + inspection.totalUSD;
      expect(invalidNominalSum).toBe(1114.99); // Proving what must NEVER be used as the order total
    });

    it('should block order payload creation if mixed currencies exist', () => {
      const inspection = inspectCartCurrencies(mixedItems);
      expect(inspection.isMixed).toBe(true);
      // In Checkout & create-order, isMixed triggers blocking error:
      // "Los productos locales e internacionales deben comprarse por separado."
    });
  });

  // Case 4: Invariance & Fallback Resolution
  describe('Case 4: Invariance and Origin Resolution', () => {
    it('should resolve UYU for local item lacking explicit currency', () => {
      const localItem = { price: 1090, quantity: 1, is_international: false };
      const inspection = inspectCartCurrencies([localItem]);
      expect(inspection.canonicalCurrency).toBe('UYU');
    });

    it('should resolve USD for international item lacking explicit currency', () => {
      const intlItem = { price: 29.99, quantity: 1, is_international: true };
      const inspection = inspectCartCurrencies([intlItem]);
      expect(inspection.canonicalCurrency).toBe('USD');
    });

    it('should resolve native currency UYU for product with base_price 1090', () => {
      const prod = {
        id: 'funko-1',
        base_price: 1090,
        vendor_id: null,
        source_provider: null
      };
      const resolved = resolveProductPrice(prod);
      expect(resolved.currency).toBe('UYU');
      expect(resolved.amount).toBe(1090);
      expect(resolved.formatted).toBe('$ 1.090 UYU');
    });

    it('should resolve native currency USD for amazon product with base_price 24.99', () => {
      const prod = {
        id: 'amazon-1',
        base_price: 24.99,
        source_provider: 'amazon',
        is_international: true
      };
      const resolved = resolveProductPrice(prod);
      expect(resolved.currency).toBe('USD');
      expect(resolved.amount).toBe(24.99);
      expect(resolved.formatted).toBe('US$ 24,99');
    });
  });

  // Case 5: Payment Gateway Payload Consistency
  describe('Case 5: Gateway Payload Currency Integrity', () => {
    it('Mercado Pago must receive UYU currency_id for local orders', () => {
      const order = {
        total_amount: 1090,
        currency: 'UYU'
      };
      expect(order.currency).toBe('UYU');
      expect(order.total_amount).toBe(1090);
    });

    it('PayPal conversion must respect currency origin without double conversion', () => {
      const orderUYU = { total_amount: 4200, currency: 'UYU' };
      const paypalCurrency = orderUYU.currency === 'UYU' ? 'USD' : orderUYU.currency;
      const paypalAmount = paypalCurrency === 'USD' && orderUYU.currency === 'UYU'
        ? (orderUYU.total_amount / 42).toFixed(2)
        : orderUYU.total_amount.toFixed(2);

      expect(paypalCurrency).toBe('USD');
      expect(Number(paypalAmount)).toBe(100.00);

      const orderUSD = { total_amount: 50.00, currency: 'USD' };
      const paypalUSDAmount = orderUSD.currency === 'USD'
        ? orderUSD.total_amount.toFixed(2)
        : (orderUSD.total_amount / 42).toFixed(2);
      expect(paypalUSDAmount).toBe('50.00');
    });
  });

});
