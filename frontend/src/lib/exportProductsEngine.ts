import { supabase } from './supabase';
import type { ProductFilterState } from './productFilterTypes';
import { matchesProductFilters } from './productFilterTypes';
import type { ExportProductItem } from './bulkExportUtils';

export type ExportScope = 'all' | 'filtered' | 'selected' | 'published' | 'draft' | 'archived' | 'out_of_stock';

export interface FetchExportOptions {
  scope: ExportScope;
  filters: ProductFilterState;
  selectedIds?: string[];
  userRole?: 'admin' | 'vendor';
  vendorId?: string | null;
}

/**
 * Normalizes a raw product object from RPC or direct DB query into a clean ExportProductItem.
 */
export function normalizeRawProductForExport(item: any): ExportProductItem {
  if (!item) return { title: 'Desconocido', base_price: 0 };

  const variants = item.variants || item.product_variants || [];
  const primaryVar = variants[0] || {};
  
  const images = item.images || item.product_images || [];
  const primaryImg = images.find((i: any) => i.is_primary)?.url || images[0]?.url || item.image_url || item.metadata?.image_url || '';

  const skuVal = item.sku || primaryVar.sku || item.metadata?.sku || '';
  const stockVal = item.stock !== undefined 
    ? item.stock 
    : (primaryVar.inventory_count !== undefined ? primaryVar.inventory_count : 0);

  const categoryObj = item.category || (item.product_categories?.[0]?.categories ? {
    id: item.product_categories[0].categories.id,
    name: item.product_categories[0].categories.name,
    parent_id: item.product_categories[0].categories.parent_id
  } : null);

  const brandObj = item.brand || (item.brands ? {
    id: item.brands.id,
    name: item.brands.name
  } : null);

  const vendorObj = item.vendor || (item.vendor_stores ? {
    id: item.vendor_id,
    store_name: item.vendor_stores.store_name,
    company_name: item.vendor_stores.company_name
  } : null);

  const subcatName = item.subcategory?.name || item.metadata?.subcategory_name || '';
  const subcategoryObj = item.subcategory || (subcatName ? { name: subcatName } : null);

  const licenseName = item.license?.name || item.metadata?.license_name || '';
  const licenseObj = item.license || (licenseName ? { name: licenseName } : null);

  const dimLen = item.dimensions_length ?? item.dimensions?.length ?? item.dimensions?.l ?? item.metadata?.dimensions?.length ?? '';
  const dimWid = item.dimensions_width ?? item.dimensions?.width ?? item.dimensions?.w ?? item.metadata?.dimensions?.width ?? '';
  const dimHei = item.dimensions_height ?? item.dimensions?.height ?? item.dimensions?.h ?? item.metadata?.dimensions?.height ?? '';

  return {
    id: item.id,
    sku: String(skuVal),
    title: item.title || '',
    description: item.description || null,
    short_description: item.short_description || null,
    base_price: Number(item.base_price || 0),
    compare_at_price: item.compare_at_price !== undefined && item.compare_at_price !== null ? Number(item.compare_at_price) : null,
    cost_price: item.cost_price !== undefined && item.cost_price !== null ? Number(item.cost_price) : (item.metadata?.cost_price ? Number(item.metadata.cost_price) : null),
    stock: Number(stockVal),
    condition: item.condition || item.metadata?.condition || null,
    condition_notes: item.condition_notes || item.metadata?.condition_notes || null,
    ean_upc: item.ean_upc || item.metadata?.ean_upc || item.metadata?.gtin || null,
    weight_kg: item.weight_kg !== undefined && item.weight_kg !== null ? Number(item.weight_kg) : null,
    dimensions_length: dimLen !== '' ? Number(dimLen) : null,
    dimensions_width: dimWid !== '' ? Number(dimWid) : null,
    dimensions_height: dimHei !== '' ? Number(dimHei) : null,
    status: item.status || 'draft',
    badge: item.badge || null,
    image_url: primaryImg,
    created_at: item.created_at,
    updated_at: item.updated_at,
    brand: brandObj,
    category: categoryObj,
    subcategory: subcategoryObj,
    license: licenseObj,
    vendor: vendorObj,
    tags: item.tags || item.product_tags || item.metadata?.tags || null,
    gallery: item.gallery || images.slice(1).map((img: any) => img.url) || null,
    metadata: item.metadata || {},
    variants: variants
  };
}

/**
 * Executes a batch fetch from Supabase to retrieve products matching the scope and filters.
 */
