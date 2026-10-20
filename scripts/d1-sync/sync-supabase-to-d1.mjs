// #!/usr/bin/env node
/**
 * Sincronizador Incremental y Carga Inicial Controlada: Supabase -> Cloudflare D1
 * (Arquitectura Zero-Write sobre Supabase Nano 500 MB RAM)
 *
 * Garantías técnicas verificadas contra el esquema real de Supabase y D1:
 * 1. CERO ESCRITURAS Y CERO MIGRACIONES EN SUPABASE:
 *    - No requiere triggers, ni tabla outbox, ni crear índices nuevos en PostgreSQL.
 * 2. PAGINACIÓN KEYSET POR CLAVE PRIMARIA (`products_pkey` e `international_products_pkey`):
 *    - Usa `id=gt.<last_uuid>&order=id.asc&limit=<N>`, ejecutando `Index Scan` puro
 *      sobre la clave primaria sin nodo `Sort` ni `Seq Scan`.
 * 3. CERO JOINS LATERALES EN POSTGRESQL:
 *    - `products` e `international_products` se consultan de forma plana.
 *    - `product_images`, `product_variants`, `product_categories` y `product_group_items`
 *      se hidratan por separado mediante consultas planas `product_id=in.(...)` acotadas
 *      al sub-lote actual (máx. 15 IDs).
 *    - Las taxonomías (`categories`, `brands`, `licenses`, `themes`, `vendors`, `vendor_stores`)
 *      se unen en memoria de Node.js.
 * 4. LÍMITES ESTRICTOS Y MECANISMO DE SUSPENSIÓN AUTOMÁTICA:
 *    - Pre-flight health probe (`< 1200 ms`).
 *    - Límite duro de tamaño de respuesta (`MAX_RESPONSE_BYTES = 512 KB`).
 *    - Suspensión inmediata con archivo `.d1-sync-suspend.json` (cooldown 15 min) si la
 *      latencia de Supabase supera `2000 ms` o devuelve HTTP 429/5xx.
 * 5. PRIVACIDAD, STOCK CANÓNICO Y MONEDA:
 *    - Filtra explícitamente campos sensibles/costos internos antes de transformar.
 *    - Resuelve stock real desde `product_variants.inventory_count` y `metadata` (idéntico a `canonicalStock.ts`).
 *    - Preserva `UYU` para productos locales/vendedores Uruguay y `USD` + `final_price_uyu` para internacionales.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SYNC_LIMITS = {
  HEADER_SCAN_LIMIT: 50,
  HYDRATE_BATCH_SIZE: 15,
  MIN_HYDRATE_BATCH_SIZE: 5,
  PROBE_MAX_PRODUCTS: 10,
  BASE_PAUSE_MS: 2000,
  SLOW_PAUSE_MS: 4500,
  PREFLIGHT_MAX_LATENCY_MS: 1200,
  SOFT_LATENCY_THRESHOLD_MS: 900,
  HARD_LATENCY_ABORT_MS: 2000,
  MAX_RESPONSE_BYTES: 512 * 1024, // 512 KB
  MAX_DESCRIPTION_CHARS: 4000,
  SUSPEND_COOLDOWN_MS: 15 * 60 * 1000, // 15 minutos
};

export const FORBIDDEN_PRIVATE_KEYS = new Set([
  'real_cost_usd',
  'expected_profit_usd',
  'acquisition_cost_usd',
  'cost_price',
  'wholesale_price',
  'supplier_url',
  'product_url_external',
  'raw_data',
  'supplier_notes',
  'internal_notes',
  'credentials_encrypted',
  'access_token',
  'refresh_token',
  'client_secret',
  'service_role_key',
  'customer_email',
  'customer_phone',
  'buyer_email',
  'tax_id',
  'shipping_address',
  'ci',
  'dni',
  'cuit',
]);

/**
 * Columnas reales verificadas en `public.products` (Supabase PostgreSQL).
 * NOTA: `stock`, `sku` y `variants` residen en `public.product_variants` y `products.metadata`.
 */
export const VERIFIED_LOCAL_PRODUCT_HEADER_COLS = [
  'id',
  'slug',
  'status',
  'is_active',
  'updated_at',
  'base_price',
];

