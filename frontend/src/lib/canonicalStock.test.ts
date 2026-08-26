import { describe, it, expect } from 'vitest';
import { getCanonicalProductStock } from './canonicalStock';

describe('Canonical Stock Resolver Unit Tests', () => {
  it('1. Resolves stock = 0 when product is null, undefined, or missing variants', () => {
    expect(getCanonicalProductStock(null)).toBe(0);
    expect(getCanonicalProductStock(undefined)).toBe(0);
    expect(getCanonicalProductStock({})).toBe(0);
    expect(getCanonicalProductStock({ variants: [] })).toBe(0);
  });

  it('2. Resolves stock from primary variant inventory_count (stock = 0, stock = 1, stock > 1)', () => {
    expect(getCanonicalProductStock({ variants: [{ inventory_count: 0 }] })).toBe(0);
    expect(getCanonicalProductStock({ variants: [{ inventory_count: 1 }] })).toBe(1);
    expect(getCanonicalProductStock({ variants: [{ inventory_count: 15 }] })).toBe(15);
  });

  it('3. Resolves stock from direct product.stock property if variants are missing', () => {
    expect(getCanonicalProductStock({ stock: 5 })).toBe(5);
    expect(getCanonicalProductStock({ stock: '12' })).toBe(12);
    expect(getCanonicalProductStock({ stock: null })).toBe(0);
  });

  it('4. Handles metadata inventory_count fallback', () => {
    expect(getCanonicalProductStock({ metadata: { inventory_count: 8 } })).toBe(8);
  });
});