export async function fetchExportProductsData(
  options: FetchExportOptions,
  onProgress?: (fetched: number, total: number, message: string) => void
): Promise<ExportProductItem[]> {
  const { scope, filters, selectedIds = [], userRole = 'admin', vendorId } = options;

  // Handle selected scope
  if (scope === 'selected') {
    if (!selectedIds || selectedIds.length === 0) return [];
    onProgress?.(0, selectedIds.length, 'Cargando productos seleccionados...');
    
    // Fetch selected products by IDs in chunks of 100 to avoid query string length limits
    const chunkSize = 100;
    const allSelectedItems: any[] = [];

    for (let i = 0; i < selectedIds.length; i += chunkSize) {
      const chunk = selectedIds.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          brand:brands(id, name),
          category:categories(id, name, parent_id),
          vendor:vendor_stores!products_vendor_id_fkey(id, store_name, company_name),
          variants:product_variants(id, sku, inventory_count),
          images:product_images(id, url, is_primary, sort_order)
        `)
        .in('id', chunk);

      if (error) {
        console.error('[fetchExportProductsData selected error]', error);
        throw new Error(`Error al obtener productos seleccionados: ${error.message}`);
      }

      if (data) allSelectedItems.push(...data);
      onProgress?.(allSelectedItems.length, selectedIds.length, `Cargando productos seleccionados (${allSelectedItems.length}/${selectedIds.length})...`);
    }

    return allSelectedItems.map(normalizeRawProductForExport);
  }

  // Determine effective status filter
  let statusFilter: string | null = null;
  if (scope === 'published' || scope === 'draft' || scope === 'archived') {
    statusFilter = scope;
  } else if (filters.status && filters.status !== 'out_of_stock') {
    statusFilter = filters.status;
  }

  // Determine effective vendor filter
  let effectiveVendorId: string | null = null;
  if (userRole === 'vendor' && vendorId) {
    effectiveVendorId = vendorId;
  } else if (filters.vendorId && filters.vendorId !== 'all') {
    effectiveVendorId = filters.vendorId === 'platform' ? null : filters.vendorId;
  }

  const isScopeAll = scope === 'all';
  const searchArg = isScopeAll ? null : (filters.search?.trim() || null);
  const categoryArg = isScopeAll ? null : (filters.categoryId || null);
  const brandArg = isScopeAll ? null : (filters.brandId || null);

  // Fetch all matching products in batches of 500 via RPC search_admin_products
  const batchSize = 500;
  let page = 1;
  let hasMore = true;
  let totalCount = 0;
  const rawProductsAccumulator: any[] = [];

  onProgress?.(0, 0, 'Consultando catálogo en Supabase...');

  while (hasMore) {
    const { data, error } = await supabase.rpc('search_admin_products', {
      p_search: searchArg,
      p_category_id: categoryArg,
      p_brand_id: brandArg,
      p_vendor_id: effectiveVendorId,
      p_status: statusFilter,
      p_page: page,
      p_page_size: batchSize,
      p_sort_field: 'created_at',
      p_sort_order: 'desc'
    });

    if (error) {
      console.error('[fetchExportProductsData RPC error]', error);
      throw new Error(`Error al consultar catálogo para exportación: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    totalCount = Number(data[0].total_count || 0);
    const batchItems = data[0].products || [];

    if (batchItems.length === 0) {
      break;
    }

    rawProductsAccumulator.push(...batchItems);

    onProgress?.(
      rawProductsAccumulator.length,
      totalCount,
      `Obteniendo productos (${Math.min(rawProductsAccumulator.length, totalCount)} de ${totalCount})...`
    );

    if (rawProductsAccumulator.length >= totalCount || batchItems.length < batchSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  // Normalize raw items
  let normalized = rawProductsAccumulator.map(normalizeRawProductForExport);

  // Apply secondary scope & client-side filters (MBE, Argentina status, out_of_stock, etc.)
  if (scope === 'out_of_stock') {
    normalized = normalized.filter(p => (p.stock ?? 0) <= 0);
  } else if (!isScopeAll) {
    normalized = normalized.filter(p => matchesProductFilters(p, filters));
  }

  return normalized;
}

/**
 * Fast function to calculate total matching products for scope and filters.
 */
export async function fetchExportProductsCount(options: FetchExportOptions): Promise<number> {
  const { scope, filters, selectedIds = [], userRole = 'admin', vendorId } = options;

  if (scope === 'selected') {
    return selectedIds ? selectedIds.length : 0;
  }

  try {
    const prods = await fetchExportProductsData(options);
    return prods.length;
  } catch (err) {
    console.error('[fetchExportProductsCount error]', err);
    return 0;
  }
}