export const VERIFIED_LOCAL_PRODUCT_HYDRATE_COLS = [
  'id',
  'slug',
  'title',
  'description',
  'short_description',
  'base_price',
  'compare_at_price',
  'badge',
  'is_featured',
  'is_active',
  'status',
  'condition',
  'condition_notes',
  'category_id',
  'brand_id',
  'license_id',
  'vendor_id',
  'vendor_store_id',
  'weight_kg',
  'dimensions',
  'seo_title',
  'seo_description',
  'meta_title',
  'meta_description',
  'metadata',
  'ml_item_id',
  'created_at',
  'updated_at',
];

/**
 * Columnas reales verificadas en `public.international_products` (Supabase PostgreSQL).
 * Excluye explícitamente `real_cost_usd`, `expected_profit_usd`, `raw_data` y `product_url_external`.
 */
export const VERIFIED_INTL_PRODUCT_HEADER_COLS = [
  'id',
  'external_product_id',
  'status',
  'availability',
  'updated_at',
  'final_price_usd',
  'final_price_uyu',
];

export const VERIFIED_INTL_PRODUCT_HYDRATE_COLS = [
  'id',
  'source_provider',
  'source_retailer',
  'external_product_id',
  'external_sku',
  'title',
  'description',
  'brand',
  'category',
  'collectibles_category_id',
  'collectibles_subcategory_id',
  'image_url',
  'main_image_url_external',
  'gallery_images',
  'base_price_usd',
  'final_price_usd',
  'final_price_uyu',
  'urubox_estimated_cost_usd',
  'total_estimated_cost_usd',
  'amazon_current_price_usd',
  'amazon_list_price_usd',
  'amazon_discount_percent',
  'amazon_prime',
  'currency',
  'availability',
  'rating',
  'review_count',
  'weight_grams',
  'status',
  'last_synced_at',
  'created_at',
  'updated_at',
];

export function stripPrivateFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripPrivateFields);
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_PRIVATE_KEYS.has(k)) continue;
    clean[k] = v && typeof v === 'object' ? stripPrivateFields(v) : v;
  }
  return clean;
}

/**
 * Resolutor canónico de stock para sincronización hacia D1, alineado con `frontend/src/lib/canonicalStock.ts`:
 * 1. Suma o toma `inventory_count` de variantes activas en `product_variants`.
 * 2. Fallback a `row.stock` si fue inyectado en tests unitarios.
 * 3. Fallback a `metadata.initial_quantity - metadata.sold_quantity`, `metadata.available_quantity` o `metadata.inventory_count`.
 */
export function resolveLocalProductStockAndVariants(safeRow, rawVariants = []) {
  const activeVariants = Array.isArray(rawVariants)
    ? rawVariants
        .filter((v) => v && v.is_active !== false)
        .map((v) => ({
          id: String(v.id),
          sku: v.sku || v.legacy_sku || null,
          legacy_sku: v.legacy_sku || null,
          name: String(v.name || 'Default'),
          price_adjustment: Number(v.price_adjustment ?? 0),
          inventory_count: Math.max(0, Math.floor(Number(v.inventory_count ?? 0))),
          is_active: true,
        }))
    : [];

  if (activeVariants.length > 0) {
    const totalVariantStock = activeVariants.reduce((acc, v) => acc + v.inventory_count, 0);
    return {
      stock: totalVariantStock,
      variants: activeVariants,
      primarySku: activeVariants[0].sku || safeRow.sku || safeRow.ml_item_id || null,
    };
  }

  let resolvedStock = 0;
  if (safeRow.stock !== undefined && safeRow.stock !== null && safeRow.stock !== '') {
    resolvedStock = Math.max(0, Math.floor(Number(safeRow.stock) || 0));
  } else if (safeRow.metadata && typeof safeRow.metadata === 'object') {
    const meta = safeRow.metadata;
    if (meta.initial_quantity !== undefined && meta.initial_quantity !== null) {
      const init = Number(meta.initial_quantity);
      const sold = Number(meta.sold_quantity ?? 0);
      if (!Number.isNaN(init) && !Number.isNaN(sold)) {
        resolvedStock = Math.max(0, Math.floor(init - sold));
      }
    } else if (meta.available_quantity !== undefined && meta.available_quantity !== null) {
      resolvedStock = Math.max(0, Math.floor(Number(meta.available_quantity) || 0));
    } else if (meta.inventory_count !== undefined && meta.inventory_count !== null) {
      resolvedStock = Math.max(0, Math.floor(Number(meta.inventory_count) || 0));
    }
  }

  const fallbackSku =
    safeRow.sku ||
    safeRow.metadata?.sku ||
    safeRow.metadata?.seller_sku ||
    safeRow.ml_item_id ||
    null;

  // Sintetizar variante canónica para que `canonicalStock.ts` en el frontend resuelva `variant_inventory_count`
  const synthesizedVariants = [
    {
      id: `${safeRow.id}-default`,
      sku: fallbackSku,
      legacy_sku: null,
      name: 'Estándar',
      price_adjustment: 0,
      inventory_count: resolvedStock,
      is_active: true,
    },
  ];

  return {
    stock: resolvedStock,
    variants: synthesizedVariants,
    primarySku: fallbackSku,
  };
}

