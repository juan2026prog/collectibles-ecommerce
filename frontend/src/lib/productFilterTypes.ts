import { sanitizeMbePackagingType } from './mbeLogisticsUtils';
import { calculateArgentinaShippingStatus } from './mbeLogisticsUtils';

export interface ProductFilterState {
  search: string;
  categoryId: string;
  brandId: string;
  vendorId: string; // 'all' | 'platform' | vendor_id
  mbeType: string; // '' | 'mbe_pak' | 'mbe_caja' | 'unclassified'
  argentinaStatus: string; // '' | 'auto' | 'quote'
  status: string; // '' | 'published' | 'draft' | 'archived' | 'out_of_stock'
  condition?: string; // '' | condition
}

export function createDefaultProductFilters(initial?: Partial<ProductFilterState>): ProductFilterState {
  return {
    search: '',
    categoryId: '',
    brandId: '',
    vendorId: 'all',
    mbeType: '',
    argentinaStatus: '',
    status: '',
    condition: '',
    ...initial
  };
}

/**
 * Client-side filter evaluator used for secondary filtering (MBE, Argentina status, etc.)
 */
export function matchesProductFilters(item: any, filters: ProductFilterState): boolean {
  if (!item) return false;

  // Search filter
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const titleMatch = (item.title || '').toLowerCase().includes(q);
    const skuMatch = (item.sku || item.variants?.[0]?.sku || '').toLowerCase().includes(q);
    const brandMatch = (item.brand?.name || item.metadata?.brand_name || '').toLowerCase().includes(q);
    const categoryMatch = (item.category?.name || item.metadata?.category_name || '').toLowerCase().includes(q);
    const vendorMatch = (item.vendor?.store_name || item.vendor?.company_name || item.metadata?.vendor_name || '').toLowerCase().includes(q);
    if (!titleMatch && !skuMatch && !brandMatch && !categoryMatch && !vendorMatch) {
      return false;
    }
  }

  // Category filter
  if (filters.categoryId) {
    const catId = item.category?.id || item.category_id;
    if (catId !== filters.categoryId) return false;
  }

  // Brand filter
  if (filters.brandId) {
    const brId = item.brand?.id || item.brand_id;
    if (brId !== filters.brandId) return false;
  }

  // Vendor filter
  if (filters.vendorId && filters.vendorId !== 'all') {
    if (filters.vendorId === 'platform') {
      if (item.vendor_id !== null && item.vendor_id !== undefined && item.vendor_id !== 'platform') {
        return false;
      }
    } else {
      if (item.vendor_id !== filters.vendorId) return false;
    }
  }

  // Status filter
  if (filters.status) {
    if (filters.status === 'out_of_stock') {
      const stock = item.stock !== undefined ? item.stock : (item.variants?.[0]?.inventory_count ?? 0);
      if (stock > 0) return false;
    } else {
      if ((item.status || 'draft') !== filters.status) return false;
    }
  }

  // Condition filter
  if (filters.condition) {
    if ((item.condition || '') !== filters.condition) return false;
  }

  // MBE packaging filter
  if (filters.mbeType) {
    const pkg = sanitizeMbePackagingType(item.metadata?.packaging_type || item.metadata?.mbe_service_type);
    if (filters.mbeType === 'mbe_pak' && pkg !== 'mbe_pak') return false;
    if (filters.mbeType === 'mbe_caja' && pkg !== 'mbe_caja') return false;
    if (filters.mbeType === 'unclassified' && pkg !== null) return false;
  }

  // Argentina status filter
  if (filters.argentinaStatus) {
    const arStatus = calculateArgentinaShippingStatus(item);
    if (filters.argentinaStatus === 'auto' && !arStatus.isEligible) return false;
    if (filters.argentinaStatus === 'quote' && arStatus.isEligible) return false;
  }

  return true;
}
