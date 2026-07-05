import { describe, it, expect } from 'vitest';
import { resolveCartItemPrice } from '../../frontend/src/lib/priceResolver';

describe('resolveCartItemPrice', () => {
  it('should resolve simple product with base_price', () => {
    const product = { base_price: 2990 };
    expect(resolveCartItemPrice(product)).toBe(2990);
  });

  it('should resolve product with price as string "2990"', () => {
    const product = { base_price: '2990' };
    expect(resolveCartItemPrice(product)).toBe(2990);
  });

  it('should resolve product with price_uyu', () => {
    const product = { price_uyu: 1500 };
    expect(resolveCartItemPrice(product)).toBe(1500);
  });

  it('should resolve product with variant.price (variant direct price)', () => {
    const product = { base_price: 1000 };
    const variant = { price: 1200 };
    expect(resolveCartItemPrice(product, variant)).toBe(1200);
  });

  it('should resolve product with variant price_adjustment', () => {
    const product = { base_price: '270.00' };
    const variant = { price_adjustment: '0.00' };
    expect(resolveCartItemPrice(product, variant)).toBe(270);
  });

  it('should resolve product marketplace/vendor with base price + adjustment', () => {
    const product = { base_price: 500 };
    const variant = { price_adjustment: 50 };
    expect(resolveCartItemPrice(product, variant)).toBe(550);
  });

  it('should return 0 for product without price', () => {
    const product = { title: 'Test No Price' };
    expect(resolveCartItemPrice(product)).toBe(0);
  });

  it('should return 0 for negative price', () => {
    const product = { base_price: -50 };
    expect(resolveCartItemPrice(product)).toBe(0);
  });
});
