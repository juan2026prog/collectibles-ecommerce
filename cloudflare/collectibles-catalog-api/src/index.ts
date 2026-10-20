/**
 * Collectibles Public Catalog API — Cloudflare Worker + D1
 *
 * Responsabilidad:
 * 1. Atender el 100% de las lecturas públicas (listados, facetas, fichas, taxonomías,
 *    búsqueda, promociones, radar, configuración pública, sitemaps y feeds SEO/Merchant/Meta).
 * 2. Exponer control de activación y rollback en tiempo de ejecución (`/api/v1/runtime-config`
 *    y `POST /api/v1/internal/runtime-mode`) para conmutar en < 1s sin reconstruir el bundle Vite.
 * 3. Blindar el canal privado de sincronización (`POST /api/v1/internal/sync` y
 *    `POST /api/v1/internal/diff-check`) con comparación criptográfica en tiempo constante,
 *    ventana anti-replay, límite de lote y filtro estricto anti-datos privados/PII.
 * 4. Preservar la regla comercial inmutable: UYU para stock local/vendedores Uruguay,
 *    USD para catálogo internacional publicado.
 */

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<{ success: boolean; meta?: Record<string, unknown>; results?: T[] }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta?: Record<string, unknown> }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<{ results?: T[]; success: boolean }>>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface Env {
  DB: D1Database;
  CATALOG_SYNC_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  DEFAULT_PAGE_SIZE?: string;
  MAX_PAGE_SIZE?: string;
  ENVIRONMENT?: string;
  CATALOG_RUNTIME_ENABLED?: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface RuntimeRoutingConfig {
  enabled: boolean;
  mode: 'active' | 'disabled' | 'degraded';
  domains: {
    products: boolean;
    productDetail: boolean;
    taxonomies: boolean;
    search: boolean;
    promotions: boolean;
    radar: boolean;
    settings: boolean;
    feeds: boolean;
  };
  updated_at: string;
  reason?: string;
}

const DEFAULT_RUNTIME_CONFIG: RuntimeRoutingConfig = {
  enabled: true,
  mode: 'active',
  domains: {
    products: true,
    productDetail: true,
    taxonomies: true,
    search: true,
    promotions: true,
    radar: true,
    settings: true,
    feeds: true,
  },
  updated_at: '2026-10-20T00:00:00.000Z',
};

const CACHE_POLICIES = {
  health: 'public, max-age=10, s-maxage=20',
  runtimeConfig: 'public, max-age=5, s-maxage=10, stale-while-revalidate=30',
  productsList: 'public, max-age=30, s-maxage=120, stale-while-revalidate=600',
  productDetail: 'public, max-age=30, s-maxage=180, stale-while-revalidate=900',
  taxonomies: 'public, max-age=120, s-maxage=600, stale-while-revalidate=3600',
  search: 'public, max-age=20, s-maxage=60, stale-while-revalidate=300',
  promotions: 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
  radar: 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800',
  settings: 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800',
  feeds: 'public, max-age=300, s-maxage=1800, stale-while-revalidate=7200',
  noStore: 'no-store, no-cache, must-revalidate',
} as const;

const MAX_SYNC_PAYLOAD_BYTES = 1_048_576; // 1 MB max por lote
const MAX_SYNC_ITEMS_PER_BATCH = 50;
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Lista negra de campos privados, financieros internos o PII que JAMÁS pueden almacenarse en D1.
 */
export const FORBIDDEN_PRIVATE_FIELDS = new Set([
  'real_cost_usd',
  'expected_profit_usd',
  'acquisition_cost_usd',
  'cost_price',
  'wholesale_price',
  'supplier_url',
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

export function sanitizePublicRecord<T extends Record<string, any>>(record: T): T {
  if (!record || typeof record !== 'object') return record;
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(record)) {
    if (FORBIDDEN_PRIVATE_FIELDS.has(k)) continue;
    clean[k] = v;
  }
  return clean as T;
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeSearchQuery(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function clampInt(value: string | null, defaultValue: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowedList = (env.ALLOWED_ORIGINS || 'https://collectibles.uy,https://www.collectibles.uy,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin = allowedList.includes(origin) || origin.endsWith('.vercel.app')
    ? origin
    : allowedList[0] || 'https://collectibles.uy';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Catalog-Client, X-Sync-Timestamp, If-None-Match',
    'Access-Control-Expose-Headers': 'X-Catalog-Mode, X-Catalog-Kill-Switch, X-Catalog-Cache, X-Catalog-Source',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  cacheControl: string,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {}
): Response {
  const payload = JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

/**
 * Comparación criptográfica en tiempo constante sobre hashes SHA-256 para evitar
 * filtración de longitud o ataques de timing en el canal privado de sincronización.
 */
async function verifySecretConstantTime(provided: string, expected: string): Promise<boolean> {
  if (!provided || !expected || expected.length < 24) return false;
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);
  let diff = provided.length === expected.length ? 0 : 1;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

async function getRuntimeRoutingConfig(env: Env): Promise<RuntimeRoutingConfig> {
  try {
    const row = await env.DB.prepare(
      "SELECT value_json, updated_at FROM public_site_settings WHERE key = 'runtime_routing_config' LIMIT 1"
    ).first<{ value_json: string; updated_at: string }>();
    if (row?.value_json) {
      const parsed = parseJsonSafe<Partial<RuntimeRoutingConfig>>(row.value_json, {});
      return {
        enabled: parsed.enabled !== false,
        mode: parsed.enabled === false ? 'disabled' : (parsed.mode || 'active'),
        domains: { ...DEFAULT_RUNTIME_CONFIG.domains, ...(parsed.domains || {}) },
        updated_at: row.updated_at || DEFAULT_RUNTIME_CONFIG.updated_at,
        reason: parsed.reason,
      };
    }
  } catch {
    // Si la tabla aún no existe o falla, evaluar variable de entorno o default
  }
  if (env.CATALOG_RUNTIME_ENABLED === 'false' || env.CATALOG_RUNTIME_ENABLED === '0') {
    return {
      ...DEFAULT_RUNTIME_CONFIG,
      enabled: false,
      mode: 'disabled',
      reason: 'Disabled via Worker environment variable CATALOG_RUNTIME_ENABLED (empty catalog guard)',
    };
  }
  return DEFAULT_RUNTIME_CONFIG;
}

/**
 * Transforma una fila de `public_products` en D1 al formato exacto esperado por el frontend
 * y las funciones de Collectibles (`ProductCard`, `ProductDetail`, `useProducts`, `StorefrontSearchBar`).
 * Preserva estrictamente `UYU` para productos locales y `USD` para internacionales.
 */
export function mapD1RowToPublicProduct(row: Record<string, any>, detailed = false) {
  const isIntl = Boolean(row.is_international);
  const canonicalCurrency: 'UYU' | 'USD' = isIntl ? 'USD' : (row.currency === 'USD' ? 'USD' : 'UYU');
  const images = parseJsonSafe<any[]>(row.images_json, []);
  const primaryImg = row.primary_image_url || images.find((i: any) => i?.is_primary)?.url || images[0]?.url || null;
  const normalizedImages = images.length > 0
    ? images
    : primaryImg
      ? [{ id: `${row.id}-img0`, url: primaryImg, is_primary: true, sort_order: 0 }]
      : [];
  const mediaVariants = parseJsonSafe<Record<string, any>>(row.media_variants_json, {});
  const variants = parseJsonSafe<any[]>(row.variants_json, []);
  const categoryIds = parseJsonSafe<string[]>(row.category_ids_json, row.category_id ? [row.category_id] : []);
  const groupIds = parseJsonSafe<string[]>(row.group_ids_json, []);

  const categoryObj = row.category_id
    ? { id: row.category_id, name: row.category_name || '', slug: row.category_slug || '' }
    : null;
  const brandObj = row.brand_id
    ? { id: row.brand_id, name: row.brand_name || '', slug: row.brand_slug || '', logo_url: null }
    : isIntl
      ? { id: 'intl', name: row.brand_name || 'Importado', slug: row.brand_slug || 'importado', logo_url: null }
      : null;
  const vendorObj = row.vendor_id
    ? {
        id: row.vendor_id,
        store_name: row.vendor_name || 'Vendedor',
        slug: row.vendor_slug || '',
        store_slug: row.vendor_slug || '',
        logo_url: row.vendor_logo_url || null,
        status: row.vendor_status || 'active',
        ships_to_argentina: Boolean(row.vendor_ships_to_argentina),
      }
    : null;
  const vendorStoreObj = row.vendor_store_id
    ? {
        id: row.vendor_store_id,
        store_name: row.vendor_name || 'Tienda Oficial',
        slug: row.vendor_slug || '',
        store_slug: row.vendor_slug || '',
        logo_url: row.vendor_logo_url || null,
        status: row.vendor_status || 'active',
        is_official: true,
      }
    : null;

  const basePrice = Number(row.base_price ?? 0);
  const finalPriceUsd = row.final_price_usd != null ? Number(row.final_price_usd) : (isIntl ? basePrice : null);
  const finalPriceUyu = row.final_price_uyu != null ? Number(row.final_price_uyu) : (!isIntl ? basePrice : null);

  const baseCard: Record<string, any> = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    sku: row.sku || null,
    asin: row.asin || null,
    external_product_id: row.external_product_id || null,
    catalog_source: row.catalog_source || (isIntl ? 'international' : 'local'),
    source_provider: row.source_provider || (isIntl ? 'amazon' : 'platform'),
    source_market: row.source_market || (isIntl ? 'US' : 'UY'),
    is_international: isIntl,
    // Regla comercial inmutable: UYU para local Uruguay, USD para internacional
    currency: canonicalCurrency,
    price_currency: canonicalCurrency,
    base_price: basePrice,
    price: basePrice,
    compare_at_price: row.compare_at_price != null ? Number(row.compare_at_price) : null,
    final_price_usd: finalPriceUsd,
    final_price_uyu: finalPriceUyu,
    urubox_estimated_cost_usd: row.urubox_estimated_cost_usd != null ? Number(row.urubox_estimated_cost_usd) : null,
    total_estimated_cost_usd: row.total_estimated_cost_usd != null ? Number(row.total_estimated_cost_usd) : null,
    amazon_current_price_usd: row.amazon_current_price_usd != null ? Number(row.amazon_current_price_usd) : null,
    amazon_list_price_usd: row.amazon_list_price_usd != null ? Number(row.amazon_list_price_usd) : null,
    amazon_discount_percent: row.amazon_discount_percent != null ? Number(row.amazon_discount_percent) : null,
    amazon_prime: Boolean(row.amazon_prime),
    status: row.status || 'published',
    is_active: Boolean(row.is_active),
    stock: Number(row.stock ?? 0),
    stock_status: row.stock_status || (Number(row.stock ?? 0) > 0 ? 'in_stock' : 'out_of_stock'),
    availability_type: row.availability_type || 'immediate',
    is_preorder: Boolean(row.is_preorder),
    preorder_eta: row.preorder_eta || null,
    release_date: row.release_date || null,
    condition: row.condition || 'new',
    is_featured: Boolean(row.is_featured),
    is_new_arrival: Boolean(row.is_new_arrival),
    category_id: row.category_id || null,
    category_ids: categoryIds,
    group_ids: groupIds,
    brand_id: row.brand_id || null,
    license_id: row.license_id || null,
    theme_id: row.theme_id || null,
    vendor_id: row.vendor_id || null,
    vendor_store_id: row.vendor_store_id || null,
    wave_name: row.wave_name || null,
    primary_image_url: primaryImg,
    image_url: primaryImg,
    // Alias duales para compatibilidad total con todos los componentes de React
    images: normalizedImages,
    product_images: normalizedImages,
    variants: variants,
    product_variants: variants,
    media_variants: mediaVariants,
    average_rating: Number(row.average_rating ?? 0),
    reviews_count: Number(row.reviews_count ?? 0),
    category: categoryObj,
    categories: categoryObj,
    brand: brandObj,
    brands: brandObj,
    vendor: vendorObj,
    vendors: vendorObj,
    vendor_store: vendorStoreObj,
    ...(isIntl
      ? {
          raw_international_data: {
            id: row.id,
            title: row.title,
            final_price_usd: finalPriceUsd,
            final_price_uyu: finalPriceUyu,
            amazon_list_price_usd: row.amazon_list_price_usd,
            image_url: primaryImg,
            status: row.status || 'published',
          },
          international_products: [
            {
              id: row.id,
              title: row.title,
              final_price_usd: finalPriceUsd,
              final_price_uyu: finalPriceUyu,
              image_url: primaryImg,
              status: row.status || 'published',
            },
          ],
        }
      : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (!detailed) {
    return baseCard;
  }

  return {
    ...baseCard,
    description: row.description || '',
    short_description: row.short_description || '',
    ean: row.ean || null,
    weight_kg: row.weight_kg != null ? Number(row.weight_kg) : null,
    weight_grams: row.weight_grams != null ? Number(row.weight_grams) : null,
    product_tags: parseJsonSafe<any[]>(row.tags_json, []),
    buybox: parseJsonSafe<any[]>(row.buybox_json, []),
    payment_restrictions: parseJsonSafe<any[]>(row.payment_restrictions_json, []),
    reviews: parseJsonSafe<any[]>(row.reviews_preview_json, []),
    seo_title: row.seo_title || row.title,
    seo_description: row.seo_description || row.short_description || '',
  };
}

/**
 * Construye una consulta SQL parametrizada sobre `public_products` para listados, filtros y búsqueda.
 */
function buildProductsFilterSql(params: URLSearchParams) {
  const whereClauses: string[] = ['p.is_active = 1', "p.status = 'published'"];
  const bindings: unknown[] = [];

  // Filtro local vs internacional (soporta `availability=local|international|all` y `is_international`)
  const availabilityParam = params.get('availability');
  const isIntlParam = params.get('is_international') ?? params.get('international') ?? params.get('isInternational');
  const catalogSource = params.get('catalog_source') ?? params.get('source');

  if (
    availabilityParam === 'international' ||
    catalogSource === 'international' ||
    isIntlParam === 'true' ||
    isIntlParam === '1'
  ) {
    whereClauses.push('p.is_international = 1');
  } else if (
    availabilityParam === 'local' ||
    catalogSource === 'local' ||
    isIntlParam === 'false' ||
    isIntlParam === '0'
  ) {
    whereClauses.push('p.is_international = 0');
  }

  // Categoría (soporta ID, lista de IDs o slug)
  const categoryId = params.get('category_id') || params.get('categoryId');
  const categoryIdsRaw = params.get('category_ids') || params.get('categoryIds');
  const categorySlug = params.get('category_slug') || params.get('category');

  if (categoryIdsRaw) {
    const ids = categoryIdsRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 25);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(', ');
      whereClauses.push(
        `(p.category_id IN (${placeholders}) OR EXISTS (SELECT 1 FROM public_product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${placeholders})))`
      );
      bindings.push(...ids, ...ids);
    }
  } else if (categoryId) {
    whereClauses.push(
      '(p.category_id = ? OR EXISTS (SELECT 1 FROM public_product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?))'
    );
    bindings.push(categoryId, categoryId);
  } else if (categorySlug) {
    whereClauses.push('(p.category_slug = ? OR p.category_id = ?)');
    bindings.push(categorySlug, categorySlug);
  }

  // Marca
  const brandId = params.get('brand_id') || params.get('brandId');
  const brandSlug = params.get('brand_slug') || params.get('brand');
  if (brandId) {
    whereClauses.push('p.brand_id = ?');
    bindings.push(brandId);
  } else if (brandSlug) {
    whereClauses.push('(p.brand_slug = ? OR p.brand_id = ?)');
    bindings.push(brandSlug, brandSlug);
  }

  // Licencia y Tema
  const licenseId = params.get('license_id') || params.get('licenseId');
  const licenseSlug = params.get('license_slug') || params.get('license');
  if (licenseId) {
    whereClauses.push('p.license_id = ?');
    bindings.push(licenseId);
  } else if (licenseSlug) {
    whereClauses.push('(p.license_slug = ? OR p.license_id = ?)');
    bindings.push(licenseSlug, licenseSlug);
  }

  const themeId = params.get('theme_id') || params.get('themeId');
  const themeSlug = params.get('theme_slug') || params.get('theme');
  if (themeId) {
    whereClauses.push('p.theme_id = ?');
    bindings.push(themeId);
  } else if (themeSlug) {
    whereClauses.push('(p.theme_slug = ? OR p.theme_id = ?)');
    bindings.push(themeSlug, themeSlug);
  }

  // Vendedor / Tienda
  const vendorId = params.get('vendor_id') || params.get('vendorId');
  const vendorStoreId = params.get('vendor_store_id') || params.get('vendorStoreId');
  const vendorSlug = params.get('vendor_slug') || params.get('store');
  if (vendorId) {
    whereClauses.push('p.vendor_id = ?');
    bindings.push(vendorId);
  }
  if (vendorStoreId) {
    whereClauses.push('p.vendor_store_id = ?');
    bindings.push(vendorStoreId);
  }
  if (vendorSlug) {
    whereClauses.push('p.vendor_slug = ?');
    bindings.push(vendorSlug);
  }

  // Wave / Colección / Destacados / Stock
  const waveName = params.get('wave_name') || params.get('wave');
  if (waveName) {
    whereClauses.push('p.wave_name = ?');
    bindings.push(waveName);
  }

  const groupId = params.get('group_id') || params.get('groupId') || params.get('group');
  if (groupId) {
    whereClauses.push('p.group_ids_json LIKE ?');
    bindings.push(`%"${groupId.replace(/["%_]/g, '')}"%`);
  }

  if (params.get('featured') === 'true' || params.get('is_featured') === 'true') {
    whereClauses.push('p.is_featured = 1');
  }
  if (params.get('new_arrivals') === 'true' || params.get('is_new_arrival') === 'true') {
    whereClauses.push('p.is_new_arrival = 1');
  }
  if (params.get('in_stock') === 'true' || params.get('only_in_stock') === 'true') {
    whereClauses.push("(p.stock > 0 OR p.stock_status IN ('in_stock', 'low_stock', 'preorder'))");
  }

  // Condición
  const conditionParam = params.get('condition');
  if (conditionParam === 'new') {
    whereClauses.push("(p.condition LIKE 'new%' OR p.condition IS NULL)");
  } else if (conditionParam === 'used') {
    whereClauses.push("p.condition LIKE 'used%'");
  } else if (conditionParam === 'loose') {
    whereClauses.push("p.condition LIKE 'loose%'");
  }

  // Rango de precios
  const minPrice = Number(params.get('min_price') || params.get('minPrice'));
  if (Number.isFinite(minPrice) && minPrice > 0) {
    whereClauses.push('p.base_price >= ?');
    bindings.push(minPrice);
  }
  const maxPrice = Number(params.get('max_price') || params.get('maxPrice'));
  if (Number.isFinite(maxPrice) && maxPrice > 0) {
    whereClauses.push('p.base_price <= ?');
    bindings.push(maxPrice);
  }

  // Lista explícita de IDs
  const idsParam = params.get('ids');
  if (idsParam) {
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 60);
    if (ids.length > 0) {
      whereClauses.push(`p.id IN (${ids.map(() => '?').join(', ')})`);
      bindings.push(...ids);
    }
  }

  // Búsqueda textual tokenizada sobre `search_text` / `title`
  const qRaw = params.get('q') || params.get('search') || '';
  const qNorm = normalizeSearchQuery(qRaw);
  if (qNorm) {
    const tokens = qNorm.split(' ').filter((t) => t.length >= 2).slice(0, 6);
    for (const token of tokens) {
      whereClauses.push("(p.search_text LIKE ? OR LOWER(p.title) LIKE ? OR LOWER(COALESCE(p.brand_name, '')) LIKE ?)");
      const pattern = `%${token}%`;
      bindings.push(pattern, pattern, pattern);
    }
  }

  // Ordenamiento seguro (whitelist compatible con `sortBy` de useData.ts y `sort` de API v1)
  const sort = params.get('sort') || params.get('sortBy') || params.get('order_by') || 'default';
  let orderBySql = 'p.is_international ASC, p.is_featured DESC, p.created_at DESC';
  switch (sort) {
    case 'price_asc':
    case 'price-asc':
    case 'price-low':
      orderBySql = 'p.base_price ASC, p.created_at DESC';
      break;
    case 'price_desc':
    case 'price-desc':
    case 'price-high':
      orderBySql = 'p.base_price DESC, p.created_at DESC';
      break;
    case 'title_asc':
    case 'name_asc':
    case 'name':
      orderBySql = 'p.title COLLATE NOCASE ASC';
      break;
    case 'rating_desc':
      orderBySql = 'p.average_rating DESC, p.reviews_count DESC';
      break;
    case 'updated_desc':
      orderBySql = 'p.updated_at DESC';
      break;
    case 'newest':
      orderBySql = 'p.created_at DESC';
      break;
    case 'default':
    case 'relevance':
    default:
      orderBySql = 'p.is_international ASC, p.is_featured DESC, p.created_at DESC';
      break;
  }

  return {
    whereSql: whereClauses.join(' AND '),
    bindings,
    orderBySql,
  };
}

async function handleHealth(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const startedAt = Date.now();
  const runtimeCfg = await getRuntimeRoutingConfig(env);
  try {
    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) as total_products FROM public_products WHERE is_active = 1 AND status = 'published'"
    ).first<{ total_products: number }>();

    const syncRow = await env.DB.prepare(
      'SELECT entity_type, last_sync_at, last_sync_status FROM sync_state ORDER BY last_sync_at DESC LIMIT 1'
    ).first<{ entity_type: string; last_sync_at: string; last_sync_status: string }>();

    return jsonResponse(
      {
        ok: true,
        service: 'collectibles-catalog-api',
        storage: 'cloudflare-d1',
        runtime_mode: runtimeCfg.mode,
        runtime_enabled: runtimeCfg.enabled,
        domains: runtimeCfg.domains,
        latency_ms: Date.now() - startedAt,
        published_products: Number(countRow?.total_products ?? 0),
        last_sync: syncRow || null,
        timestamp: new Date().toISOString(),
      },
      200,
      CACHE_POLICIES.health,
      corsHeaders,
      { 'X-Catalog-Mode': runtimeCfg.mode }
    );
  } catch {
    return jsonResponse(
      {
        ok: true,
        service: 'collectibles-catalog-api',
        storage: 'cloudflare-d1',
        schema_initialized: false,
        runtime_mode: runtimeCfg.mode,
        runtime_enabled: runtimeCfg.enabled,
        latency_ms: Date.now() - startedAt,
        note: 'D1 reachable; awaiting initial schema migration.',
        timestamp: new Date().toISOString(),
      },
      200,
      CACHE_POLICIES.noStore,
      corsHeaders,
      { 'X-Catalog-Mode': runtimeCfg.mode }
    );
  }
}

async function handleRuntimeConfigGet(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const cfg = await getRuntimeRoutingConfig(env);
  return jsonResponse(
    {
      ok: true,
      source: 'cloudflare-d1',
      ...cfg,
    },
    200,
    CACHE_POLICIES.runtimeConfig,
    corsHeaders,
    {
      'X-Catalog-Mode': cfg.mode,
      ...(cfg.enabled ? {} : { 'X-Catalog-Kill-Switch': 'active' }),
    }
  );
}

async function handleProductsList(
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const defaultLimit = Number.parseInt(env.DEFAULT_PAGE_SIZE || '24', 10) || 24;
  const maxLimit = Number.parseInt(env.MAX_PAGE_SIZE || '60', 10) || 60;
  const limit = clampInt(url.searchParams.get('limit') || url.searchParams.get('pageSize'), defaultLimit, 0, maxLimit);
  const page = clampInt(url.searchParams.get('page'), 1, 1, 1000);
  const offset = url.searchParams.has('offset')
    ? clampInt(url.searchParams.get('offset'), 0, 0, 50000)
    : (page - 1) * Math.max(1, limit);

  const { whereSql, bindings, orderBySql } = buildProductsFilterSql(url.searchParams);

  const countStmt = env.DB.prepare(`SELECT COUNT(*) as total FROM public_products p WHERE ${whereSql}`).bind(...bindings);
  const rowsStmt = env.DB.prepare(
    `SELECT
      p.id, p.slug, p.title, p.sku, p.asin, p.external_product_id,
      p.catalog_source, p.source_provider, p.source_market, p.is_international,
      p.currency, p.price_currency, p.base_price, p.compare_at_price,
      p.final_price_usd, p.final_price_uyu, p.urubox_estimated_cost_usd, p.total_estimated_cost_usd,
      p.amazon_current_price_usd, p.amazon_list_price_usd, p.amazon_discount_percent, p.amazon_prime,
      p.status, p.is_active, p.stock, p.stock_status, p.availability_type,
      p.is_preorder, p.preorder_eta, p.release_date, p.condition,
      p.is_featured, p.is_new_arrival,
      p.category_id, p.category_slug, p.category_name,
      p.brand_id, p.brand_slug, p.brand_name,
      p.license_id, p.license_slug, p.license_name,
      p.theme_id, p.theme_slug, p.theme_name,
      p.vendor_id, p.vendor_store_id, p.vendor_name, p.vendor_slug, p.vendor_logo_url,
      p.vendor_status, p.vendor_ships_to_argentina, p.wave_name,
      p.primary_image_url, p.images_json, p.media_variants_json, p.variants_json,
      p.category_ids_json, p.group_ids_json,
      p.average_rating, p.reviews_count, p.created_at, p.updated_at
     FROM public_products p
     WHERE ${whereSql}
     ORDER BY ${orderBySql}
     LIMIT ? OFFSET ?`
  ).bind(...bindings, Math.max(1, limit), offset);

  const [countRes, rowsRes] = await env.DB.batch<any>([countStmt, rowsStmt]);
  const total = Number(countRes?.results?.[0]?.total ?? 0);
  const products = limit === 0 ? [] : (rowsRes?.results || []).map((r) => mapD1RowToPublicProduct(r, false));

  return jsonResponse(
    {
      ok: true,
      source: 'cloudflare-d1',
      count: total,
      totalCount: total,
      products,
      items: products,
      image_variants: [],
      snapshot_meta: {
        stale: false,
        age_seconds: 0,
        severity: 'fresh',
        checkout_revalidation_required: false,
        cards_degraded: false,
      },
      pagination: {
        total,
        page,
        limit,
        offset,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 1,
        has_more: offset + products.length < total,
      },
    },
    200,
    CACHE_POLICIES.productsList,
    corsHeaders,
    { 'X-Catalog-Source': 'cloudflare-d1', 'X-Catalog-Mode': 'active' }
  );
}

async function handleProductDetail(
  slugOrId: string,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const cleanKey = decodeURIComponent(slugOrId || '').trim();
  if (!cleanKey || cleanKey.length > 200) {
    return jsonResponse({ ok: false, error: 'Invalid product identifier' }, 400, CACHE_POLICIES.noStore, corsHeaders);
  }

  let row = await env.DB.prepare(
    'SELECT * FROM public_products WHERE (slug = ? OR id = ?) AND is_active = 1 LIMIT 1'
  )
    .bind(cleanKey, cleanKey)
    .first<Record<string, any>>();

  // Verificar tabla de redirección de slugs si cambió el slug histórico
  if (!row) {
    const redirect = await env.DB.prepare(
      'SELECT new_slug, product_id FROM public_slug_redirects WHERE old_slug = ? LIMIT 1'
    )
      .bind(cleanKey)
      .first<{ new_slug: string; product_id: string | null }>();

    if (redirect) {
      row = await env.DB.prepare(
        'SELECT * FROM public_products WHERE (slug = ? OR id = ?) AND is_active = 1 LIMIT 1'
      )
        .bind(redirect.new_slug, redirect.product_id || '')
        .first<Record<string, any>>();

      if (row) {
        const product = mapD1RowToPublicProduct(row, true);
        return jsonResponse(
          {
            ok: true,
            source: 'cloudflare-d1',
            redirected_from: cleanKey,
            canonical_slug: row.slug,
            product,
          },
          200,
          CACHE_POLICIES.productDetail,
          corsHeaders
        );
      }
    }

    return jsonResponse({ ok: false, error: 'Product not found' }, 404, CACHE_POLICIES.noStore, corsHeaders);
  }

  const product = mapD1RowToPublicProduct(row, true);

  let waveProducts: any[] = [];
  if (row.wave_name) {
    const waveRes = await env.DB.prepare(
      `SELECT id, slug, title, currency, price_currency, base_price, final_price_usd, final_price_uyu,
              is_international, primary_image_url, images_json, media_variants_json, stock, stock_status,
              brand_id, brand_name, brand_slug, category_id, category_name, category_slug
       FROM public_products
       WHERE wave_name = ? AND id != ? AND is_active = 1 AND status = 'published'
       ORDER BY created_at DESC LIMIT 8`
    )
      .bind(row.wave_name, row.id)
      .all<Record<string, any>>();
    waveProducts = (waveRes.results || []).map((w) => mapD1RowToPublicProduct(w, false));
  }

  return jsonResponse(
    {
      ok: true,
      source: 'cloudflare-d1',
      product,
      wave_products: waveProducts,
    },
    200,
    CACHE_POLICIES.productDetail,
    corsHeaders
  );
}

/**
 * Devuelve taxonomías completas Y facetas compatibles con `/api/public-catalog?mode=facets`
 * (`taxonomies` + `facets`: `categoryFacets`, `brandFacets`, `licenseFacets`, `themeFacets`, `availabilityCounts`, `conditionCounts`).
 */
async function handleTaxonomiesAndFacets(
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const brandIdFilter = url.searchParams.get('brand_id') || url.searchParams.get('brandId');

  const statements: D1PreparedStatement[] = [
    env.DB.prepare('SELECT * FROM public_categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'),
    env.DB.prepare("SELECT * FROM public_brands WHERE is_active = 1 AND status = 'approved' ORDER BY sort_order ASC, name ASC"),
    env.DB.prepare('SELECT * FROM public_licenses WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'),
    env.DB.prepare('SELECT * FROM public_themes WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'),
    env.DB.prepare('SELECT license_id, theme_id FROM public_license_themes'),
    env.DB.prepare('SELECT * FROM public_product_groups WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'),
    env.DB.prepare(
      "SELECT id, category_id, brand_id, license_id, theme_id, is_international, condition FROM public_products WHERE is_active = 1 AND status = 'published'"
    ),
  ];

  if (brandIdFilter) {
    statements.push(
      env.DB.prepare('SELECT DISTINCT category_id FROM public_product_categories WHERE brand_id = ?').bind(brandIdFilter)
    );
  }

  const batchResults = await env.DB.batch<any>(statements);

  const categories = batchResults[0]?.results || [];
  const brands = batchResults[1]?.results || [];
  const licenses = batchResults[2]?.results || [];
  const themes = batchResults[3]?.results || [];
  const licenseThemes = batchResults[4]?.results || [];
  const productGroups = (batchResults[5]?.results || []).map((g: any) => ({
    ...g,
    product_ids: parseJsonSafe<string[]>(g.product_ids_json, []),
  }));
  const activeProducts = batchResults[6]?.results || [];
  const brandCategoryIds = brandIdFilter
    ? (batchResults[7]?.results || []).map((r: any) => r.category_id)
    : undefined;

  // Calcular facetas en memoria sobre las filas proyectadas
  const categoryCounts: Record<string, number> = {};
  const brandCounts = new Map<string, number>();
  const licenseCounts = new Map<string, number>();
  const themeCounts = new Map<string, number>();
  const availabilityCounts = { all: 0, local: 0, international: 0 };
  const conditionCounts = { all: 0, new: 0, used: 0, loose: 0 };

  for (const c of categories) {
    categoryCounts[c.id] = Number(c.product_count_local ?? 0) + Number(c.product_count_intl ?? 0);
  }

  for (const p of activeProducts) {
    availabilityCounts.all += 1;
    if (p.is_international) availabilityCounts.international += 1;
    else availabilityCounts.local += 1;

    const cond = String(p.condition || 'new');
    conditionCounts.all += 1;
    if (cond.startsWith('used')) conditionCounts.used += 1;
    else if (cond.startsWith('loose')) conditionCounts.loose += 1;
    else conditionCounts.new += 1;

    if (p.category_id) {
      categoryCounts[p.category_id] = (categoryCounts[p.category_id] || 0) + 1;
    }
    if (p.brand_id) {
      brandCounts.set(p.brand_id, (brandCounts.get(p.brand_id) || 0) + 1);
    }
    if (p.license_id) {
      licenseCounts.set(p.license_id, (licenseCounts.get(p.license_id) || 0) + 1);
    }
    if (p.theme_id) {
      themeCounts.set(p.theme_id, (themeCounts.get(p.theme_id) || 0) + 1);
    }
  }

  const facets = {
    categoryFacets: categoryCounts,
    brandFacets: brands
      .map((b: any) => ({
        brand_id: b.id,
        brand_name: b.name,
        brand_slug: b.slug,
        product_count: brandCounts.get(b.id) || 0,
      }))
      .filter((b: any) => b.product_count > 0),
    licenseFacets: licenses
      .map((l: any) => ({
        ...l,
        published_product_count: licenseCounts.get(l.id) || 0,
      }))
      .filter((l: any) => l.published_product_count > 0),
    themeFacets: themes
      .map((t: any) => ({
        ...t,
        published_product_count: themeCounts.get(t.id) || 0,
      }))
      .filter((t: any) => t.published_product_count > 0),
    availabilityCounts,
    conditionCounts,
    totalCatalogProducts: availabilityCounts.all,
  };

  return jsonResponse(
    {
      ok: true,
      source: 'cloudflare-d1',
      count: availabilityCounts.all,
      products: [],
      image_variants: [],
      categories,
      brands,
      licenses,
      themes,
      license_themes: licenseThemes,
      product_groups: productGroups,
      brand_category_ids: brandCategoryIds,
      taxonomies: {
        categories,
        brands,
        licenses,
        themes,
        license_themes: licenseThemes,
        product_groups: productGroups,
      },
      facets,
    },
    200,
    CACHE_POLICIES.taxonomies,
    corsHeaders
  );
}

async function handleSearch(
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const qRaw = url.searchParams.get('q') || '';
  const qNorm = normalizeSearchQuery(qRaw);
  const limit = clampInt(url.searchParams.get('limit'), 8, 1, 24);

  if (qNorm.length < 2) {
    return jsonResponse(
      { ok: true, source: 'cloudflare-d1', query: qRaw, products: [], stores: [], brands: [], categories: [] },
      200,
      CACHE_POLICIES.search,
      corsHeaders
    );
  }

  const { whereSql, bindings } = buildProductsFilterSql(url.searchParams);
  const likePattern = `%${qNorm}%`;

  const [prodRes, storeRes, brandRes, catRes] = await env.DB.batch<any>([
    env.DB.prepare(
      `SELECT id, slug, title, sku, currency, price_currency, base_price, compare_at_price,
              final_price_usd, final_price_uyu, is_international, stock, stock_status,
              primary_image_url, images_json, media_variants_json,
              category_id, category_name, category_slug, brand_id, brand_name, brand_slug,
              vendor_id, vendor_name, vendor_slug
       FROM public_products p
       WHERE ${whereSql}
       ORDER BY p.is_featured DESC, p.stock DESC, p.created_at DESC
       LIMIT ?`
    ).bind(...bindings, limit),
    env.DB.prepare(
      `SELECT id, vendor_id, store_name, store_slug, description, logo_url, banner_url, badges_json, rating
       FROM public_vendor_stores
       WHERE is_active = 1 AND status = 'active' AND (LOWER(store_name) LIKE ? OR LOWER(store_slug) LIKE ?)
       LIMIT 4`
    ).bind(likePattern, likePattern),
    env.DB.prepare(
      `SELECT id, name, slug, logo_url
       FROM public_brands
       WHERE is_active = 1 AND status = 'approved' AND LOWER(name) LIKE ?
       LIMIT 5`
    ).bind(likePattern),
    env.DB.prepare(
      `SELECT id, name, slug
       FROM public_categories
       WHERE is_active = 1 AND LOWER(name) LIKE ?
       LIMIT 5`
    ).bind(likePattern),
  ]);

  return jsonResponse(
    {
      ok: true,
      source: 'cloudflare-d1',
      query: qRaw,
      products: (prodRes?.results || []).map((r) => mapD1RowToPublicProduct(r, false)),
      stores: (storeRes?.results || []).map((s) => ({
        ...s,
        slug: s.store_slug,
        badges: parseJsonSafe<any[]>(s.badges_json, []),
      })),
      brands: brandRes?.results || [],
      categories: catRes?.results || [],
    },
    200,
    CACHE_POLICIES.search,
    corsHeaders
  );
}

async function handlePromotions(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const nowIso = new Date().toISOString();
  const res = await env.DB.prepare(
    `SELECT * FROM public_promotions
     WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= ?)
       AND (ends_at IS NULL OR ends_at >= ?)
     ORDER BY priority DESC`
  )
    .bind(nowIso, nowIso)
    .all<Record<string, any>>();

  const promotions = (res.results || []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    type: p.type,
    discount_type: p.type,
    value: Number(p.value ?? 0),
    discount_value: Number(p.value ?? 0),
    min_purchase_amount: p.min_purchase_amount != null ? Number(p.min_purchase_amount) : null,
    max_discount_amount: p.max_discount_amount != null ? Number(p.max_discount_amount) : null,
    starts_at: p.starts_at,
    ends_at: p.ends_at,
    is_active: Boolean(p.is_active),
    priority: Number(p.priority ?? 0),
    stackable: Boolean(p.stackable),
    is_stackable: Boolean(p.stackable),
    badge_text: p.badge_text,
    applies_to_all: Boolean(p.applies_to_all),
    promotion_targets: parseJsonSafe<any[]>(p.targets_json, []),
    promotion_exclusions: parseJsonSafe<any[]>(p.exclusions_json, []),
    promotion_tiers: parseJsonSafe<any[]>(p.tiers_json, []),
    product_group_items: parseJsonSafe<any[]>(p.group_items_json, []),
  }));

  return jsonResponse(
    { ok: true, source: 'cloudflare-d1', promotions },
    200,
    CACHE_POLICIES.promotions,
    corsHeaders
  );
}

