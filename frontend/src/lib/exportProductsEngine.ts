import { supabase } from './supabase';
import type { ProductFilterState } from './productFilterTypes';
import { matchesProductFilters } from './productFilterTypes';
import type { ExportProductItem } from './bulkExportUtils';

import { getCanonicalProductStock } from './canonicalStock';

export type ExportScope = 'all' | 'filtered' | 'selected' | 'published' | 'draft' | 'archived' | 'out_of_stock';

export interface FetchExportOptions {
  scope: ExportScope;
  filters: ProductFilterState;
  selectedIds?: string[];
  userRole?: 'admin' | 'vendor';
  vendorId?: string | null;
}

/**
 * Normalizes a raw product object from DB query or RPC into a clean ExportProductItem.
 * Preserves product.id, vendor_id, category_id, brand_id internally throughout the pipeline.
 */
export function normalizeRawProductForExport(item: any): ExportProductItem {
  if (!item) return { id: 'unknown', title: 'Desconocido', base_price: 0 };

  const variants = item.variants || item.product_variants || [];
  const primaryVar = variants[0] || {};
  
  const images = item.images || item.product_images || [];
  const primaryImg = images.find((i: any) => i.is_primary)?.url || images[0]?.url || item.image_url || item.metadata?.image_url || '';

  const skuVal = item.sku || primaryVar.sku || item.metadata?.gtin || item.metadata?.sku || '';
  const stockVal = getCanonicalProductStock(item);

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
    store_name: item.vendor_stores.store_name || item.vendor_stores.company_name,
    company_name: item.vendor_stores.company_name
  } : null);

  // Subcategory resolution from junction table product_categories or metadata
  const subcatFromJunction = item.product_categories?.map((pc: any) => pc.categories).find((c: any) => c?.parent_id);
  const subcatName = item.subcategory?.name || subcatFromJunction?.name || item.metadata?.subcategory_name || '';
  const subcategoryObj = item.subcategory || (subcatName ? { name: subcatName } : null);

  // License resolution from junction table product_licenses or metadata
  const licFromJunction = item.product_licenses?.[0]?.licenses;
  const licenseName = item.license?.name || licFromJunction?.name || item.metadata?.license_name || '';
  const licenseObj = item.license || (licenseName ? { name: licenseName } : null);

  // Tags resolution from junction table product_tags or metadata
  const tagsFromJunction = item.product_tags?.map((pt: any) => pt.tags?.name).filter(Boolean);
  const tagsArr = (tagsFromJunction && tagsFromJunction.length > 0) 
    ? tagsFromJunction 
    : (Array.isArray(item.metadata?.tags) ? item.metadata.tags : (item.tags || []));

  const dimLen = item.dimensions_length ?? item.dimensions?.length ?? item.dimensions?.l ?? item.metadata?.dimensions?.length ?? item.metadata?.dimensions?.l ?? '';
  const dimWid = item.dimensions_width ?? item.dimensions?.width ?? item.dimensions?.w ?? item.metadata?.dimensions?.width ?? item.metadata?.dimensions?.w ?? '';
  const dimHei = item.dimensions_height ?? item.dimensions?.height ?? item.dimensions?.h ?? item.metadata?.dimensions?.height ?? item.metadata?.dimensions?.h ?? '';

  const contentVal = item.content || item.metadata?.content || item.metadata?.description_html || item.metadata?.body || null;
  const videoVal = item.video_url || item.metadata?.video_url || (item.metadata?.video_id ? `https://www.youtube.com/watch?v=${item.metadata.video_id}` : null);

  return {
    id: item.id,
    sku: String(skuVal),
    title: item.title || '',
    slug: item.slug || null,
    product_url: item.slug ? `https://collectibles.uy/p/${item.slug}` : null,
    description: item.description || null,
    short_description: item.short_description || null,
    content: contentVal,
    base_price: Number(item.base_price || 0),
    compare_at_price: item.compare_at_price !== undefined && item.compare_at_price !== null ? Number(item.compare_at_price) : null,
    cost_price: item.cost_price !== undefined && item.cost_price !== null ? Number(item.cost_price) : (item.metadata?.cost_price ? Number(item.metadata.cost_price) : null),
    stock: Number(stockVal),
    is_featured: item.is_featured !== undefined && item.is_featured !== null ? Boolean(item.is_featured) : false,
    condition: item.condition || item.metadata?.condition || null,
    condition_notes: item.condition_notes || item.metadata?.condition_notes || null,
    ean_upc: item.ean_upc || item.metadata?.ean_upc || item.metadata?.gtin || null,
    weight_kg: item.weight_kg !== undefined && item.weight_kg !== null ? Number(item.weight_kg) : (item.metadata?.weight_kg ? Number(item.metadata.weight_kg) : null),
    dimensions_length: dimLen !== '' ? Number(dimLen) : null,
    dimensions_width: dimWid !== '' ? Number(dimWid) : null,
    dimensions_height: dimHei !== '' ? Number(dimHei) : null,
    status: item.status || 'draft',
    badge: item.badge || item.metadata?.badge || null,
    image_url: primaryImg,
    video_url: videoVal,
    seo_title: item.seo_title || item.meta_title || null,
    seo_description: item.seo_description || item.meta_description || null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    vendor_id: item.vendor_id || vendorObj?.id || null,
    category_id: item.category_id || categoryObj?.id || null,
    brand_id: item.brand_id || brandObj?.id || null,
    brand: brandObj,
    category: categoryObj,
    subcategory: subcategoryObj,
    license: licenseObj,
    vendor: vendorObj,
    tags: tagsArr,
    gallery: item.gallery || images.slice(1).map((img: any) => img.url) || null,
    metadata: item.metadata || {},
    variants: variants
  };
}

