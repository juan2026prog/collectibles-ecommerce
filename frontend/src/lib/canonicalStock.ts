/**
 * Canonical Stock Resolver for Collectibles Platform
 * Single source of truth for resolving product stock across:
 * - Admin Products UI
 * - Export XLSX/CSV
 * - Import Preview
 * - Import diff calculation
 * - Import execution
 */
export type InventorySource =
  | 'variant_inventory_count'
  | 'international_availability'
  | 'legacy_metadata'
  | 'direct_stock'
  | 'unavailable';

export interface ProductInventoryResolution {
  availableQuantity: number;
  isAvailable: boolean;
  source: InventorySource;
}

/**
 * Authoritative Inventory Resolver for Storefront PDP, Cart, Catalog & Admin.
 * Resolves available stock and availability status without inventing stock.
 */
export function resolveProductInventory(product: any, selectedVariant?: any): ProductInventoryResolution {
  if (!product) {
    return { availableQuantity: 0, isAvailable: false, source: 'unavailable' };
  }

  // 1. Explicitly selected variant inventory_count
  if (selectedVariant && selectedVariant.inventory_count !== undefined && selectedVariant.inventory_count !== null) {
    const parsed = parseInt(String(selectedVariant.inventory_count), 10);
    const stock = isNaN(parsed) ? 0 : Math.max(0, parsed);
    return {
      availableQuantity: stock,
      isAvailable: stock > 0,
      source: 'variant_inventory_count'
    };
  }

  // 2. Primary variant if product has variants array/object
  const variants = product.variants || product.product_variants;
  if (Array.isArray(variants) && variants.length > 0) {
    const primaryVar = variants[0];
    if (primaryVar && primaryVar.inventory_count !== undefined && primaryVar.inventory_count !== null) {
      const parsed = parseInt(String(primaryVar.inventory_count), 10);
      const stock = isNaN(parsed) ? 0 : Math.max(0, parsed);
      return {
        availableQuantity: stock,
        isAvailable: stock > 0,
        source: 'variant_inventory_count'
      };
    }
  }

  // 3. International / Zinc on-demand products (slug UUID, source_provider zinc, or shipping_type)
  const isIntl = product.source_provider === 'zinc' || Boolean(product.is_international) || product.shipping_type === 'international_courier_direct';
  if (isIntl) {
    const isPublished = product.status === 'published';
    const isActive = product.is_active ?? true;
    const rawAvail = product.availability || product.raw_international_data?.availability;
    const isNotOutOfStock = rawAvail !== 'out_of_stock';
    const isAvail = isPublished && isActive && isNotOutOfStock;
    return {
      availableQuantity: isAvail ? 10 : 0,
      isAvailable: isAvail,
      source: 'international_availability'
    };
  }

  // 4. Metadata legacy quantity (MercadoLibre sync: initial_quantity - sold_quantity)
  if (product.metadata?.initial_quantity !== undefined && product.metadata?.initial_quantity !== null) {
    const init = parseInt(String(product.metadata.initial_quantity), 10) || 0;
    const sold = parseInt(String(product.metadata.sold_quantity), 10) || 0;
    const diff = Math.max(0, init - sold);
    return {
      availableQuantity: diff,
      isAvailable: diff > 0,
      source: 'legacy_metadata'
    };
  }

  // 5. Metadata direct inventory_count fallback
  if (product.metadata?.inventory_count !== undefined && product.metadata?.inventory_count !== null) {
    const parsed = parseInt(String(product.metadata.inventory_count), 10);
    const stock = isNaN(parsed) ? 0 : Math.max(0, parsed);
    return {
      availableQuantity: stock,
      isAvailable: stock > 0,
      source: 'legacy_metadata'
    };
  }

  // 6. Direct product.stock fallback if explicitly numeric
  if (product.stock !== undefined && product.stock !== null) {
    const parsed = parseInt(String(product.stock), 10);
    const stock = isNaN(parsed) ? 0 : Math.max(0, parsed);
    return {
      availableQuantity: stock,
      isAvailable: stock > 0,
      source: 'direct_stock'
    };
  }

  // 7. Default: unavailable
  return {
    availableQuantity: 0,
    isAvailable: false,
    source: 'unavailable'
  };
}

export function getCanonicalProductStock(product: any): number {
  return resolveProductInventory(product).availableQuantity;
}
