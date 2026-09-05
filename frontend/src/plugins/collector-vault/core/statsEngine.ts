import type { VaultItem, VaultStats } from '../types/index';

/**
 * Pure function to calculate comprehensive vault statistics
 */
export function calculateVaultStats(
  items: VaultItem[], 
  collectionsCount: number = 0,
  isOwner: boolean = true
): VaultStats {
  const stats: VaultStats = {
    total_items: 0,
    owned_count: 0,
    wishlist_count: 0,
    ordered_count: 0,
    preordered_count: 0,
    wanted_count: 0,
    sold_count: 0,
    traded_count: 0,
    collections_count: collectionsCount,
    brands_count: 0,
    licenses_count: 0,
    categories_count: 0,
    amount_spent: isOwner ? 0 : null,
    brand_distribution: {},
    license_distribution: {}
  };

  const uniqueBrands = new Set<string>();
  const uniqueLicenses = new Set<string>();
  const uniqueCategories = new Set<string>();

  for (const item of items) {
    const qty = Math.max(1, item.quantity || 1);
    stats.total_items += qty;

    // Status counts
    switch (item.status) {
      case 'OWNED':
        stats.owned_count += qty;
        break;
      case 'WISHLIST':
        stats.wishlist_count += qty;
        break;
      case 'ORDERED':
        stats.ordered_count += qty;
        break;
      case 'PREORDERED':
        stats.preordered_count += qty;
        break;
      case 'WANTED':
        stats.wanted_count += qty;
        break;
      case 'SOLD':
        stats.sold_count += qty;
        break;
      case 'TRADED':
        stats.traded_count += qty;
        break;
    }

    // Money spent on acquired/ordered items (strictly restricted to owner)
    if (
      isOwner &&
      ['OWNED', 'ORDERED', 'PREORDERED'].includes(item.status) &&
      typeof item.purchase_price === 'number' &&
      !isNaN(item.purchase_price)
    ) {
      stats.amount_spent = ((stats.amount_spent as number) || 0) + item.purchase_price * qty;
    }

    // Extract brand (supporting both nested brand object and flattened brand_name)
    const brand = (
      item.product?.brand_name ||
      item.product?.brand?.name ||
      item.external_item?.brand_name ||
      ''
    ).trim();
    if (brand) {
      uniqueBrands.add(brand);
      stats.brand_distribution![brand] = (stats.brand_distribution![brand] || 0) + qty;
    }

    // Extract license
    const license = (
      item.product?.license_name ||
      item.product?.license?.name ||
      item.external_item?.license_name ||
      ''
    ).trim();
    if (license) {
      uniqueLicenses.add(license);
      stats.license_distribution![license] = (stats.license_distribution![license] || 0) + qty;
    }

    // Extract category
    const category = (
      item.product?.category_name ||
      item.product?.category?.name ||
      item.external_item?.category_name ||
      ''
    ).trim();
    if (category) {
      uniqueCategories.add(category);
    }
  }

  stats.brands_count = uniqueBrands.size;
  stats.licenses_count = uniqueLicenses.size;
  stats.categories_count = uniqueCategories.size;

  if (isOwner && typeof stats.amount_spent === 'number') {
    stats.amount_spent = Math.round(stats.amount_spent * 100) / 100;
  }

  return stats;
}

export function calculateBrandBreakdown(items: VaultItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const brand = (
      item.product?.brand_name ||
      item.product?.brand?.name ||
      item.external_item?.brand_name ||
      'Otras'
    ).trim();
    counts[brand] = (counts[brand] || 0) + (item.quantity || 1);
  }
  return counts;
}

export function calculateLicenseBreakdown(items: VaultItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const license = (
      item.product?.license_name ||
      item.product?.license?.name ||
      item.external_item?.license_name ||
      'Otras'
    ).trim();
    counts[license] = (counts[license] || 0) + (item.quantity || 1);
  }
  return counts;
}

export function calculateConditionBreakdown(items: VaultItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const condition = item.condition || 'GOOD';
    counts[condition] = (counts[condition] || 0) + (item.quantity || 1);
  }
  return counts;
}