function mapD1RadarRow(row: Record<string, any>) {
  return {
    ...row,
    official_image_url: row.hero_image_url || row.official_image_url || null,
    release_date_start: row.release_date || row.release_date_start || null,
    date_display_text: row.estimated_quarter || row.release_date || null,
    expected_price_usd: row.msrp_usd != null ? Number(row.msrp_usd) : null,
    msrp: row.msrp_usd != null ? Number(row.msrp_usd) : null,
    summary: row.editorial_summary || row.description || null,
    radar_why: row.editorial_summary || null,
    is_published: true,
    is_featured: Boolean(row.is_featured),
    brand: row.brand_id ? { id: row.brand_id, name: row.brand_name || '', slug: row.brand_slug || '' } : null,
    license: row.license_id ? { id: row.license_id, name: row.license_name || '', slug: row.license_slug || '' } : null,
    gallery: parseJsonSafe<any[]>(row.gallery_json, []),
    milestones: parseJsonSafe<any[]>(row.milestones_json, []),
    release_milestones: parseJsonSafe<any[]>(row.milestones_json, []),
    related_products: parseJsonSafe<any[]>(row.related_products_json, []),
  };
}

async function handleRadar(
  url: URL,
  slug: string | null,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (slug) {
    const cleanSlug = decodeURIComponent(slug).trim();
    const row = await env.DB.prepare(
      'SELECT * FROM public_radar_releases WHERE (slug = ? OR id = ?) LIMIT 1'
    )
      .bind(cleanSlug, cleanSlug)
      .first<Record<string, any>>();

    if (!row) {
      return jsonResponse({ ok: false, error: 'Release not found' }, 404, CACHE_POLICIES.noStore, corsHeaders);
    }

    return jsonResponse(
      {
        ok: true,
        source: 'cloudflare-d1',
        release: mapD1RadarRow(row),
      },
      200,
      CACHE_POLICIES.radar,
      corsHeaders
    );
  }

  const limit = clampInt(url.searchParams.get('limit'), 50, 1, 120);
  const res = await env.DB.prepare(
    'SELECT * FROM public_radar_releases ORDER BY release_date ASC, hype_score DESC LIMIT ?'
  )
    .bind(limit)
    .all<Record<string, any>>();

  const releases = (res.results || []).map(mapD1RadarRow);

  return jsonResponse(
    { ok: true, source: 'cloudflare-d1', releases },
    200,
    CACHE_POLICIES.radar,
    corsHeaders
  );
}

