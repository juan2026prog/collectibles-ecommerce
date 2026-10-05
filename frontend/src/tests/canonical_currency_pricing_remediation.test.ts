import { describe, it, expect } from 'vitest';
import {
  resolveProductNativeCurrency,
  resolveProductPrice,
  formatProductMoney,
} from '../lib/priceResolver';

describe('Canonical Currency & Pricing Remediation', () => {
  // Case A: Producto local de Collectibles
  it('Case A: should resolve native currency UYU for local Collectibles stock with no vendor', () => {
    const product = {
      id: 'local-colle-1',
      title: 'Funko Pop Batman Local',
      base_price: 1090,
      vendor_id: null,
      source_provider: null,
    };

    const currency = resolveProductNativeCurrency(product);
    const resolved = resolveProductPrice(product);

    expect(currency).toBe('UYU');
    expect(resolved.currency).toBe('UYU');
    expect(resolved.basePrice).toBe(1090);
    expect(resolved.isInternational).toBe(false);

    const formatted = formatProductMoney({
      amount: resolved.finalPrice,
      currency: resolved.currency,
    });
    expect(formatted).toBe('$ 1.090 UYU');
    expect(formatted).not.toContain('US$');
  });

  // Case B: Producto de vendor uruguayo
  it('Case B: should resolve native currency UYU for Uruguayan vendor product', () => {
    const product = {
      id: 'vendor-prod-1',
      title: 'Figura Anime Vendor Uy',
      base_price: 2450,
      vendor_id: 'vendor-uy-123',
      source_provider: null,
    };

    const currency = resolveProductNativeCurrency(product);
    const resolved = resolveProductPrice(product);

    expect(currency).toBe('UYU');
    expect(resolved.currency).toBe('UYU');
    expect(resolved.basePrice).toBe(2450);

    const formatted = formatProductMoney({
      amount: resolved.finalPrice,
      currency: resolved.currency,
    });
    expect(formatted).toBe('$ 2.450 UYU');
    expect(formatted).not.toContain('US$');
  });

  // Case C: Producto Amazon importado
  it('Case C: should resolve native currency USD for Amazon international product', () => {
    const product = {
      id: 'amazon-prod-1',
      title: 'Amazon Exclusive Spiderman',
      base_price: 24.99,
      final_price_usd: 24.99,
      source_provider: 'amazon',
      is_international: true,
    };

    const currency = resolveProductNativeCurrency(product);
    const resolved = resolveProductPrice(product);

    expect(currency).toBe('USD');
    expect(resolved.currency).toBe('USD');
    expect(resolved.finalPrice).toBe(24.99);
    expect(resolved.isInternational).toBe(true);

    const formatted = formatProductMoney({
      amount: resolved.finalPrice,
      currency: resolved.currency,
    });
    expect(formatted).toBe('US$ 24,99');
    expect(formatted).not.toContain('UYU');
  });

  // Case D: Producto eBay importado
  it('Case D: should resolve native currency USD for eBay international product', () => {
    const product = {
      id: 'ebay-prod-1',
      title: 'Vintage Star Wars Figure eBay',
      base_price: 42.50,
      final_price_usd: 42.50,
      source_provider: 'ebay',
      is_international: true,
    };

    const currency = resolveProductNativeCurrency(product);
    const resolved = resolveProductPrice(product);

    expect(currency).toBe('USD');
    expect(resolved.currency).toBe('USD');
    expect(resolved.finalPrice).toBe(42.50);

    const formatted = formatProductMoney({
      amount: resolved.finalPrice,
      currency: resolved.currency,
    });
    expect(formatted).toBe('US$ 42,50');
  });

  // Case E: Zinc provider
  it('Case E: should resolve native currency USD for Zinc source provider', () => {
    const product = {
      id: 'zinc-prod-1',
      title: 'Hot Wheels Elite Zinc',
      base_price: 34.99,
      source_provider: 'zinc',
    };

    const currency = resolveProductNativeCurrency(product);
    expect(currency).toBe('USD');
  });

  // Case F: LocalStorage USD resistance (Never turn 1090 UYU into US$ 1090)
  it('Case F: formatting a native UYU product must NEVER render as US$ 1090 without FX conversion', () => {
    const formattedNative = formatProductMoney({
      amount: 1090,
      currency: 'UYU',
      displayCurrency: 'UYU',
    });
    expect(formattedNative).toBe('$ 1.090 UYU');

    // If an explicit conversion to USD is requested with exchangeRate ~42
    const formattedWithConversion = formatProductMoney({
      amount: 1090,
      currency: 'UYU',
      displayCurrency: 'USD',
      exchangeRate: 42,
    });
    // 1090 / 42 = ~25.95 USD
    expect(formattedWithConversion).toBe('US$ 25,95');
    // Must NEVER be US$ 1.090
    expect(formattedWithConversion).not.toContain('1.090');
    expect(formattedWithConversion).not.toContain('1,090');
  });

  // Case G: Variantes locales y variantes internacionales
  it('Case G: variant price adjustments inherit the product native currency', () => {
    // Local variant
    const localProduct = {
      id: 'local-var-1',
      base_price: 1090,
      vendor_id: 'platform',
    };
    const localVariant = {
      id: 'var-1',
      price_adjustment: 200,
    };
    const resolvedLocal = resolveProductPrice(localProduct, localVariant);
    expect(resolvedLocal.currency).toBe('UYU');
    expect(resolvedLocal.finalPrice).toBe(1290);
    expect(formatProductMoney({ amount: resolvedLocal.finalPrice, currency: resolvedLocal.currency })).toBe('$ 1.290 UYU');

    // International variant
    const intlProduct = {
      id: 'intl-var-1',
      base_price: 24.99,
      source_provider: 'amazon',
    };
    const intlVariant = {
      id: 'var-2',
      price_adjustment: 5.00,
    };
    const resolvedIntl = resolveProductPrice(intlProduct, intlVariant);
    expect(resolvedIntl.currency).toBe('USD');
    expect(resolvedIntl.finalPrice).toBe(29.99);
    expect(formatProductMoney({ amount: resolvedIntl.finalPrice, currency: resolvedIntl.currency })).toBe('US$ 29,99');
  });

  // Case H: Coexistencia en listado
  it('Case H: coexistence of UYU and USD in the same catalog catalog list', () => {
    const catalog = [
      { id: '1', title: 'Funko Local', base_price: 1090, vendor_id: null },
      { id: '2', title: 'Amazon Marvel', base_price: 27.99, source_provider: 'amazon' },
      { id: '3', title: 'eBay Vintage', base_price: 42.50, source_provider: 'ebay' },
    ];

    const formattedPrices = catalog.map(p => {
      const res = resolveProductPrice(p);
      return formatProductMoney({ amount: res.finalPrice, currency: res.currency });
    });

    expect(formattedPrices[0]).toBe('$ 1.090 UYU');
    expect(formattedPrices[1]).toBe('US$ 27,99');
    expect(formattedPrices[2]).toBe('US$ 42,50');
  });
});
