/**
 * Leaf utility module for identifying if a product is sold by the official Collectibles store.
 * This is a pure utility file with no dependencies on React, hooks, or other UI components.
 */

export function isCollectiblesOfficialSeller(product: any): boolean {
  if (!product) return false;

  // 1. If there's no vendor_id, it is inherently Collectibles own stock
  if (!product.vendor_id) {
    return true;
  }

  // 2. Check vendor/store name and properties if present
  const vendorStoreName = (
    product.vendor_store?.display_name ||
    product.vendor_store?.store_name ||
    product.vendor_store?.name ||
    product.vendor?.company_name ||
    product.vendor?.store_name ||
    ''
  ).toLowerCase().trim();

  if (
    vendorStoreName === 'collectibles' ||
    vendorStoreName === 'collectibles.uy' ||
    vendorStoreName === 'collectibles oficial'
  ) {
    return true;
  }

  // 3. Check is_collectibles boolean flag on vendor if it exists
  if (product.vendor?.is_collectibles === true) {
    return true;
  }

  return false;
}