async function handleSettings(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const [settingsRes, bannersRes, badgesRes] = await env.DB.batch<any>([
    env.DB.prepare('SELECT key, value_json, updated_at FROM public_site_settings'),
    env.DB.prepare('SELECT * FROM public_banners WHERE is_active = 1 ORDER BY sort_order ASC'),
    env.DB.prepare('SELECT * FROM public_badges WHERE is_active = 1'),
  ]);

  const settingsMap: Record<string, any> = {};
  for (const row of settingsRes?.results || []) {
    settingsMap[row.key] = parseJsonSafe(row.value_json, row.value_json);
  }

  return jsonResponse(
    {
      ok: true,
      source: 'cloudflare-d1',
      site_config: settingsMap['public_site_config'] || {},
      feature_toggles: settingsMap['feature_toggles'] || {},
      international_status: settingsMap['international_public_status'] || {
        international_enabled: true,
        pause_message: null,
      },
      international_markets: settingsMap['international_markets'] || [],
      runtime_routing_config: settingsMap['runtime_routing_config'] || DEFAULT_RUNTIME_CONFIG,
      banners: bannersRes?.results || [],
      badges: badgesRes?.results || [],
    },
    200,
    CACHE_POLICIES.settings,
    corsHeaders
  );
}

/**
 * Genera el feed XML de Google Merchant Center directamente desde D1 sin golpear Supabase.
 */
