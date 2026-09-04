/**
 * Canonical Stock Resolver for Collectibles Platform
 * Single source of truth for resolving product stock and availability across:
 * - Storefront PDP & Mobile UX
 * - Cart & Checkout
 * - Admin Products UI & Buy Box
 * - Export XLSX/CSV
 * - Import Preview & Sync
 */

export type InventorySource =
  | 'variant_inventory_count'
  | 'legacy_metadata'
  | 'international_availability'
  | 'unavailable'
  | 'unknown';

export interface ProductInventoryResolution {
  availableQuantity: number | null;
  isAvailable: boolean;
  source: InventorySource;
}

/**
 * Normalizes international product availability into authoritative categories.
 * Never invents availability.
 */
export function normalizeInternationalAvailability(rawAvailability?: string | null): 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN' {
  if (!rawAvailability) return 'UNKNOWN';
  const val = String(rawAvailability).trim().toLowerCase();
  if (val === 'available' || val === 'in_stock') {
    return 'AVAILABLE';
  }
  if (val === 'out_of_stock' || val === 'unavailable' || val === 'discontinued') {
    return 'UNAVAILABLE';
  }
  return 'UNKNOWN';
}

/**
 * Authoritative Inventory Resolver for Storefront PDP, Cart, Catalog & Admin.
 * Resolves available stock and availability status without inventing stock.
 * Prohibits synthetic quantities (10, 99, 999, Infinity).
 */
export function resolveProductInventory(product: any, selectedVariant?: any): ProductInventoryResolution {
  if (!product) {
    return { availableQuantity: null, isAvailable: false, source: 'unavailable' };
  }

  // 1. Explicitly selected variant inventory_count (authoritative primary source)
  if (selectedVariant && selectedVariant.inventory_count !== undefined && selectedVariant.inventory_count !== null && selectedVariant.inventory_count !== '') {
    const rawVal = Number(selectedVariant.inventory_count);
    if (!isNaN(rawVal)) {
      const stock = Math.max(0, Math.floor(rawVal));
      return {
        availableQuantity: stock,
        isAvailable: stock > 0,
        source: 'variant_inventory_count'
      };
    }
  }

  // 2. Primary variant if product has variants array/object
  const variants = product.variants || product.product_variants;
  if (Array.isArray(variants) && variants.length > 0) {
    const primaryVar = variants.find((v: any) => v && v.is_active !== false) || variants[0];
    if (primaryVar && primaryVar.inventory_count !== undefined && primaryVar.inventory_count !== null && primaryVar.inventory_count !== '') {
      const rawVal = Number(primaryVar.inventory_count);
      if (!isNaN(rawVal)) {
        const stock = Math.max(0, Math.floor(rawVal));
        return {
          availableQuantity: stock,
          isAvailable: stock > 0,
          source: 'variant_inventory_count'
        };
      }
    }
  }

  // 3. International / Zinc on-demand products
  const isIntl = product.source_provider === 'zinc' || Boolean(product.is_international) || product.shipping_type === 'international_courier_direct';
  if (isIntl) {
    const isPublished = product.status === 'published';
    const isActive = product.is_active !== false;
    const rawAvail = product.availability || product.raw_international_data?.availability;
    const normalizedAvail = normalizeInternationalAvailability(rawAvail);

    if (isPublished && isActive && normalizedAvail === 'AVAILABLE') {
      // Product is available, but physical inventory quantity is unknown.
      // Policy: availableQuantity = null (no synthetic 10). Purchase limit of 1 enforced in UI.
      return {
        availableQuantity: null,
        isAvailable: true,
        source: 'international_availability'
      };
    } else if (normalizedAvail === 'UNAVAILABLE' || !isPublished || !isActive) {
      return {
        availableQuantity: 0,
        isAvailable: false,
        source: 'international_availability'
      };
    } else {
      return {
        availableQuantity: null,
        isAvailable: false,
        source: 'unknown'
      };
    }
  }

  // 4. Metadata legacy quantity (MercadoLibre sync: initial_quantity - sold_quantity)
  if (product.metadata?.initial_quantity !== undefined && product.metadata?.initial_quantity !== null && product.metadata?.initial_quantity !== '') {
    const init = Number(product.metadata.initial_quantity);
    const sold = Number(product.metadata.sold_quantity ?? 0);
    if (!isNaN(init) && !isNaN(sold)) {
      const diff = Math.max(0, Math.floor(init - sold));
      return {
        availableQuantity: diff,
        isAvailable: diff > 0,
        source: 'legacy_metadata'
      };
    }
  }

  // 5. Metadata available_quantity or direct inventory_count if explicitly provided
  if (product.metadata?.available_quantity !== undefined && product.metadata?.available_quantity !== null && product.metadata?.available_quantity !== '') {
    const parsed = Number(product.metadata.available_quantity);
    if (!isNaN(parsed)) {
      const stock = Math.max(0, Math.floor(parsed));
      return {
        availableQuantity: stock,
        isAvailable: stock > 0,
        source: 'legacy_metadata'
      };
    }
  }

  if (product.metadata?.inventory_count !== undefined && product.metadata?.inventory_count !== null && product.metadata?.inventory_count !== '') {
    const parsed = Number(product.metadata.inventory_count);
    if (!isNaN(parsed)) {
      const stock = Math.max(0, Math.floor(parsed));
      return {
        availableQuantity: stock,
        isAvailable: stock > 0,
        source: 'legacy_metadata'
      };
    }
  }

  // 6. Products with no valid stock source (unknown / unconfirmed availability)
  return {
    availableQuantity: null,
    isAvailable: false,
    source: 'unknown'
  };
}

/**
 * Backward-compatible helper for callers requiring a numeric stock count
 * (e.g. bulk export/import diffs). Returns 0 when availableQuantity is null.
 */
export function getCanonicalProductStock(product: any): number {
  return resolveProductInventory(product).availableQuantity ?? 0;
}