export function transformLocalProductForD1(row, lookupMaps = {}) {
  const safeRow = stripPrivateFields(row);
  const category = lookupMaps.categories?.get(safeRow.category_id) || safeRow.categories || safeRow.category || null;
  const brand = lookupMaps.brands?.get(safeRow.brand_id) || safeRow.brands || safeRow.brand || null;
  const license = lookupMaps.licenses?.get(safeRow.license_id) || safeRow.licenses || safeRow.license || null;
  const vendor = lookupMaps.vendors?.get(safeRow.vendor_id) || safeRow.vendors || safeRow.vendor || null;
  const vendorStore =
    lookupMaps.vendorStores?.get(safeRow.vendor_store_id) || safeRow.vendor_store || null;

  const rawImages = lookupMaps.imagesByProduct?.get(safeRow.id) || safeRow.product_images || safeRow.images || [];
  const rawVariants = lookupMaps.variantsByProduct?.get(safeRow.id) || safeRow.product_variants || safeRow.variants || [];
  const extraCategoryIds = lookupMaps.categoriesByProduct?.get(safeRow.id) || [];
  const groupIds =
    lookupMaps.groupsByProduct?.get(safeRow.id) ||
    (Array.isArray(safeRow.product_group_items)
      ? safeRow.product_group_items.map((g) => g.group_id).filter(Boolean)
      : []);

  const images = Array.isArray(rawImages)
    ? [...rawImages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [];
  const primaryImage =
    images.find((img) => img.is_primary)?.url ||
    images[0]?.url ||
    safeRow.image_url ||
    safeRow.metadata?.thumbnail ||
    null;

  const { stock, variants, primarySku } = resolveLocalProductStockAndVariants(safeRow, rawVariants);
  const isPreorder = Boolean(
    safeRow.is_preorder ||
      safeRow.availability_type === 'preorder' ||
      safeRow.badge === 'preventa'
  );

  let stockStatus = 'out_of_stock';
  if (isPreorder) stockStatus = 'preorder';
  else if (stock > 3) stockStatus = 'in_stock';
  else if (stock > 0) stockStatus = 'low_stock';

  const description = safeRow.description
    ? String(safeRow.description).slice(0, SYNC_LIMITS.MAX_DESCRIPTION_CHARS)
    : null;

  const allCategoryIds = Array.from(
    new Set([safeRow.category_id, ...extraCategoryIds].filter(Boolean))
  );

  const shipsToArgentina =
    vendor?.shipping_settings?.ships_to_argentina !== false &&
    vendor?.ships_to_argentina !== false;

  const ean =
    safeRow.ean ||
    safeRow.metadata?.ean ||
    safeRow.metadata?.gtin ||
    null;

  const waveName =
    safeRow.wave_name ||
    safeRow.metadata?.wave_name ||
    null;

  return {
    id: String(safeRow.id),
    slug: String(safeRow.slug || safeRow.id),
    title: String(safeRow.title || '').trim(),
    description,
    short_description: safeRow.short_description ? String(safeRow.short_description).slice(0, 600) : null,
    sku: primarySku,
    ean,
    asin: safeRow.asin || null,
    external_product_id: safeRow.external_product_id || safeRow.ml_item_id || null,
    catalog_source: 'local',
    source_provider: safeRow.source_provider || safeRow.source_platform || 'platform',
    source_market: 'UY',
    is_international: false,
    // Regla comercial estricta: productos locales/vendedores Uruguay se mantienen en UYU
    currency: 'UYU',
    price_currency: 'UYU',
    base_price: Number(safeRow.base_price ?? 0),
    compare_at_price: safeRow.compare_at_price != null ? Number(safeRow.compare_at_price) : null,
    final_price_usd: null,
    final_price_uyu: Number(safeRow.base_price ?? 0),
    status: safeRow.status || 'published',
    is_active: safeRow.is_active !== false && safeRow.status === 'published',
    stock,
    stock_status: stockStatus,
    availability_type: safeRow.availability_type || (isPreorder ? 'preorder' : 'immediate'),
    is_preorder: isPreorder,
    preorder_eta: safeRow.preorder_eta || null,
    release_date: safeRow.release_date || null,
    condition: safeRow.condition || 'new_sealed',
    is_featured: Boolean(safeRow.is_featured),
    is_new_arrival: Boolean(safeRow.is_new_arrival),
    category_id: safeRow.category_id || null,
    category_slug: category?.slug || null,
    category_name: category?.name || null,
    brand_id: safeRow.brand_id || null,
    brand_slug: brand?.slug || null,
    brand_name: brand?.name || null,
    license_id: safeRow.license_id || null,
    license_slug: license?.slug || null,
    license_name: license?.name || null,
    theme_id: safeRow.theme_id || null,
    vendor_id: safeRow.vendor_id || null,
    vendor_store_id: safeRow.vendor_store_id || vendorStore?.id || null,
    vendor_name: vendorStore?.store_name || vendor?.store_name || null,
    vendor_slug: vendorStore?.slug || vendor?.slug || vendor?.store_slug || null,
    vendor_logo_url: vendorStore?.logo_url || vendor?.logo_url || null,
    vendor_status: vendorStore?.status || vendor?.status || 'active',
    vendor_ships_to_argentina: shipsToArgentina,
    wave_name: waveName,
    weight_kg: safeRow.weight_kg != null ? Number(safeRow.weight_kg) : null,
    weight_grams:
      safeRow.weight_grams != null
        ? Number(safeRow.weight_grams)
        : safeRow.weight_kg != null
          ? Math.round(Number(safeRow.weight_kg) * 1000)
          : null,
    primary_image_url: primaryImage,
    images: images.slice(0, 10).map((img, idx) => ({
      id: img.id || `${safeRow.id}-img-${idx}`,
      url: img.url,
      alt_text: img.alt_text || safeRow.title,
      is_primary: Boolean(img.is_primary ?? idx === 0),
      sort_order: Number(img.sort_order ?? idx),
    })),
    media_variants: safeRow.media_variants || {},
    variants,
    tags: Array.isArray(safeRow.product_tags) ? safeRow.product_tags : [],
    category_ids: allCategoryIds,
    group_ids: groupIds,
    average_rating: Number(safeRow.average_rating ?? 0),
    reviews_count: Number(safeRow.reviews_count ?? 0),
    seo_title: safeRow.seo_title || safeRow.meta_title || safeRow.title,
    seo_description: safeRow.seo_description || safeRow.meta_description || safeRow.short_description || null,
    created_at: safeRow.created_at || new Date().toISOString(),
    updated_at: safeRow.updated_at || new Date().toISOString(),
  };
}

export function transformInternationalProductForD1(row, lookupMaps = {}) {
  const safeRow = stripPrivateFields(row);
  const rawGallery = Array.isArray(safeRow.images)
    ? safeRow.images
    : Array.isArray(safeRow.gallery_images)
      ? safeRow.gallery_images
      : Array.isArray(safeRow.image_urls_external)
        ? safeRow.image_urls_external
        : [];

  const images = rawGallery
    .slice(0, 8)
    .map((item, idx) =>
      typeof item === 'string'
        ? { id: `${safeRow.id}-intl-img-${idx}`, url: item, is_primary: idx === 0, sort_order: idx }
        : {
            id: item.id || `${safeRow.id}-intl-img-${idx}`,
            url: item.url,
            is_primary: Boolean(item.is_primary ?? idx === 0),
            sort_order: Number(item.sort_order ?? idx),
          }
    )
    .filter((img) => Boolean(img.url));

  const primaryImage =
    safeRow.image_url ||
    safeRow.main_image_url_external ||
    safeRow.main_image_url ||
    images[0]?.url ||
    null;

  if (primaryImage && images.length === 0) {
    images.push({
      id: `${safeRow.id}-intl-img-0`,
      url: primaryImage,
      is_primary: true,
      sort_order: 0,
    });
  }

  const finalUsd = Number(safeRow.final_price_usd ?? safeRow.base_price_usd ?? 0);
  const finalUyu = safeRow.final_price_uyu != null ? Number(safeRow.final_price_uyu) : null;
  const rawAvail = String(safeRow.availability || 'in_stock').trim().toLowerCase();
  const isAvailable =
    (rawAvail === 'in_stock' || rawAvail === 'available') && safeRow.status === 'published';

  // Resolver categoría y marca contra los mapas de taxonomías si están disponibles
  const catId = safeRow.collectibles_category_id || safeRow.category_id || null;
  const subcatId = safeRow.collectibles_subcategory_id || null;
  const categoryObj = catId ? lookupMaps.categories?.get(catId) : null;

  const normBrandText = String(safeRow.brand || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const matchedBrand =
    (safeRow.brand_id && lookupMaps.brands?.get(safeRow.brand_id)) ||
    (normBrandText && lookupMaps.brandsByName?.get(normBrandText)) ||
    null;

  const categoryIds = Array.from(new Set([catId, subcatId].filter(Boolean)));
  const externalSku = safeRow.sku || safeRow.external_sku || safeRow.external_product_id || null;

  // Variante sintética con inventory_count = 1 cuando está disponible para compatibilidad total con canonicalStock.ts
  const variants = [
    {
      id: `${safeRow.id}-intl`,
      sku: externalSku,
      name: 'Importación Directa',
      price_adjustment: 0,
      inventory_count: isAvailable ? 1 : 0,
      is_active: isAvailable,
    },
  ];

  // En `ProductDetail.tsx`, las fichas internacionales usan el UUID como slug (`/producto/<uuid>`)
  // salvo que tengan un slug explícito asignado.
  const canonicalIntlSlug = String(safeRow.slug || safeRow.id);

  return {
    id: String(safeRow.id),
    slug: canonicalIntlSlug,
    title: String(safeRow.title || '').trim(),
    description: safeRow.description ? String(safeRow.description).slice(0, SYNC_LIMITS.MAX_DESCRIPTION_CHARS) : null,
    short_description: safeRow.short_description ? String(safeRow.short_description).slice(0, 600) : null,
    sku: externalSku,
    asin: safeRow.asin || safeRow.external_product_id || null,
    external_product_id: safeRow.external_product_id || null,
    catalog_source: 'international',
    source_provider: safeRow.source_provider || 'zinc',
    source_market: safeRow.source_market || 'US',
    is_international: true,
    // Regla comercial estricta: productos internacionales en USD con referencia UYU
    currency: 'USD',
    price_currency: 'USD',
    base_price: finalUsd,
    compare_at_price: safeRow.amazon_list_price_usd != null ? Number(safeRow.amazon_list_price_usd) : null,
    final_price_usd: finalUsd,
    final_price_uyu: finalUyu,
    urubox_estimated_cost_usd: safeRow.urubox_estimated_cost_usd != null ? Number(safeRow.urubox_estimated_cost_usd) : null,
    total_estimated_cost_usd: safeRow.total_estimated_cost_usd != null ? Number(safeRow.total_estimated_cost_usd) : null,
    amazon_current_price_usd: safeRow.amazon_current_price_usd != null ? Number(safeRow.amazon_current_price_usd) : null,
    amazon_list_price_usd: safeRow.amazon_list_price_usd != null ? Number(safeRow.amazon_list_price_usd) : null,
    amazon_discount_percent: safeRow.amazon_discount_percent != null ? Number(safeRow.amazon_discount_percent) : null,
    amazon_prime: Boolean(safeRow.amazon_prime),
    status: safeRow.status || 'published',
    is_active: isAvailable,
    stock: isAvailable ? 1 : 0,
    stock_status: isAvailable ? 'in_stock' : 'unavailable',
    availability_type: 'international_import',
    condition: 'new',
    is_featured: Boolean(safeRow.is_featured),
    is_new_arrival: Boolean(safeRow.is_new_arrival),
    category_id: catId,
    category_slug: categoryObj?.slug || null,
    category_name: categoryObj?.name || safeRow.category || 'Coleccionables',
    brand_id: matchedBrand?.id || safeRow.brand_id || null,
    brand_slug: matchedBrand?.slug || (safeRow.brand ? String(safeRow.brand).toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'importado'),
    brand_name: matchedBrand?.name || safeRow.brand || 'Importado',
    license_id: safeRow.license_id || null,
    primary_image_url: primaryImage,
    images,
    variants,
    category_ids: categoryIds,
    average_rating: Number(safeRow.rating ?? 0),
    reviews_count: Number(safeRow.review_count ?? 0),
    weight_grams: safeRow.weight_grams != null ? Number(safeRow.weight_grams) : null,
    weight_kg: safeRow.weight_grams != null ? Number((Number(safeRow.weight_grams) / 1000).toFixed(3)) : null,
    seo_title: safeRow.title ? `${safeRow.title} | Importación Collectibles.uy` : null,
    seo_description: safeRow.description ? String(safeRow.description).slice(0, 160) : null,
    created_at: safeRow.created_at || new Date().toISOString(),
    updated_at: safeRow.updated_at || safeRow.last_synced_at || new Date().toISOString(),
    expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  };
}

/**
 * Construye las consultas PostgREST exactas garantizando uso de índice PK (`products_pkey` / `international_products_pkey`)
 * y cero joins laterales.
 */
export function buildKeysetHeaderQuery(
  lastIdCursor = '00000000-0000-0000-0000-000000000000',
  limit = SYNC_LIMITS.HEADER_SCAN_LIMIT
) {
  const safeLimit = Math.min(SYNC_LIMITS.HEADER_SCAN_LIMIT, Math.max(1, Number(limit) || 50));
  const cols = VERIFIED_LOCAL_PRODUCT_HEADER_COLS.join(',');
  return `products?select=${cols}&id=gt.${encodeURIComponent(lastIdCursor)}&order=id.asc&limit=${safeLimit}`;
}

export function buildHydrateProductsByPkQuery(ids) {
  const cleanIds = ids
    .slice(0, SYNC_LIMITS.HYDRATE_BATCH_SIZE)
    .map((id) => String(id).replace(/[^a-zA-Z0-9-]/g, ''));
  const cols = VERIFIED_LOCAL_PRODUCT_HYDRATE_COLS.join(',');
  return `products?select=${cols}&id=in.(${cleanIds.join(',')})`;
}

export function buildHydrateProductImagesByPkQuery(ids) {
  const cleanIds = ids
    .slice(0, SYNC_LIMITS.HYDRATE_BATCH_SIZE)
    .map((id) => String(id).replace(/[^a-zA-Z0-9-]/g, ''));
  return `product_images?select=id,product_id,url,alt_text,is_primary,sort_order&product_id=in.(${cleanIds.join(',')})&order=sort_order.asc`;
}

export function buildHydrateProductVariantsByPkQuery(ids) {
  const cleanIds = ids
    .slice(0, SYNC_LIMITS.HYDRATE_BATCH_SIZE)
    .map((id) => String(id).replace(/[^a-zA-Z0-9-]/g, ''));
  return `product_variants?select=id,product_id,sku,legacy_sku,name,price_adjustment,inventory_count,is_active&product_id=in.(${cleanIds.join(',')})`;
}

export function buildIntlKeysetHeaderQuery(
  lastIdCursor = '00000000-0000-0000-0000-000000000000',
  limit = SYNC_LIMITS.HEADER_SCAN_LIMIT
) {
  const safeLimit = Math.min(SYNC_LIMITS.HEADER_SCAN_LIMIT, Math.max(1, Number(limit) || 50));
  const cols = VERIFIED_INTL_PRODUCT_HEADER_COLS.join(',');
  return `international_products?select=${cols}&id=gt.${encodeURIComponent(lastIdCursor)}&order=id.asc&limit=${safeLimit}`;
}

export function buildHydrateIntlProductsByPkQuery(ids) {
  const cleanIds = ids
    .slice(0, SYNC_LIMITS.HYDRATE_BATCH_SIZE)
    .map((id) => String(id).replace(/[^a-zA-Z0-9-]/g, ''));
  const cols = VERIFIED_INTL_PRODUCT_HYDRATE_COLS.join(',');
  return `international_products?select=${cols}&id=in.(${cleanIds.join(',')})`;
}

/**
 * Construye las consultas exactas para la prueba acotada de máximo 10 productos reales (5 locales + 5 internacionales).
 */
export function buildTenProductProbeQueries() {
  return {
    preflightHealth: 'public_site_config?select=key&limit=1',
    localProducts5: `products?select=${VERIFIED_LOCAL_PRODUCT_HYDRATE_COLS.join(',')}&status=eq.published&is_active=eq.true&order=id.asc&limit=5`,
    intlProducts5: `international_products?select=${VERIFIED_INTL_PRODUCT_HYDRATE_COLS.join(',')}&status=eq.published&order=id.asc&limit=5`,
    localImagesForIds: (ids) => buildHydrateProductImagesByPkQuery(ids.slice(0, 5)),
    localVariantsForIds: (ids) => buildHydrateProductVariantsByPkQuery(ids.slice(0, 5)),
  };
}

export function checkSuspensionLock(suspendFile) {
  try {
    if (!fs.existsSync(suspendFile)) return { suspended: false };
    const raw = JSON.parse(fs.readFileSync(suspendFile, 'utf8'));
    if (raw.suspendedUntil && new Date(raw.suspendedUntil).getTime() > Date.now()) {
      return { suspended: true, reason: raw.reason, suspendedUntil: raw.suspendedUntil };
    }
    fs.unlinkSync(suspendFile);
  } catch {
    // ignore
  }
  return { suspended: false };
}

export function triggerSuspensionLock(suspendFile, reason, cooldownMs = SYNC_LIMITS.SUSPEND_COOLDOWN_MS) {
  const state = {
    suspendedAt: new Date().toISOString(),
    suspendedUntil: new Date(Date.now() + cooldownMs).toISOString(),
    reason,
  };
  try {
    fs.writeFileSync(suspendFile, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // ignore write error in read-only fs
  }
  return state;
}

export async function fetchSupabaseWithStrictGuards(supabaseUrl, serviceKey, relativePath, options = {}) {
  const maxLatencyMs = options.maxLatencyMs ?? SYNC_LIMITS.HARD_LATENCY_ABORT_MS;
  const maxBytes = options.maxBytes ?? SYNC_LIMITS.MAX_RESPONSE_BYTES;
  const fetchImpl = options.fetcher ?? fetch;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxLatencyMs + 500);

  try {
    const res = await fetchImpl(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${relativePath}`, {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const elapsed = Date.now() - startedAt;

    if (!res.ok) {
      throw Object.assign(new Error(`Supabase HTTP ${res.status} after ${elapsed}ms`), {
        code: 'SUPABASE_HTTP_ERROR',
        status: res.status,
        elapsed,
      });
    }

    const rawText = await res.text();
    const byteLength = Buffer.byteLength(rawText, 'utf8');

    if (byteLength > maxBytes) {
      throw Object.assign(
        new Error(`Response payload (${byteLength} bytes) exceeded safety cap (${maxBytes} bytes)`),
        { code: 'PAYLOAD_TOO_LARGE', byteLength, elapsed }
      );
    }

    if (elapsed > maxLatencyMs) {
      throw Object.assign(
        new Error(`Circuit Breaker tripped: latency ${elapsed}ms > ${maxLatencyMs}ms threshold`),
        { code: 'LATENCY_EXCEEDED', elapsed }
      );
    }

    return {
      data: JSON.parse(rawText),
      elapsed,
      byteLength,
      degradedLatency: elapsed > SYNC_LIMITS.SOFT_LATENCY_THRESHOLD_MS,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ejecuta en memoria una simulación / prueba de lectura de hasta 10 productos (5 locales + 5 internacionales)
 * con interrupción inmediata ante timeout o latencia elevada, sin escribir en D1 (`dryRun: true`).
 */
export async function executeControlledTenProductReadProbe({
  supabaseUrl,
  serviceKey,
  fetcher = fetch,
  suspendFile = path.resolve(process.cwd(), '.d1-sync-suspend.json'),
}) {
  const lock = checkSuspensionLock(suspendFile);
  if (lock.suspended) {
    throw new Error(`Sync suspended until ${lock.suspendedUntil}: ${lock.reason}`);
  }

  const queries = buildTenProductProbeQueries();
  const telemetry = [];

  // 1. Pre-flight health check (< 1200 ms)
  const preflight = await fetchSupabaseWithStrictGuards(supabaseUrl, serviceKey, queries.preflightHealth, {
    maxLatencyMs: SYNC_LIMITS.PREFLIGHT_MAX_LATENCY_MS,
    fetcher,
  });
  telemetry.push({ step: 'preflight_health', query: queries.preflightHealth, elapsedMs: preflight.elapsed, bytes: preflight.byteLength });

  // 2. Lectura acotada de hasta 5 productos locales publicados
  const localRes = await fetchSupabaseWithStrictGuards(supabaseUrl, serviceKey, queries.localProducts5, {
    maxLatencyMs: SYNC_LIMITS.HARD_LATENCY_ABORT_MS,
    fetcher,
  });
  telemetry.push({ step: 'local_products_5', query: queries.localProducts5, elapsedMs: localRes.elapsed, bytes: localRes.byteLength });

  const localRows = Array.isArray(localRes.data) ? localRes.data.slice(0, 5) : [];
  const localIds = localRows.map((r) => r.id).filter(Boolean);

  const imagesByProduct = new Map();
  const variantsByProduct = new Map();

  if (localIds.length > 0) {
    const imgQuery = queries.localImagesForIds(localIds);
    const imgRes = await fetchSupabaseWithStrictGuards(supabaseUrl, serviceKey, imgQuery, {
      maxLatencyMs: SYNC_LIMITS.HARD_LATENCY_ABORT_MS,
      fetcher,
    });
    telemetry.push({ step: 'local_images_5', query: imgQuery, elapsedMs: imgRes.elapsed, bytes: imgRes.byteLength });
    for (const img of imgRes.data || []) {
      const list = imagesByProduct.get(img.product_id) || [];
      list.push(img);
      imagesByProduct.set(img.product_id, list);
    }

    const varQuery = queries.localVariantsForIds(localIds);
    const varRes = await fetchSupabaseWithStrictGuards(supabaseUrl, serviceKey, varQuery, {
      maxLatencyMs: SYNC_LIMITS.HARD_LATENCY_ABORT_MS,
      fetcher,
    });
    telemetry.push({ step: 'local_variants_5', query: varQuery, elapsedMs: varRes.elapsed, bytes: varRes.byteLength });
    for (const v of varRes.data || []) {
      const list = variantsByProduct.get(v.product_id) || [];
      list.push(v);
      variantsByProduct.set(v.product_id, list);
    }
  }

  // 3. Lectura acotada de hasta 5 productos internacionales publicados
  const intlRes = await fetchSupabaseWithStrictGuards(supabaseUrl, serviceKey, queries.intlProducts5, {
    maxLatencyMs: SYNC_LIMITS.HARD_LATENCY_ABORT_MS,
    fetcher,
  });
  telemetry.push({ step: 'intl_products_5', query: queries.intlProducts5, elapsedMs: intlRes.elapsed, bytes: intlRes.byteLength });
  const intlRows = Array.isArray(intlRes.data) ? intlRes.data.slice(0, 5) : [];

  // 4. Transformación en memoria hacia esquema D1 (CERO escrituras a D1)
  const transformedLocal = localRows.map((r) =>
    transformLocalProductForD1(r, { imagesByProduct, variantsByProduct })
  );
  const transformedIntl = intlRows.map((r) => transformInternationalProductForD1(r));

  return {
    ok: true,
    dryRun: true,
    writtenToD1: 0,
    totalRead: transformedLocal.length + transformedIntl.length,
    localCount: transformedLocal.length,
    internationalCount: transformedIntl.length,
    telemetry,
    transformedLocal,
    transformedIntl,
  };
}

/**
 * Genera la firma HMAC-SHA256 (`X-Catalog-Signature`) requerida por el Worker `/api/v1/internal/sync`
 * sin exponer ni imprimir jamás `CATALOG_SYNC_SECRET`.
 */
export async function computeSyncSignatureHmac(secret, timestampMs, rawBody) {
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', String(secret))
    .update(`${timestampMs}.${rawBody}`)
    .digest('hex');
}

/**
 * Envía un lote autenticado al Worker D1 (`/api/v1/internal/sync`) cuando `dryRun === false`.
 */
export async function pushBatchToD1Worker({
  workerUrl,
  syncSecret,
  payload,
  dryRun = true,
  fetcher = fetch,
}) {
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      writtenToD1: 0,
      batch_id: payload?.batch_id || 'dry-run',
    };
  }
  if (!syncSecret || String(syncSecret).length < 16) {
    throw new Error('Missing or invalid CATALOG_SYNC_SECRET in environment');
  }
  const rawBody = JSON.stringify(payload);
  const timestampMs = String(Date.now());
  const signature = await computeSyncSignatureHmac(syncSecret, timestampMs, rawBody);

  const res = await fetcher(`${workerUrl.replace(/\/+$/, '')}/api/v1/internal/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${syncSecret}`,
      'X-Catalog-Timestamp': timestampMs,
      'X-Catalog-Signature': signature,
    },
    body: rawBody,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Worker sync HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  return res.json();
}