async function handleMerchantFeedXml(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const res = await env.DB.prepare(
    `SELECT id, slug, title, description, sku, ean, currency, base_price, stock, stock_status,
            condition, primary_image_url, brand_name, category_name, is_international
     FROM public_products
     WHERE is_active = 1 AND status = 'published' AND is_international = 0
     ORDER BY updated_at DESC
     LIMIT 5000`
  ).all<Record<string, any>>();

  const escapeXml = (str: string) =>
    (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const itemsXml = (res.results || [])
    .filter((p) => p.primary_image_url && Number(p.base_price) > 0)
    .map((p) => {
      const availability = Number(p.stock) > 0 || p.stock_status === 'in_stock' ? 'in_stock' : 'out_of_stock';
      const currency = p.currency === 'USD' ? 'USD' : 'UYU';
      const priceFormatted = `${Number(p.base_price).toFixed(2)} ${currency}`;
      return `    <item>
      <g:id>${escapeXml(String(p.id))}</g:id>
      <g:title>${escapeXml(String(p.title || '').slice(0, 150))}</g:title>
      <g:description>${escapeXml(String(p.description || p.title || '').slice(0, 1000))}</g:description>
      <g:link>https://collectibles.uy/producto/${escapeXml(String(p.slug))}</g:link>
      <g:image_link>${escapeXml(String(p.primary_image_url))}</g:image_link>
      <g:condition>${escapeXml(String(p.condition || 'new'))}</g:condition>
      <g:availability>${availability}</g:availability>
      <g:price>${priceFormatted}</g:price>
      <g:brand>${escapeXml(String(p.brand_name || 'Collectibles'))}</g:brand>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Collectibles.uy</title>
    <link>https://collectibles.uy</link>
    <description>Catálogo oficial Collectibles.uy</description>
${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': CACHE_POLICIES.feeds,
      'X-Feed-Source': 'cloudflare-d1',
      ...corsHeaders,
    },
  });
}

/**
 * Genera el feed CSV de Meta Commerce directamente desde D1 sin golpear Supabase.
 */
async function handleMetaFeedCsv(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const res = await env.DB.prepare(
    `SELECT id, slug, title, description, currency, base_price, stock, stock_status,
            condition, primary_image_url, brand_name
     FROM public_products
     WHERE is_active = 1 AND status = 'published' AND is_international = 0
     ORDER BY updated_at DESC
     LIMIT 5000`
  ).all<Record<string, any>>();

  const escapeCsv = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const header = 'id,title,description,availability,condition,price,link,image_link,brand';
  const lines = (res.results || [])
    .filter((p) => p.primary_image_url && Number(p.base_price) > 0)
    .map((p) => {
      const availability = Number(p.stock) > 0 || p.stock_status === 'in_stock' ? 'in stock' : 'out of stock';
      const currency = p.currency === 'USD' ? 'USD' : 'UYU';
      return [
        escapeCsv(p.id),
        escapeCsv(String(p.title || '').slice(0, 150)),
        escapeCsv(String(p.description || p.title || '').slice(0, 500)),
        escapeCsv(availability),
        escapeCsv(p.condition || 'new'),
        escapeCsv(`${Number(p.base_price).toFixed(2)} ${currency}`),
        escapeCsv(`https://collectibles.uy/producto/${p.slug}`),
        escapeCsv(p.primary_image_url),
        escapeCsv(p.brand_name || 'Collectibles'),
      ].join(',');
    });

  return new Response([header, ...lines].join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': CACHE_POLICIES.feeds,
      'X-Feed-Source': 'cloudflare-d1',
      ...corsHeaders,
    },
  });
}

