#!/usr/bin/env node
/**
 * Sincronizador Incremental y Carga Inicial Controlada: Supabase -> Cloudflare D1
 * (Arquitectura Zero-Write sobre Supabase Nano 500 MB RAM)
 *
 * Garantías técnicas (Puntos 2 y 3 de la revisión):
 * 1. CERO ESCRITURAS Y CERO MIGRACIONES EN SUPABASE:
 *    - No requiere triggers, ni tabla outbox, ni crear índices nuevos en PostgreSQL.
 * 2. PAGINACIÓN KEYSET POR CLAVE PRIMARIA (`products_pkey`):
 *    - Escanea encabezados livianos (`id,slug,status,is_active,updated_at,base_price,stock`)
 *      usando `id=gt.<last_uuid>&order=id.asc&limit=50`, ejecutando un `Index Scan` puro
 *      sobre `products_pkey` sin nodo `Sort` ni `Seq Scan`.
 * 3. CERO JOINS LATERALES EN POSTGRESQL:
 *    - Las tablas pequeñas (`categories`, `brands`, `vendors`) se cargan una sola vez en
 *      memoria de Node.js y se unen localmente.
 *    - Solo para los IDs que efectivamente cambiaron según `/api/v1/internal/diff-check`,
 *      se hidratan como máximo 15 productos por lote (`id=in.(...)`) sin joins anidados.
 * 4. LÍMITES ESTRICTOS Y MECANISMO DE SUSPENSIÓN AUTOMÁTICA:
 *    - Pre-flight health probe (`< 1200 ms`).
 *    - Límite duro de tamaño de respuesta (`MAX_RESPONSE_BYTES = 512 KB`).
 *    - Suspensión inmediata con archivo `.d1-sync-suspend.json` (cooldown 15 min) si la
 *      latencia de Supabase supera `2000 ms` o devuelve HTTP 429/5xx.
 * 5. PRIVACIDAD Y MONEDA:
 *    - Filtra explícitamente campos sensibles/costos internos antes de enviar a D1.
 *    - Preserva `UYU` para productos locales y `USD` para internacionales.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SYNC_LIMITS = {
  HEADER_SCAN_LIMIT: 50,
  HYDRATE_BATCH_SIZE: 15,
  MIN_HYDRATE_BATCH_SIZE: 5,
  BASE_PAUSE_MS: 2000,
  SLOW_PAUSE_MS: 4500,
  PREFLIGHT_MAX_LATENCY_MS: 1200,
  SOFT_LATENCY_THRESHOLD_MS: 900,
  HARD_LATENCY_ABORT_MS: 2000,
  MAX_RESPONSE_BYTES: 512 * 1024, // 512 KB
  MAX_DESCRIPTION_CHARS: 4000,
  SUSPEND_COOLDOWN_MS: 15 * 60 * 1000, // 15 minutos
};

const FORBIDDEN_PRIVATE_KEYS = new Set([
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
]);

export function stripPrivateFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_PRIVATE_KEYS.has(k)) continue;
    clean[k] = v;
  }
  return clean;
}

export function transformLocalProductForD1(row, lookupMaps = {}) {
  const safeRow = stripPrivateFields(row);
  const category = lookupMaps.categories?.get(safeRow.category_id) || safeRow.categories || safeRow.category || null;
  const brand = lookupMaps.brands?.get(safeRow.brand_id) || safeRow.brands || safeRow.brand || null;
  const vendor = lookupMaps.vendors?.get(safeRow.vendor_id) || safeRow.vendors || safeRow.vendor || null;
  const rawImages = lookupMaps.imagesByProduct?.get(safeRow.id) || safeRow.product_images || safeRow.images || [];

  const images = Array.isArray(rawImages)
    ? [...rawImages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [];
  const primaryImage = images.find((img) => img.is_primary)?.url || images[0]?.url || safeRow.image_url || null;
  const stock = Number(safeRow.stock ?? 0);
  const isPreorder = Boolean(safeRow.is_preorder || safeRow.availability_type === 'preorder');

  let stockStatus = 'out_of_stock';
  if (isPreorder) stockStatus = 'preorder';
  else if (stock > 3) stockStatus = 'in_stock';
  else if (stock > 0) stockStatus = 'low_stock';

  const description = safeRow.description
    ? String(safeRow.description).slice(0, SYNC_LIMITS.MAX_DESCRIPTION_CHARS)
    : null;

  return {
    id: String(safeRow.id),
    slug: String(safeRow.slug),
    title: String(safeRow.title || '').trim(),
    description,
    short_description: safeRow.short_description ? String(safeRow.short_description).slice(0, 600) : null,
    sku: safeRow.sku || null,
    ean: safeRow.ean || null,
    asin: safeRow.asin || null,
    external_product_id: safeRow.external_product_id || null,
    catalog_source: 'local',
    source_provider: safeRow.source_provider || 'platform',
    source_market: 'UY',
    is_international: false,
    // Regla comercial estricta: productos locales en Uruguay se manejan en UYU
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
    availability_type: safeRow.availability_type || 'immediate',
    is_preorder: isPreorder,
    preorder_eta: safeRow.preorder_eta || null,
    release_date: safeRow.release_date || null,
    condition: safeRow.condition || 'new',
    is_featured: Boolean(safeRow.is_featured),
    is_new_arrival: Boolean(safeRow.is_new_arrival),
    category_id: safeRow.category_id || null,
    category_slug: category?.slug || null,
    category_name: category?.name || null,
    brand_id: safeRow.brand_id || null,
    brand_slug: brand?.slug || null,
    brand_name: brand?.name || null,
    license_id: safeRow.license_id || null,
    theme_id: safeRow.theme_id || null,
    vendor_id: safeRow.vendor_id || null,
    vendor_store_id: safeRow.vendor_store_id || null,
    vendor_name: vendor?.store_name || null,
    vendor_slug: vendor?.slug || vendor?.store_slug || null,
    vendor_logo_url: vendor?.logo_url || null,
    vendor_status: vendor?.status || 'active',
    vendor_ships_to_argentina: vendor?.ships_to_argentina !== false,
    wave_name: safeRow.wave_name || null,
    weight_kg: safeRow.weight_kg != null ? Number(safeRow.weight_kg) : null,
    weight_grams: safeRow.weight_grams != null ? Number(safeRow.weight_grams) : null,
    primary_image_url: primaryImage,
    images: images.slice(0, 10).map((img) => ({
      id: img.id,
      url: img.url,
      alt_text: img.alt_text || safeRow.title,
      is_primary: Boolean(img.is_primary),
      sort_order: Number(img.sort_order ?? 0),
    })),
    media_variants: safeRow.media_variants || {},
    variants: Array.isArray(safeRow.product_variants) ? safeRow.product_variants : [],
    tags: Array.isArray(safeRow.product_tags) ? safeRow.product_tags : [],
    category_ids: safeRow.category_id ? [safeRow.category_id] : [],
    group_ids: Array.isArray(safeRow.product_group_items)
      ? safeRow.product_group_items.map((g) => g.group_id).filter(Boolean)
      : [],
    average_rating: Number(safeRow.average_rating ?? 0),
    reviews_count: Number(safeRow.reviews_count ?? 0),
    seo_title: safeRow.seo_title || safeRow.title,
    seo_description: safeRow.seo_description || safeRow.short_description || null,
    created_at: safeRow.created_at || new Date().toISOString(),
    updated_at: safeRow.updated_at || new Date().toISOString(),
  };
}

export function transformInternationalProductForD1(row) {
  const safeRow = stripPrivateFields(row);
  const images = Array.isArray(safeRow.images)
    ? safeRow.images.slice(0, 8).map((url, idx) => (typeof url === 'string' ? { url, is_primary: idx === 0, sort_order: idx } : url))
    : [];
  const primaryImage = safeRow.main_image_url || safeRow.image_url || images[0]?.url || null;
  const finalUsd = Number(safeRow.final_price_usd ?? safeRow.base_price_usd ?? 0);
  const finalUyu = safeRow.final_price_uyu != null ? Number(safeRow.final_price_uyu) : null;
  const isAvailable = safeRow.availability === 'in_stock' && safeRow.status === 'published';

  return {
    id: String(safeRow.id),
    slug: String(safeRow.slug || `intl-${safeRow.external_product_id || safeRow.id}`),
    title: String(safeRow.title || '').trim(),
    description: safeRow.description ? String(safeRow.description).slice(0, SYNC_LIMITS.MAX_DESCRIPTION_CHARS) : null,
    short_description: safeRow.short_description ? String(safeRow.short_description).slice(0, 600) : null,
    sku: safeRow.sku || safeRow.external_product_id || null,
    asin: safeRow.asin || safeRow.external_product_id || null,
    external_product_id: safeRow.external_product_id || null,
    catalog_source: 'international',
    source_provider: safeRow.source_provider || 'amazon',
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
    stock: isAvailable ? 5 : 0,
    stock_status: isAvailable ? 'in_stock' : 'unavailable',
    availability_type: 'international_import',
    condition: 'new',
    is_featured: Boolean(safeRow.is_featured),
    is_new_arrival: Boolean(safeRow.is_new_arrival),
    category_id: safeRow.collectibles_category_id || safeRow.category_id || null,
    brand_id: safeRow.brand_id || null,
    brand_name: safeRow.brand || null,
    license_id: safeRow.license_id || null,
    primary_image_url: primaryImage,
    images,
    weight_grams: safeRow.weight_grams != null ? Number(safeRow.weight_grams) : null,
    created_at: safeRow.created_at || new Date().toISOString(),
    updated_at: safeRow.updated_at || safeRow.last_synced_at || new Date().toISOString(),
    expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  };
}

/**
 * Construye las consultas PostgREST exactas garantizando uso de índice PK (`products_pkey`)
 * y cero joins laterales.
 */