/**
 * Helper to enrich raw products with full DB relations in chunks of 100.
 */
export async function enrichRawProducts(items: any[]): Promise<any[]> {
  if (!items || items.length === 0) return [];
  const productIds = items.map(p => p.id).filter(Boolean);
  const enrichedMap = new Map<string, any>();

  const chunkSize = 100;
  for (let i = 0; i < productIds.length; i += chunkSize) {
    const chunk = productIds.slice(i, i + chunkSize);
    const { data: dbData, error } = await supabase
      .from('products')
      .select(`
        id,
        title,
        slug,
        description,
        short_description,
        base_price,
        compare_at_price,
        status,
        is_featured,
        badge,
        weight_kg,
        dimensions,
        condition,
        condition_notes,
        seo_title,
        seo_description,
        meta_title,
        meta_description,
        metadata,
        created_at,
        updated_at,
        vendor_id,
        category_id,
        brand_id,
        brand:brands!products_brand_id_fkey(id, name),
        category:categories(id, name, parent_id),
        vendor:vendors(id, store_name, company_name),
        variants:product_variants(id, sku, inventory_count),
        images:product_images(id, url, is_primary, sort_order),
        product_categories(categories(id, name, parent_id)),
        product_licenses(licenses(id, name)),
        product_tags(tags(id, name))
      `)
      .in('id', chunk);

    if (!error && dbData) {
      dbData.forEach(p => enrichedMap.set(p.id, p));
    }
  }

  return items.map(raw => {
    const enriched = enrichedMap.get(raw.id);
    return enriched ? { ...raw, ...enriched } : raw;
  });
}

