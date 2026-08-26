/**
 * Canonical Stock Resolver for Collectibles Platform
 * Single source of truth for resolving product stock across:
 * - Admin Products UI
 * - Export XLSX/CSV
 * - Import Preview
 * - Import diff calculation
 * - Import execution
 */
export function getCanonicalProductStock(product: any): number {
  if (!product) return 0;

  // 1. Primary variant inventory_count (array or object)
  const variants = product.variants || product.product_variants || [];
  const primaryVar = Array.isArray(variants) ? variants[0] : variants;

  if (primaryVar && primaryVar.inventory_count !== undefined && primaryVar.inventory_count !== null) {
    const parsed = parseInt(String(primaryVar.inventory_count), 10);
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  }

  // 2. Direct stock field fallback if explicitly numeric
  if (product.stock !== undefined && product.stock !== null) {
    const parsed = parseInt(String(product.stock), 10);
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  }

  // 3. Metadata inventory_count fallback
  if (product.metadata?.inventory_count !== undefined && product.metadata?.inventory_count !== null) {
    const parsed = parseInt(String(product.metadata.inventory_count), 10);
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  }

  return 0;
}