export function buildKeysetHeaderQuery(lastIdCursor = '00000000-0000-0000-0000-000000000000', limit = SYNC_LIMITS.HEADER_SCAN_LIMIT) {
  const safeLimit = Math.min(SYNC_LIMITS.HEADER_SCAN_LIMIT, Math.max(1, Number(limit) || 50));
  const cols = 'id,slug,status,is_active,updated_at,base_price,stock';
  return `products?select=${cols}&id=gt.${encodeURIComponent(lastIdCursor)}&order=id.asc&limit=${safeLimit}`;
}

export function buildHydrateProductsByPkQuery(ids) {
  const cleanIds = ids.slice(0, SYNC_LIMITS.HYDRATE_BATCH_SIZE).map((id) => String(id).replace(/[^a-zA-Z0-9-]/g, ''));
  const cols = [
    'id', 'slug', 'title', 'description', 'short_description', 'sku', 'ean',
    'base_price', 'compare_at_price', 'currency', 'stock', 'status', 'is_active',
    'is_featured', 'condition', 'category_id', 'brand_id', 'license_id', 'theme_id',
    'vendor_id', 'vendor_store_id', 'wave_name', 'weight_kg', 'weight_grams',
    'created_at', 'updated_at',
  ].join(',');
  return `products?select=${cols}&id=in.(${cleanIds.join(',')})`;
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