/**
 * Executes a batched, deduplicated fetch from Supabase to retrieve products matching scope and filters.
 * STRICT RULE: Deduplication is strictly by Map(product.id, product).
 * NO deduplication by SKU, title, or row content is allowed.
 * Guarantees 1 product ID = 1 export row.
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
    
    // Deduplicate selected IDs strictly by product ID
    const uniqueSelectedIds = Array.from(new Set(selectedIds));
    const chunkSize = 100;
    const allSelectedItems: any[] = [];

    for (let i = 0; i < uniqueSelectedIds.length; i += chunkSize) {
      const chunk = uniqueSelectedIds.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          title,
          slug,
          description,
          short_description,
          base_price,
          compare_at_price,
          status,
          is_featured,
          badge,
          weight_kg,
          dimensions,
          condition,
          condition_notes,
          seo_title,
          seo_description,
          meta_title,
          meta_description,
          metadata,
          created_at,
          updated_at,
          vendor_id,
          category_id,
          brand_id,
          brand:brands!products_brand_id_fkey(id, name),
          category:categories(id, name, parent_id),
          vendor:vendors(id, store_name, company_name),
          variants:product_variants(id, sku, inventory_count),
          images:product_images(id, url, is_primary, sort_order),
          product_categories(categories(id, name, parent_id)),
          product_licenses(licenses(id, name)),
          product_tags(tags(id, name))
        `)
        .in('id', chunk);

      if (error) {
        console.error('[fetchExportProductsData selected error]', error);
        throw new Error(`Error al obtener productos seleccionados: ${error.message}`);
      }

      if (data) allSelectedItems.push(...data);
      onProgress?.(allSelectedItems.length, uniqueSelectedIds.length, `Cargando productos seleccionados (${allSelectedItems.length}/${uniqueSelectedIds.length})...`);
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

  const isScopeAll = scope === 'all';
  const searchArg = isScopeAll ? null : (filters.search?.trim() || null);
  const categoryArg = isScopeAll ? null : (filters.categoryId || null);
  const brandArg = isScopeAll ? null : (filters.brandId || null);

  // Map strictly keyed by product.id for ID uniqueness
  const rawProductsMap = new Map<string, any>();
  onProgress?.(0, 0, 'Consultando catálogo en Supabase...');

  // Primary Query Engine: Direct batched queries on products table with deterministic ordering by product.id
  let offset = 0;
  const directBatchSize = 1000;
  
  while (true) {
    let query = supabase
      .from('products')
      .select(`
        id, title, slug, description, short_description, base_price, compare_at_price, status, is_featured, badge, weight_kg, dimensions, condition, condition_notes, seo_title, seo_description, meta_title, meta_description, metadata, created_at, updated_at, vendor_id, category_id, brand_id,
        brand:brands!products_brand_id_fkey(id, name),
        category:categories(id, name, parent_id),
        vendor:vendors(id, store_name, company_name),
        variants:product_variants(id, sku, inventory_count),
        images:product_images(id, url, is_primary, sort_order)
      `)
      .order('id', { ascending: true })
      .range(offset, offset + directBatchSize - 1);

    if (statusFilter) query = query.eq('status', statusFilter);
    
    // Vendor filtering: platform = Collectibles (vendor_id IS NULL) vs specific vendor UUID vs vendorRole
    if (userRole === 'vendor' && vendorId) {
      query = query.eq('vendor_id', vendorId);
    } else if (filters.vendorId && filters.vendorId !== 'all') {
      if (filters.vendorId === 'platform') {
        query = query.is('vendor_id', null);
      } else {
        query = query.eq('vendor_id', filters.vendorId);
      }
    }

    if (categoryArg) query = query.eq('category_id', categoryArg);
    if (brandArg) query = query.eq('brand_id', brandArg);
    if (searchArg) query = query.ilike('title', `%${searchArg}%`);

    const { data: dbDirect, error: dbDirectErr } = await query;
    if (dbDirectErr || !dbDirect || dbDirect.length === 0) break;

    dbDirect.forEach(p => {
      if (p.id) rawProductsMap.set(p.id, p);
    });

    onProgress?.(
      rawProductsMap.size,
      rawProductsMap.size,
      `Obteniendo catálogo (${rawProductsMap.size})...`
    );

    if (dbDirect.length < directBatchSize) break;
    offset += directBatchSize;
  }

  const rawProductsAccumulator = Array.from(rawProductsMap.values());

  onProgress?.(
    rawProductsAccumulator.length,
    rawProductsAccumulator.length,
    'Enriqueciendo datos relacionales del catálogo...'
  );

  // Enrich raw products with full DB fields (weight, dimensions, licenses, subcategories, tags)
  const enrichedProducts = await enrichRawProducts(rawProductsAccumulator);

  // Normalize raw items (preserving product.id)
  let normalized = enrichedProducts.map(normalizeRawProductForExport);

  // Apply secondary scope & client-side filters (MBE, Argentina status, out_of_stock, etc.)
  if (scope === 'out_of_stock') {
    normalized = normalized.filter(p => (p.stock ?? 0) <= 0);
  } else if (!isScopeAll) {
    normalized = normalized.filter(p => matchesProductFilters(p, filters));
  }

  // Final ID deduplication check STRICTLY by product.id
  const seenIds = new Set<string>();
  const finalDeduplicatedProducts: ExportProductItem[] = [];
  for (const prod of normalized) {
    if (prod.id && !seenIds.has(prod.id)) {
      seenIds.add(prod.id);
      finalDeduplicatedProducts.push(prod);
    }
  }

  return finalDeduplicatedProducts;
}

/**
 * Fast function to calculate total matching products count for scope and filters.
 * Uses lightweight head: true count queries to return in 10ms.
 */
export async function fetchExportProductsCount(options: FetchExportOptions): Promise<number> {
  const { scope, filters, selectedIds = [], userRole = 'admin', vendorId } = options;

  if (scope === 'selected') {
    return selectedIds ? selectedIds.length : 0;
  }

  try {
    let query = supabase.from('products').select('id', { count: 'exact', head: true });

    let statusFilter: string | null = null;
    if (scope === 'published' || scope === 'draft' || scope === 'archived') {
      statusFilter = scope;
    } else if (filters.status && filters.status !== 'out_of_stock') {
      statusFilter = filters.status;
    }

    const isScopeAll = scope === 'all';
    const searchArg = isScopeAll ? null : (filters.search?.trim() || null);
    const categoryArg = isScopeAll ? null : (filters.categoryId || null);
    const brandArg = isScopeAll ? null : (filters.brandId || null);

    if (statusFilter) query = query.eq('status', statusFilter);
    
    // Vendor filtering: platform = Collectibles (vendor_id IS NULL) vs specific vendor UUID vs vendorRole
    if (userRole === 'vendor' && vendorId) {
      query = query.eq('vendor_id', vendorId);
    } else if (filters.vendorId && filters.vendorId !== 'all') {
      if (filters.vendorId === 'platform') {
        query = query.is('vendor_id', null);
      } else {
        query = query.eq('vendor_id', filters.vendorId);
      }
    }

    if (categoryArg) query = query.eq('category_id', categoryArg);
    if (brandArg) query = query.eq('brand_id', brandArg);
    if (searchArg) query = query.ilike('title', `%${searchArg}%`);

    const { count, error } = await query;
    if (error || count === null) {
      const prods = await fetchExportProductsData(options);
      return prods.length;
    }

    return count;
  } catch (err) {
    console.error('[fetchExportProductsCount error]', err);
    return 0;
  }
}
