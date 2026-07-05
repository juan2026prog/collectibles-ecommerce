/**
 * Resolves the correct price for a cart item based on product and variant data.
 * Handles strings, numbers, price adjustments, and alternative namings.
 */
export function resolveCartItemPrice(product: any, variant?: any): number {
  if (!product) return 0;

  // Filter out browser events/MouseEvents passed as variant
  const isEvent = variant && (
    (typeof Event !== 'undefined' && variant instanceof Event) ||
    variant.nativeEvent ||
    variant.target ||
    typeof variant.preventDefault === 'function'
  );
  const cleanVariant = isEvent ? undefined : variant;

  let base = 0;
  let adjustment = 0;

  // Try to find the base price of the product
  // Check common naming patterns: base_price, price_uyu, price, sale_price, final_price, unit_price
  const priceFields = ['base_price', 'price_uyu', 'price', 'sale_price', 'final_price', 'unit_price'];
  for (const field of priceFields) {
    if (product[field] !== undefined && product[field] !== null && product[field] !== '') {
      const val = Number(product[field]);
      if (!isNaN(val) && val > 0) {
        base = val;
        break;
      }
    }
  }

  // Try to find the variant or variant adjustment
  if (cleanVariant) {
    // Check if variant has a direct price first
    for (const field of priceFields) {
      if (cleanVariant[field] !== undefined && cleanVariant[field] !== null && cleanVariant[field] !== '') {
        const val = Number(cleanVariant[field]);
        if (!isNaN(val) && val > 0) {
          return val; // Direct variant price overrides base
        }
      }
    }

    // Check if variant has a price adjustment
    const adjustmentFields = ['price_adjustment', 'adjustment', 'priceAdjustment'];
    for (const field of adjustmentFields) {
      if (cleanVariant[field] !== undefined && cleanVariant[field] !== null && cleanVariant[field] !== '') {
        const val = Number(cleanVariant[field]);
        if (!isNaN(val)) {
          adjustment = val;
          break;
        }
      }
    }
  }

  const finalPrice = base + adjustment;
  
  if (import.meta.env.DEV) {
    console.log(`[PriceResolver] Resolved price: ${finalPrice} (base: ${base}, adjustment: ${adjustment})`);
  }

  return isNaN(finalPrice) || finalPrice <= 0 ? 0 : finalPrice;
}
