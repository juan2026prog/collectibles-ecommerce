import { describe, it, expect } from 'vitest';
import { getCanonicalProductStock, resolveProductInventory } from './canonicalStock';

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

  describe('resolveProductInventory for PDP', () => {
    it('resolves stock = 0 correctly with availableQuantity = 0, isAvailable = false', () => {
      const res = resolveProductInventory({
        variants: [{ id: 'v1', inventory_count: 0 }]
      });
      expect(res.availableQuantity).toBe(0);
      expect(res.isAvailable).toBe(false);
      expect(res.source).toBe('variant_inventory_count');
    });

    it('resolves stock = 1 correctly with availableQuantity = 1, isAvailable = true', () => {
      const res = resolveProductInventory({
        variants: [{ id: 'v1', inventory_count: 1 }]
      });
      expect(res.availableQuantity).toBe(1);
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('variant_inventory_count');
    });

    it('resolves selected variant inventory count over primary variant', () => {
      const product = {
        variants: [
          { id: 'v1', inventory_count: 5 },
          { id: 'v2', inventory_count: 3 }
        ]
      };
      const res = resolveProductInventory(product, product.variants[1]);
      expect(res.availableQuantity).toBe(3);
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('variant_inventory_count');
    });

    it('resolves stock >= 10 correctly', () => {
      const res = resolveProductInventory({
        variants: [{ id: 'v1', inventory_count: 10 }]
      });
      expect(res.availableQuantity).toBe(10);
      expect(res.isAvailable).toBe(true);
    });

    it('resolves legacy MercadoLibre items without variants from metadata (initial - sold)', () => {
      const legacyProduct = {
        id: 'legacy-1',
        variants: [],
        metadata: {
          initial_quantity: 18,
          sold_quantity: 16
        }
      };
      const res = resolveProductInventory(legacyProduct);
      expect(res.availableQuantity).toBe(2);
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('legacy_metadata');
    });

    it('resolves international products with provider availability', () => {
      const intlProduct = {
        id: 'intl-1',
        source_provider: 'zinc',
        status: 'published',
        is_active: true,
        availability: 'in_stock'
      };
      const res = resolveProductInventory(intlProduct);
      expect(res.availableQuantity).toBe(10);
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('international_availability');
    });
  });
});

