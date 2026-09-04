import { describe, it, expect } from 'vitest';
import { 
  getCanonicalProductStock, 
  resolveProductInventory, 
  normalizeInternationalAvailability 
} from './canonicalStock';

describe('Canonical Stock Resolver Unit Tests', () => {
  describe('normalizeInternationalAvailability', () => {
    it('normalizes in_stock and available to AVAILABLE', () => {
      expect(normalizeInternationalAvailability('available')).toBe('AVAILABLE');
      expect(normalizeInternationalAvailability('in_stock')).toBe('AVAILABLE');
      expect(normalizeInternationalAvailability(' AVAILABLE ')).toBe('AVAILABLE');
    });

    it('normalizes out_of_stock, unavailable, discontinued to UNAVAILABLE', () => {
      expect(normalizeInternationalAvailability('out_of_stock')).toBe('UNAVAILABLE');
      expect(normalizeInternationalAvailability('unavailable')).toBe('UNAVAILABLE');
      expect(normalizeInternationalAvailability('discontinued')).toBe('UNAVAILABLE');
    });

    it('normalizes unrecognized strings to UNKNOWN', () => {
      expect(normalizeInternationalAvailability(null)).toBe('UNKNOWN');
      expect(normalizeInternationalAvailability(undefined)).toBe('UNKNOWN');
      expect(normalizeInternationalAvailability('pending_vendor')).toBe('UNKNOWN');
    });
  });

  describe('resolveProductInventory for PDP, Cart & Admin', () => {
    it('1. Local stock = 0: availableQuantity = 0, isAvailable = false', () => {
      const res = resolveProductInventory({
        variants: [{ id: 'v1', inventory_count: 0 }]
      });
      expect(res.availableQuantity).toBe(0);
      expect(res.isAvailable).toBe(false);
      expect(res.source).toBe('variant_inventory_count');
    });

    it('2. Local stock = 1: availableQuantity = 1, isAvailable = true', () => {
      const res = resolveProductInventory({
        variants: [{ id: 'v1', inventory_count: 1 }]
      });
      expect(res.availableQuantity).toBe(1);
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('variant_inventory_count');
    });

    it('3. Local stock = 3: availableQuantity = 3, isAvailable = true', () => {
      const res = resolveProductInventory({
        variants: [{ id: 'v1', inventory_count: 3 }]
      });
      expect(res.availableQuantity).toBe(3);
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('variant_inventory_count');
    });

    it('4. Local stock >= 10: availableQuantity = 10, isAvailable = true', () => {
      const res = resolveProductInventory({
        variants: [{ id: 'v1', inventory_count: 10 }]
      });
      expect(res.availableQuantity).toBe(10);
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('variant_inventory_count');
    });

    it('5. Selected variant override: respects selected variant inventory_count over primary variant', () => {
      const product = {
        variants: [
          { id: 'v1', inventory_count: 5 },
          { id: 'v2', inventory_count: 2 }
        ]
      };
      const res = resolveProductInventory(product, product.variants[1]);
      expect(res.availableQuantity).toBe(2);
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('variant_inventory_count');
    });

    it('6. Legacy metadata: resolves (initial_quantity - sold_quantity) when variants are absent', () => {
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

    it('7. Unknown availability: products with no variants and no valid metadata resolve as unknown without fake stock', () => {
      const orphanProduct = {
        id: 'orphan-1',
        variants: [],
        metadata: {
          logistics: { weight_source: 'ESTIMATED' }
        }
      };
      const res = resolveProductInventory(orphanProduct);
      expect(res.availableQuantity).toBeNull();
      expect(res.isAvailable).toBe(false);
      expect(res.source).toBe('unknown');
    });

    it('8. International available: availableQuantity is null (no synthetic 10), isAvailable is true', () => {
      const intlProduct = {
        id: 'intl-1',
        source_provider: 'zinc',
        status: 'published',
        is_active: true,
        availability: 'available'
      };
      const res = resolveProductInventory(intlProduct);
      expect(res.availableQuantity).toBeNull();
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('international_availability');
    });

    it('9. International out_of_stock: availableQuantity = 0, isAvailable = false', () => {
      const intlProduct = {
        id: 'intl-2',
        source_provider: 'zinc',
        status: 'published',
        is_active: true,
        availability: 'out_of_stock'
      };
      const res = resolveProductInventory(intlProduct);
      expect(res.availableQuantity).toBe(0);
      expect(res.isAvailable).toBe(false);
      expect(res.source).toBe('international_availability');
    });

    it('10. Vendor variant inventory: resolves stock from vendor product variant inventory_count', () => {
      const vendorProduct = {
        id: 'vp-1',
        vendor_id: 'vendor-123',
        variants: [
          { id: 'var-1', inventory_count: 4, name: 'Standard' }
        ]
      };
      const res = resolveProductInventory(vendorProduct);
      expect(res.availableQuantity).toBe(4);
      expect(res.isAvailable).toBe(true);
      expect(res.source).toBe('variant_inventory_count');
    });
  });

  describe('getCanonicalProductStock backward compatibility', () => {
    it('returns 0 when product is missing or unknown', () => {
      expect(getCanonicalProductStock(null)).toBe(0);
      expect(getCanonicalProductStock(undefined)).toBe(0);
      expect(getCanonicalProductStock({})).toBe(0);
    });

    it('returns exact variant count when available', () => {
      expect(getCanonicalProductStock({ variants: [{ inventory_count: 7 }] })).toBe(7);
    });
  });
});