/**
 * Genera datos de Sitemap XML desde D1 sin consultar Supabase.
 */
async function handleSitemapXml(url: URL, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const typeParam = (url.searchParams.get('type') || '').toLowerCase();
  const [prods, cats, brands] = await env.DB.batch<any>([
    env.DB.prepare("SELECT slug, updated_at FROM public_products WHERE is_active = 1 AND status = 'published' ORDER BY updated_at DESC LIMIT 10000"),
    env.DB.prepare('SELECT slug, updated_at FROM public_categories WHERE is_active = 1'),
    env.DB.prepare("SELECT slug, updated_at FROM public_brands WHERE is_active = 1 AND status = 'approved'"),
  ]);

  const urls: string[] = [];

  if (!typeParam || typeParam === 'pages' || typeParam === 'all') {
    urls.push(
      '  <url><loc>https://collectibles.uy/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>',
      '  <url><loc>https://collectibles.uy/tienda</loc><changefreq>daily</changefreq><priority>0.9</priority></url>'
    );
  }
  if (!typeParam || typeParam === 'categories' || typeParam === 'all') {
    for (const c of cats?.results || []) {
      urls.push(`  <url><loc>https://collectibles.uy/categoria/${encodeURIComponent(c.slug)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
    }
  }
  if (!typeParam || typeParam === 'brands' || typeParam === 'all') {
    for (const b of brands?.results || []) {
      urls.push(`  <url><loc>https://collectibles.uy/marca/${encodeURIComponent(b.slug)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
    }
  }
  if (!typeParam || typeParam === 'products' || typeParam === 'all') {
    for (const p of prods?.results || []) {
      urls.push(`  <url><loc>https://collectibles.uy/producto/${encodeURIComponent(p.slug)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': CACHE_POLICIES.feeds,
      'X-Sitemap-Source': 'cloudflare-d1',
      ...corsHeaders,
    },
  });
}

async function authorizeInternalRequest(request: Request, env: Env): Promise<{ ok: boolean; error?: string }> {
  const expectedSecret = env.CATALOG_SYNC_SECRET || '';
  const authHeader = request.headers.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const isValidSecret = await verifySecretConstantTime(bearerToken, expectedSecret);
  if (!isValidSecret) {
    return { ok: false, error: 'Unauthorized internal request' };
  }

  // Protección anti-replay opcional por cabecera X-Sync-Timestamp
  const tsHeader = request.headers.get('X-Sync-Timestamp');
  if (tsHeader) {
    const tsMs = Number(tsHeader);
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > REPLAY_WINDOW_MS) {
      return { ok: false, error: 'Sync timestamp expired or outside replay window' };
    }
  }

  return { ok: true };
}

/**
 * Endpoint privado de reconciliación ligera (`POST /api/v1/internal/diff-check`):
 * Recibe cabeceras `{ id, updated_at, status, is_active, base_price, stock }` leídas por PK
 * desde Supabase y devuelve únicamente los IDs que cambiaron o deben despublicarse en D1.
 */
async function handleInternalDiffCheck(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const auth = await authorizeInternalRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, 401, CACHE_POLICIES.noStore, corsHeaders);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, CACHE_POLICIES.noStore, corsHeaders);
  }

  const candidates: Array<{
    id: string;
    updated_at?: string;
    status?: string;
    is_active?: boolean;
    base_price?: number;
    stock?: number;
  }> = Array.isArray(body?.items) ? body.items.slice(0, 100) : [];

  if (candidates.length === 0) {
    return jsonResponse({ ok: true, changed_ids: [], unpublish_ids: [] }, 200, CACHE_POLICIES.noStore, corsHeaders);
  }

  const ids = candidates.map((c) => String(c.id)).filter(Boolean);
  const placeholders = ids.map(() => '?').join(', ');
  const existingRes = await env.DB.prepare(
    `SELECT id, updated_at, status, is_active, base_price, stock FROM public_products WHERE id IN (${placeholders})`
  )
    .bind(...ids)
    .all<Record<string, any>>();

  const d1Map = new Map<string, Record<string, any>>();
  for (const row of existingRes.results || []) {
    d1Map.set(String(row.id), row);
  }

  const changedIds: string[] = [];
  const unpublishIds: string[] = [];

  for (const item of candidates) {
    const id = String(item.id);
    const isPublishedInSource = item.status === 'published' && item.is_active !== false;
    const existing = d1Map.get(id);

    if (!isPublishedInSource) {
      if (existing && (existing.is_active === 1 || existing.status === 'published')) {
        unpublishIds.push(id);
      }
      continue;
    }

    if (
      !existing ||
      existing.is_active !== 1 ||
      existing.status !== 'published' ||
      existing.updated_at !== item.updated_at ||
      Math.abs(Number(existing.base_price ?? 0) - Number(item.base_price ?? 0)) > 0.01 ||
      Number(existing.stock ?? 0) !== Number(item.stock ?? 0)
    ) {
      changedIds.push(id);
    }
  }

  return jsonResponse(
    {
      ok: true,
      checked: candidates.length,
      changed_ids: changedIds,
      unpublish_ids: unpublishIds,
    },
    200,
    CACHE_POLICIES.noStore,
    corsHeaders
  );
}

/**
 * Endpoint privado para cambiar el modo de ejecución y rollback en caliente (< 1s):
 * `POST /api/v1/internal/runtime-mode`
 */
async function handleInternalRuntimeMode(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const auth = await authorizeInternalRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, 401, CACHE_POLICIES.noStore, corsHeaders);
  }

  let body: Partial<RuntimeRoutingConfig>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, CACHE_POLICIES.noStore, corsHeaders);
  }

  const current = await getRuntimeRoutingConfig(env);
  const nextConfig: RuntimeRoutingConfig = {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
    mode: body.enabled === false ? 'disabled' : (body.mode || (body.enabled === true ? 'active' : current.mode)),
    domains: {
      ...current.domains,
      ...(body.domains || {}),
    },
    updated_at: new Date().toISOString(),
    reason: body.reason || current.reason,
  };

  await env.DB.prepare(
    `INSERT INTO public_site_settings (key, value_json, updated_at)
     VALUES ('runtime_routing_config', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  )
    .bind(JSON.stringify(nextConfig), nextConfig.updated_at)
    .run();

  return jsonResponse(
    {
      ok: true,
      runtime_config: nextConfig,
    },
    200,
    CACHE_POLICIES.noStore,
    corsHeaders
  );
}

/**
 * Canal Privado de Sincronización Incremental (Supabase -> D1).
 * Requiere `Authorization: Bearer <CATALOG_SYNC_SECRET>`.
 */
async function handleInternalSync(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const startedAt = Date.now();
  const auth = await authorizeInternalRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, 401, CACHE_POLICIES.noStore, corsHeaders);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_SYNC_PAYLOAD_BYTES) {
    return jsonResponse(
      { ok: false, error: `Payload size ${rawBody.length} exceeds limit of ${MAX_SYNC_PAYLOAD_BYTES} bytes` },
      413,
      CACHE_POLICIES.noStore,
      corsHeaders
    );
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON payload' }, 400, CACHE_POLICIES.noStore, corsHeaders);
  }

  if (Array.isArray(payload.upsert_products) && payload.upsert_products.length > MAX_SYNC_ITEMS_PER_BATCH) {
    return jsonResponse(
      { ok: false, error: `Batch exceeds maximum of ${MAX_SYNC_ITEMS_PER_BATCH} products` },
      400,
      CACHE_POLICIES.noStore,
      corsHeaders
    );
  }

  const batchId = String(payload.batch_id || crypto.randomUUID());
  const statements: D1PreparedStatement[] = [];
  let affectedCount = 0;

  // 1. Upsert de productos públicos (sanitizando cualquier campo privado/financiero interno)
  if (Array.isArray(payload.upsert_products)) {
    for (const rawProd of payload.upsert_products) {
      const p = sanitizePublicRecord(rawProd);
      if (!p?.id || !p?.slug || !p?.title) continue;
      const isIntl = p.is_international ? 1 : 0;
      const currency = isIntl ? 'USD' : (p.currency === 'USD' ? 'USD' : 'UYU');
      const searchText = normalizeSearchQuery(
        [p.title, p.sku, p.asin, p.brand_name, p.category_name, p.license_name, p.wave_name]
          .filter(Boolean)
          .join(' ')
      );

      statements.push(
        env.DB.prepare(
          `INSERT INTO public_products (
            id, slug, title, description, short_description, sku, ean, asin, external_product_id,
            catalog_source, source_provider, source_market, is_international,
            currency, price_currency, base_price, compare_at_price,
            final_price_usd, final_price_uyu, urubox_estimated_cost_usd, total_estimated_cost_usd,
            amazon_current_price_usd, amazon_list_price_usd, amazon_discount_percent, amazon_prime,
            status, is_active, stock, stock_status, availability_type, is_preorder, preorder_eta, release_date,
            condition, is_featured, is_new_arrival,
            category_id, category_slug, category_name,
            brand_id, brand_slug, brand_name,
            license_id, license_slug, license_name,
            theme_id, theme_slug, theme_name,
            vendor_id, vendor_store_id, vendor_name, vendor_slug, vendor_logo_url, vendor_status, vendor_ships_to_argentina,
            wave_name, weight_kg, weight_grams,
            primary_image_url, images_json, media_variants_json, variants_json, tags_json,
            category_ids_json, group_ids_json, buybox_json, payment_restrictions_json,
            average_rating, reviews_count, reviews_preview_json,
            seo_title, seo_description, search_text,
            created_at, updated_at, synced_at, expires_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?
          )
          ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            title = excluded.title,
            description = excluded.description,
            short_description = excluded.short_description,
            sku = excluded.sku,
            ean = excluded.ean,
            asin = excluded.asin,
            external_product_id = excluded.external_product_id,
            catalog_source = excluded.catalog_source,
            source_provider = excluded.source_provider,
            source_market = excluded.source_market,
            is_international = excluded.is_international,
            currency = excluded.currency,
            price_currency = excluded.price_currency,
            base_price = excluded.base_price,
            compare_at_price = excluded.compare_at_price,
            final_price_usd = excluded.final_price_usd,
            final_price_uyu = excluded.final_price_uyu,
            urubox_estimated_cost_usd = excluded.urubox_estimated_cost_usd,
            total_estimated_cost_usd = excluded.total_estimated_cost_usd,
            amazon_current_price_usd = excluded.amazon_current_price_usd,
            amazon_list_price_usd = excluded.amazon_list_price_usd,
            amazon_discount_percent = excluded.amazon_discount_percent,
            amazon_prime = excluded.amazon_prime,
            status = excluded.status,
            is_active = excluded.is_active,
            stock = excluded.stock,
            stock_status = excluded.stock_status,
            availability_type = excluded.availability_type,
            is_preorder = excluded.is_preorder,
            preorder_eta = excluded.preorder_eta,
            release_date = excluded.release_date,
            condition = excluded.condition,
            is_featured = excluded.is_featured,
            is_new_arrival = excluded.is_new_arrival,
            category_id = excluded.category_id,
            category_slug = excluded.category_slug,
            category_name = excluded.category_name,
            brand_id = excluded.brand_id,
            brand_slug = excluded.brand_slug,
            brand_name = excluded.brand_name,
            license_id = excluded.license_id,
            license_slug = excluded.license_slug,
            license_name = excluded.license_name,
            theme_id = excluded.theme_id,
            theme_slug = excluded.theme_slug,
            theme_name = excluded.theme_name,
            vendor_id = excluded.vendor_id,
            vendor_store_id = excluded.vendor_store_id,
            vendor_name = excluded.vendor_name,
            vendor_slug = excluded.vendor_slug,
            vendor_logo_url = excluded.vendor_logo_url,
            vendor_status = excluded.vendor_status,
            vendor_ships_to_argentina = excluded.vendor_ships_to_argentina,
            wave_name = excluded.wave_name,
            weight_kg = excluded.weight_kg,
            weight_grams = excluded.weight_grams,
            primary_image_url = excluded.primary_image_url,
            images_json = excluded.images_json,
            media_variants_json = excluded.media_variants_json,
            variants_json = excluded.variants_json,
            tags_json = excluded.tags_json,
            category_ids_json = excluded.category_ids_json,
            group_ids_json = excluded.group_ids_json,
            buybox_json = excluded.buybox_json,
            payment_restrictions_json = excluded.payment_restrictions_json,
            average_rating = excluded.average_rating,
            reviews_count = excluded.reviews_count,
            reviews_preview_json = excluded.reviews_preview_json,
            seo_title = excluded.seo_title,
            seo_description = excluded.seo_description,
            search_text = excluded.search_text,
            updated_at = excluded.updated_at,
            synced_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            expires_at = excluded.expires_at`
        ).bind(
          p.id,
          p.slug,
          p.title,
          p.description ? String(p.description).slice(0, 4000) : null,
          p.short_description ? String(p.short_description).slice(0, 600) : null,
          p.sku ?? null,
          p.ean ?? null,
          p.asin ?? null,
          p.external_product_id ?? null,
          isIntl ? 'international' : 'local',
          p.source_provider ?? (isIntl ? 'amazon' : 'platform'),
          p.source_market ?? (isIntl ? 'US' : 'UY'),
          isIntl,
          currency,
          currency,
          Number(p.base_price ?? 0),
          p.compare_at_price != null ? Number(p.compare_at_price) : null,
          p.final_price_usd != null ? Number(p.final_price_usd) : null,
          p.final_price_uyu != null ? Number(p.final_price_uyu) : null,
          p.urubox_estimated_cost_usd != null ? Number(p.urubox_estimated_cost_usd) : null,
          p.total_estimated_cost_usd != null ? Number(p.total_estimated_cost_usd) : null,
          p.amazon_current_price_usd != null ? Number(p.amazon_current_price_usd) : null,
          p.amazon_list_price_usd != null ? Number(p.amazon_list_price_usd) : null,
          p.amazon_discount_percent != null ? Number(p.amazon_discount_percent) : null,
          p.amazon_prime ? 1 : 0,
          p.status || 'published',
          p.is_active === false ? 0 : 1,
          Number(p.stock ?? 0),
          p.stock_status || (Number(p.stock ?? 0) > 0 ? 'in_stock' : 'out_of_stock'),
          p.availability_type || 'immediate',
          p.is_preorder ? 1 : 0,
          p.preorder_eta ?? null,
          p.release_date ?? null,
          p.condition || 'new',
          p.is_featured ? 1 : 0,
          p.is_new_arrival ? 1 : 0,
          p.category_id ?? null,
          p.category_slug ?? null,
          p.category_name ?? null,
          p.brand_id ?? null,
          p.brand_slug ?? null,
          p.brand_name ?? null,
          p.license_id ?? null,
          p.license_slug ?? null,
          p.license_name ?? null,
          p.theme_id ?? null,
          p.theme_slug ?? null,
          p.theme_name ?? null,
          p.vendor_id ?? null,
          p.vendor_store_id ?? null,
          p.vendor_name ?? null,
          p.vendor_slug ?? null,
          p.vendor_logo_url ?? null,
          p.vendor_status || 'active',
          p.vendor_ships_to_argentina === false ? 0 : 1,
          p.wave_name ?? null,
          p.weight_kg != null ? Number(p.weight_kg) : null,
          p.weight_grams != null ? Number(p.weight_grams) : null,
          p.primary_image_url ?? null,
          JSON.stringify(p.images || []),
          JSON.stringify(p.media_variants || {}),
          JSON.stringify(p.variants || []),
          JSON.stringify(p.tags || []),
          JSON.stringify(p.category_ids || (p.category_id ? [p.category_id] : [])),
          JSON.stringify(p.group_ids || []),
          JSON.stringify(p.buybox || []),
          JSON.stringify(p.payment_restrictions || []),
          Number(p.average_rating ?? 0),
          Number(p.reviews_count ?? 0),
          JSON.stringify(p.reviews_preview || []),
          p.seo_title ?? null,
          p.seo_description ?? null,
          searchText,
          p.created_at || new Date().toISOString(),
          p.updated_at || new Date().toISOString(),
          p.expires_at ?? null
        )
      );
      const catIds: string[] = Array.isArray(p.category_ids) && p.category_ids.length > 0
        ? p.category_ids.map(String)
        : (p.category_id ? [String(p.category_id)] : []);
      for (const catId of catIds) {
        if (!catId) continue;
        statements.push(
          env.DB.prepare(
            `INSERT INTO public_product_categories (product_id, category_id, brand_id, is_international)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(product_id, category_id) DO UPDATE SET
               brand_id = excluded.brand_id,
               is_international = excluded.is_international`
          ).bind(p.id, catId, p.brand_id ?? null, isIntl)
        );
      }
      affectedCount++;
    }
  }

  // 2. Despublicación / baja inmediata de productos
  if (Array.isArray(payload.unpublish_product_ids)) {
    for (const id of payload.unpublish_product_ids.slice(0, 100)) {
      if (!id) continue;
      statements.push(
        env.DB.prepare(
          "UPDATE public_products SET is_active = 0, status = 'archived', synced_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
        ).bind(String(id))
      );
      affectedCount++;
    }
  }

  // 3. Upsert de Categorías, Marcas, Licencias, Temas, Grupos, Vendedores, Promociones, Banners, Badges, Radar, Redirecciones y Configuración Pública
  if (Array.isArray(payload.upsert_categories)) {
    for (const c of payload.upsert_categories) {
      if (!c?.id || !c?.slug) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_categories (id, name, slug, parent_id, description, image_url, icon_name, is_active, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, slug = excluded.slug, parent_id = excluded.parent_id,
             description = excluded.description, image_url = excluded.image_url,
             icon_name = excluded.icon_name, is_active = excluded.is_active,
             sort_order = excluded.sort_order, updated_at = excluded.updated_at`
        ).bind(
          c.id,
          c.name,
          c.slug,
          c.parent_id ?? null,
          c.description ?? null,
          c.image_url ?? null,
          c.icon_name ?? null,
          c.is_active === false ? 0 : 1,
          Number(c.sort_order ?? 0),
          c.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_brands)) {
    for (const b of payload.upsert_brands) {
      if (!b?.id || !b?.slug) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_brands (id, name, slug, logo_url, banner_url, description, is_featured, is_active, status, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, slug = excluded.slug, logo_url = excluded.logo_url,
             banner_url = excluded.banner_url, description = excluded.description,
             is_featured = excluded.is_featured, is_active = excluded.is_active,
             status = excluded.status, sort_order = excluded.sort_order, updated_at = excluded.updated_at`
        ).bind(
          b.id,
          b.name,
          b.slug,
          b.logo_url ?? null,
          b.banner_url ?? null,
          b.description ?? null,
          b.is_featured ? 1 : 0,
          b.is_active === false ? 0 : 1,
          b.status || 'approved',
          Number(b.sort_order ?? 0),
          b.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_licenses)) {
    for (const l of payload.upsert_licenses) {
      if (!l?.id || !l?.slug) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_licenses (id, name, slug, logo_url, banner_url, description, is_featured, is_active, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, slug = excluded.slug, logo_url = excluded.logo_url,
             banner_url = excluded.banner_url, description = excluded.description,
             is_featured = excluded.is_featured, is_active = excluded.is_active,
             sort_order = excluded.sort_order, updated_at = excluded.updated_at`
        ).bind(
          l.id,
          l.name,
          l.slug,
          l.logo_url ?? null,
          l.banner_url ?? null,
          l.description ?? null,
          l.is_featured ? 1 : 0,
          l.is_active === false ? 0 : 1,
          Number(l.sort_order ?? 0),
          l.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_themes)) {
    for (const t of payload.upsert_themes) {
      if (!t?.id || !t?.slug) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_themes (id, name, slug, description, is_active, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, slug = excluded.slug, description = excluded.description,
             is_active = excluded.is_active, sort_order = excluded.sort_order, updated_at = excluded.updated_at`
        ).bind(
          t.id,
          t.name,
          t.slug,
          t.description ?? null,
          t.is_active === false ? 0 : 1,
          Number(t.sort_order ?? 0),
          t.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_license_themes)) {
    for (const lt of payload.upsert_license_themes) {
      if (!lt?.license_id || !lt?.theme_id) continue;
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO public_license_themes (license_id, theme_id) VALUES (?, ?)`
        ).bind(String(lt.license_id), String(lt.theme_id))
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_product_groups)) {
    for (const g of payload.upsert_product_groups) {
      if (!g?.id || !g?.slug) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_product_groups (id, name, slug, description, group_type, banner_url, is_active, sort_order, product_ids_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, slug = excluded.slug, description = excluded.description,
             group_type = excluded.group_type, banner_url = excluded.banner_url,
             is_active = excluded.is_active, sort_order = excluded.sort_order,
             product_ids_json = excluded.product_ids_json, updated_at = excluded.updated_at`
        ).bind(
          g.id,
          g.name,
          g.slug,
          g.description ?? null,
          g.group_type ?? null,
          g.banner_url ?? null,
          g.is_active === false ? 0 : 1,
          Number(g.sort_order ?? 0),
          JSON.stringify(Array.isArray(g.product_ids) ? g.product_ids : []),
          g.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_vendor_stores)) {
    for (const vs of payload.upsert_vendor_stores) {
      const storeSlug = vs?.store_slug || vs?.slug;
      const storeName = vs?.store_name || vs?.name;
      if (!vs?.id || !storeSlug || !storeName) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_vendor_stores (
             id, vendor_id, store_name, store_slug, description, logo_url, banner_url,
             status, is_active, ships_to_argentina, promotions_opt_in, badges_json,
             rating, reviews_count, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             vendor_id = excluded.vendor_id, store_name = excluded.store_name, store_slug = excluded.store_slug,
             description = excluded.description, logo_url = excluded.logo_url, banner_url = excluded.banner_url,
             status = excluded.status, is_active = excluded.is_active, ships_to_argentina = excluded.ships_to_argentina,
             promotions_opt_in = excluded.promotions_opt_in, badges_json = excluded.badges_json,
             rating = excluded.rating, reviews_count = excluded.reviews_count, updated_at = excluded.updated_at`
        ).bind(
          vs.id,
          vs.vendor_id || vs.id,
          storeName,
          storeSlug,
          vs.description ?? null,
          vs.logo_url ?? null,
          vs.banner_url ?? null,
          vs.status || 'active',
          vs.is_active === false ? 0 : 1,
          vs.ships_to_argentina ? 1 : 0,
          vs.promotions_opt_in ? 1 : 0,
          JSON.stringify(Array.isArray(vs.badges) ? vs.badges : []),
          vs.rating != null ? Number(vs.rating) : null,
          Number(vs.reviews_count ?? 0),
          vs.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_promotions)) {
    for (const pr of payload.upsert_promotions) {
      if (!pr?.id || !pr?.name) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_promotions (
             id, name, description, type, value, min_purchase_amount, max_discount_amount,
             starts_at, ends_at, is_active, priority, stackable, badge_text, applies_to_all,
             targets_json, exclusions_json, tiers_json, group_items_json, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, description = excluded.description, type = excluded.type,
             value = excluded.value, min_purchase_amount = excluded.min_purchase_amount,
             max_discount_amount = excluded.max_discount_amount, starts_at = excluded.starts_at,
             ends_at = excluded.ends_at, is_active = excluded.is_active, priority = excluded.priority,
             stackable = excluded.stackable, badge_text = excluded.badge_text,
             applies_to_all = excluded.applies_to_all, targets_json = excluded.targets_json,
             exclusions_json = excluded.exclusions_json, tiers_json = excluded.tiers_json,
             group_items_json = excluded.group_items_json, updated_at = excluded.updated_at`
        ).bind(
          pr.id,
          pr.name,
          pr.description ?? null,
          pr.type || 'percentage',
          Number(pr.value ?? 0),
          pr.min_purchase_amount != null ? Number(pr.min_purchase_amount) : null,
          pr.max_discount_amount != null ? Number(pr.max_discount_amount) : null,
          pr.starts_at ?? null,
          pr.ends_at ?? null,
          pr.is_active === false ? 0 : 1,
          Number(pr.priority ?? 0),
          pr.stackable ? 1 : 0,
          pr.badge_text ?? null,
          pr.applies_to_all ? 1 : 0,
          JSON.stringify(pr.targets || []),
          JSON.stringify(pr.exclusions || []),
          JSON.stringify(pr.tiers || []),
          JSON.stringify(pr.group_items || []),
          pr.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_banners)) {
    for (const bn of payload.upsert_banners) {
      if (!bn?.id || !bn?.image_url) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_banners (
             id, title, subtitle, image_url, mobile_image_url, link_url, cta_text,
             position, sort_order, is_active, starts_at, ends_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title, subtitle = excluded.subtitle, image_url = excluded.image_url,
             mobile_image_url = excluded.mobile_image_url, link_url = excluded.link_url,
             cta_text = excluded.cta_text, position = excluded.position, sort_order = excluded.sort_order,
             is_active = excluded.is_active, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
             updated_at = excluded.updated_at`
        ).bind(
          bn.id,
          bn.title ?? null,
          bn.subtitle ?? null,
          bn.image_url,
          bn.mobile_image_url ?? null,
          bn.link_url ?? null,
          bn.cta_text ?? null,
          bn.position || 'home_hero',
          Number(bn.sort_order ?? 0),
          bn.is_active === false ? 0 : 1,
          bn.starts_at ?? null,
          bn.ends_at ?? null,
          bn.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_badges)) {
    for (const bg of payload.upsert_badges) {
      if (!bg?.id || !bg?.slug) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_badges (id, name, slug, label, bg_color, text_color, icon, is_active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, slug = excluded.slug, label = excluded.label,
             bg_color = excluded.bg_color, text_color = excluded.text_color,
             icon = excluded.icon, is_active = excluded.is_active, updated_at = excluded.updated_at`
        ).bind(
          bg.id,
          bg.name,
          bg.slug,
          bg.label ?? bg.name,
          bg.bg_color ?? null,
          bg.text_color ?? null,
          bg.icon ?? null,
          bg.is_active === false ? 0 : 1,
          bg.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_radar_releases)) {
    for (const rd of payload.upsert_radar_releases) {
      if (!rd?.id || !rd?.slug || !rd?.title) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_radar_releases (
             id, title, slug, brand_id, brand_name, brand_slug, license_id, license_name, license_slug,
             category, release_date, estimated_quarter, status, msrp_usd, currency, hero_image_url,
             gallery_json, description, editorial_summary, hype_score, is_featured,
             milestones_json, related_products_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title, slug = excluded.slug, brand_id = excluded.brand_id,
             brand_name = excluded.brand_name, brand_slug = excluded.brand_slug,
             license_id = excluded.license_id, license_name = excluded.license_name,
             license_slug = excluded.license_slug, category = excluded.category,
             release_date = excluded.release_date, estimated_quarter = excluded.estimated_quarter,
             status = excluded.status, msrp_usd = excluded.msrp_usd, currency = excluded.currency,
             hero_image_url = excluded.hero_image_url, gallery_json = excluded.gallery_json,
             description = excluded.description, editorial_summary = excluded.editorial_summary,
             hype_score = excluded.hype_score, is_featured = excluded.is_featured,
             milestones_json = excluded.milestones_json, related_products_json = excluded.related_products_json,
             updated_at = excluded.updated_at`
        ).bind(
          rd.id,
          rd.title,
          rd.slug,
          rd.brand_id ?? null,
          rd.brand_name ?? null,
          rd.brand_slug ?? null,
          rd.license_id ?? null,
          rd.license_name ?? null,
          rd.license_slug ?? null,
          rd.category ?? null,
          rd.release_date ?? null,
          rd.estimated_quarter ?? null,
          rd.status || 'announced',
          rd.msrp_usd != null ? Number(rd.msrp_usd) : null,
          rd.currency || 'USD',
          rd.hero_image_url ?? null,
          JSON.stringify(rd.gallery || []),
          rd.description ?? null,
          rd.editorial_summary ?? null,
          Number(rd.hype_score ?? 0),
          rd.is_featured ? 1 : 0,
          JSON.stringify(rd.milestones || []),
          JSON.stringify(rd.related_products || []),
          rd.created_at || new Date().toISOString(),
          rd.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (Array.isArray(payload.upsert_slug_redirects)) {
    for (const sr of payload.upsert_slug_redirects) {
      if (!sr?.old_slug || !sr?.new_slug) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_slug_redirects (old_slug, new_slug, product_id, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(old_slug) DO UPDATE SET
             new_slug = excluded.new_slug, product_id = excluded.product_id, updated_at = excluded.updated_at`
        ).bind(
          sr.old_slug,
          sr.new_slug,
          sr.product_id ?? null,
          sr.updated_at || new Date().toISOString()
        )
      );
      affectedCount++;
    }
  }

  if (payload.upsert_settings && typeof payload.upsert_settings === 'object') {
    for (const [key, val] of Object.entries(payload.upsert_settings)) {
      const cleanVal = typeof val === 'object' && val !== null ? sanitizePublicRecord(val as any) : val;
      statements.push(
        env.DB.prepare(
          `INSERT INTO public_site_settings (key, value_json, updated_at)
           VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
        ).bind(key, JSON.stringify(cleanVal ?? {}))
      );
      affectedCount++;
    }
  }

  if (payload.cursor?.entity_type) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO sync_state (entity_type, last_cursor_updated_at, last_cursor_id, last_sync_status, last_sync_at, records_synced)
         VALUES (?, ?, ?, 'ok', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?)
         ON CONFLICT(entity_type) DO UPDATE SET
           last_cursor_updated_at = excluded.last_cursor_updated_at,
           last_cursor_id = excluded.last_cursor_id,
           last_sync_status = 'ok',
           last_sync_at = excluded.last_sync_at,
           records_synced = sync_state.records_synced + excluded.records_synced,
           error_message = NULL`
      ).bind(
        String(payload.cursor.entity_type),
        payload.cursor.last_updated_at ?? null,
        payload.cursor.last_id ?? null,
        affectedCount
      )
    );
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO sync_audit_log (batch_id, operation, entity_type, records_affected, duration_ms, status)
       VALUES (?, 'incremental_sync', ?, ?, ?, 'ok')`
    ).bind(batchId, String(payload.cursor?.entity_type || 'mixed'), affectedCount, Date.now() - startedAt)
  );

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return jsonResponse(
    {
      ok: true,
      batch_id: batchId,
      records_affected: affectedCount,
      duration_ms: Date.now() - startedAt,
    },
    200,
    CACHE_POLICIES.noStore,
    corsHeaders
  );
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContextLike): Promise<Response> {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // Canales privados autenticados (POST)
    if (pathname === '/api/v1/internal/sync') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405, CACHE_POLICIES.noStore, corsHeaders);
      }
      return handleInternalSync(request, env, corsHeaders);
    }

    if (pathname === '/api/v1/internal/diff-check') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405, CACHE_POLICIES.noStore, corsHeaders);
      }
      return handleInternalDiffCheck(request, env, corsHeaders);
    }

    if (pathname === '/api/v1/internal/runtime-mode') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method Not Allowed' }, 405, CACHE_POLICIES.noStore, corsHeaders);
      }
      return handleInternalRuntimeMode(request, env, corsHeaders);
    }

    // Todos los endpoints públicos son estrictamente de lectura (GET o HEAD)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonResponse({ ok: false, error: 'Method Not Allowed on public catalog API' }, 405, CACHE_POLICIES.noStore, corsHeaders);
    }

    if (pathname === '/' || pathname === '/api/v1/health') {
      return handleHealth(env, corsHeaders);
    }

    if (pathname === '/api/v1/runtime-config') {
      return handleRuntimeConfigGet(env, corsHeaders);
    }

    // Verificar Kill-Switch / Runtime Mode antes de servir rutas de datos
    const runtimeCfg = await getRuntimeRoutingConfig(env);
    if (!runtimeCfg.enabled) {
      return jsonResponse(
        {
          ok: false,
          error: 'Cloudflare public catalog disabled via runtime switch',
          runtime_mode: 'disabled',
        },
        503,
        CACHE_POLICIES.noStore,
        corsHeaders,
        {
          'X-Catalog-Mode': 'disabled',
          'X-Catalog-Kill-Switch': 'active',
        }
      );
    }

    // Verificar activación granular por dominio
    function getDomainForPath(p: string): keyof typeof runtimeCfg.domains | null {
      if (p === '/api/v1/feeds/merchant.xml' || p === '/api/v1/feeds/meta.csv' || p === '/api/v1/sitemap.xml') return 'feeds';
      if (p === '/api/v1/products' || p === '/api/public-catalog') return 'products';
      if (p.startsWith('/api/v1/products/')) return 'productDetail';
      if (
        p === '/api/v1/categories' ||
        p === '/api/v1/brands' ||
        p === '/api/v1/taxonomies' ||
        p === '/api/v1/facets' ||
        p === '/api/v1/banners'
      )
        return 'taxonomies';
      if (p === '/api/v1/search') return 'search';
      if (p === '/api/v1/promotions') return 'promotions';
      if (p.startsWith('/api/v1/radar')) return 'radar';
      if (p === '/api/v1/settings') return 'settings';
      return null;
    }

    const domain = getDomainForPath(pathname);
    if (domain && runtimeCfg.domains && runtimeCfg.domains[domain] === false) {
      return jsonResponse(
        {
          ok: false,
          error: `Domain '${domain}' is currently disabled in Cloudflare catalog`,
          domain,
          runtime_mode: runtimeCfg.mode,
        },
        503,
        CACHE_POLICIES.noStore,
        corsHeaders,
        {
          'X-Catalog-Mode': runtimeCfg.mode,
          'X-Catalog-Kill-Switch': 'active',
          'X-Catalog-Domain': domain,
        }
      );
    }

    // Verificar Cloudflare Edge Cache para peticiones GET públicas
    const edgeCache = (globalThis as any).caches?.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    if (edgeCache && request.method === 'GET') {
      try {
        const cached = await edgeCache.match(cacheKey);
        if (cached) {
          const hitHeaders = new Headers(cached.headers);
          for (const [k, v] of Object.entries(corsHeaders)) {
            hitHeaders.set(k, v);
          }
          hitHeaders.set('X-Catalog-Cache', 'HIT');
          hitHeaders.set('X-Catalog-Mode', runtimeCfg.mode);
          return new Response(cached.body, { status: cached.status, headers: hitHeaders });
        }
      } catch {
        // Si falla la lectura de caché edge, continuar con D1
      }
    }

    try {
      let response: Response;

      if (pathname === '/api/v1/products' || pathname === '/api/public-catalog') {
        const mode = url.searchParams.get('mode');
        if (mode === 'taxonomies' || mode === 'facets') {
          response = await handleTaxonomiesAndFacets(url, env, corsHeaders);
        } else {
          response = await handleProductsList(url, env, corsHeaders);
        }
      } else if (pathname.startsWith('/api/v1/products/')) {
        const slug = pathname.slice('/api/v1/products/'.length);
        response = await handleProductDetail(slug, env, corsHeaders);
      } else if (
        pathname === '/api/v1/categories' ||
        pathname === '/api/v1/brands' ||
        pathname === '/api/v1/taxonomies' ||
        pathname === '/api/v1/facets'
      ) {
        response = await handleTaxonomiesAndFacets(url, env, corsHeaders);
      } else if (pathname === '/api/v1/banners') {
        const bannersRes = await env.DB.prepare('SELECT * FROM public_banners WHERE is_active = 1 ORDER BY sort_order ASC').all<Record<string, any>>();
        response = jsonResponse(
          { ok: true, source: 'cloudflare-d1', banners: bannersRes?.results || [] },
          200,
          CACHE_POLICIES.promotions,
          corsHeaders
        );
      } else if (pathname === '/api/v1/search') {
        response = await handleSearch(url, env, corsHeaders);
      } else if (pathname === '/api/v1/promotions') {
        response = await handlePromotions(env, corsHeaders);
      } else if (pathname === '/api/v1/radar') {
        response = await handleRadar(url, null, env, corsHeaders);
      } else if (pathname.startsWith('/api/v1/radar/')) {
        const slug = pathname.slice('/api/v1/radar/'.length);
        response = await handleRadar(url, slug, env, corsHeaders);
      } else if (pathname === '/api/v1/settings') {
        response = await handleSettings(env, corsHeaders);
      } else if (pathname === '/api/v1/feeds/merchant.xml') {
        response = await handleMerchantFeedXml(env, corsHeaders);
      } else if (pathname === '/api/v1/feeds/meta.csv') {
        response = await handleMetaFeedCsv(env, corsHeaders);
      } else if (pathname === '/api/v1/sitemap.xml') {
        response = await handleSitemapXml(url, env, corsHeaders);
      } else {
        response = jsonResponse({ ok: false, error: 'Endpoint not found' }, 404, CACHE_POLICIES.noStore, corsHeaders);
      }

      if (edgeCache && request.method === 'GET' && response.status === 200) {
        const clone = response.clone();
        ctx?.waitUntil(edgeCache.put(cacheKey, clone).catch(() => {}));
      }

      return response;
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'Public catalog service error',
          code: 'D1_QUERY_ERROR',
        },
        500,
        CACHE_POLICIES.noStore,
        corsHeaders
      );
    }
  },
};
