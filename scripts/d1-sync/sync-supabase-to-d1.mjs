#!/usr/bin/env node
/**
 * Sincronizador Incremental y Carga Inicial Controlada: Supabase -> Cloudflare D1
 *
 * Reglas de protección para Supabase Free (Nano 500 MB RAM):
 * 1. Lotes pequeños (default 40 registros, máximo 100).
 * 2. Pausa obligatoria entre lotes (default 1500 ms) para no saturar CPU/conexiones.
 * 3. Circuit Breaker por salud/latencia: si una lectura en Supabase tarda > 3500 ms
 *    o devuelve error HTTP 5xx / timeout, el proceso se detiene y guarda el cursor.
 * 4. Reanudación desde cursor (`--cursor-file` o consultando el estado en Worker).
 * 5. Modo `--dry-run` por defecto: no escribe en D1 producción salvo que se pase `--apply`.
 * 6. Regla comercial inmutable:
 *    - Productos locales/vendedores Uruguay -> `currency = 'UYU'`
 *    - Productos internacionales publicados -> `currency = 'USD'` + `final_price_uyu`
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_PAUSE_MS = 1500;
const MAX_SUPABASE_LATENCY_MS = 3500;

export function transformLocalProductForD1(row) {
  const images = Array.isArray(row.product_images)
    ? [...row.product_images].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [];
  const primaryImage = images.find((img) => img.is_primary)?.url || images[0]?.url || row.image_url || null;
  const stock = Number(row.stock ?? 0);
  const isPreorder = Boolean(row.is_preorder || row.availability_type === 'preorder');

  let stockStatus = 'out_of_stock';
  if (isPreorder) stockStatus = 'preorder';
  else if (stock > 3) stockStatus = 'in_stock';
  else if (stock > 0) stockStatus = 'low_stock';

  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title || '').trim(),
    description: row.description || null,
    short_description: row.short_description || null,
    sku: row.sku || null,
    ean: row.ean || null,
    asin: row.asin || null,
    external_product_id: row.external_product_id || null,
    catalog_source: 'local',
    source_provider: row.source_provider || 'platform',
    source_market: 'UY',
    is_international: false,
    // Regla comercial estricta: productos locales en Uruguay se manejan en UYU
    currency: 'UYU',
    price_currency: 'UYU',
    base_price: Number(row.base_price ?? 0),
    compare_at_price: row.compare_at_price != null ? Number(row.compare_at_price) : null,
    final_price_usd: null,
    final_price_uyu: Number(row.base_price ?? 0),
    status: row.status || 'published',
    is_active: row.is_active !== false && row.status === 'published',
    stock,
    stock_status: stockStatus,
    availability_type: row.availability_type || 'immediate',
    is_preorder: isPreorder,
    preorder_eta: row.preorder_eta || null,
    release_date: row.release_date || null,
    condition: row.condition || 'new',
    is_featured: Boolean(row.is_featured),
    is_new_arrival: Boolean(row.is_new_arrival),
    category_id: row.category_id || null,
    category_slug: row.categories?.slug || null,
    category_name: row.categories?.name || null,
    brand_id: row.brand_id || null,
    brand_slug: row.brands?.slug || null,
    brand_name: row.brands?.name || null,
    license_id: row.license_id || null,
    license_slug: row.licenses?.slug || null,
    license_name: row.licenses?.name || null,
    theme_id: row.theme_id || null,
    theme_slug: row.themes?.slug || null,
    theme_name: row.themes?.name || null,
    vendor_id: row.vendor_id || null,
    vendor_store_id: row.vendor_store_id || null,
    vendor_name: row.vendors?.store_name || null,
    vendor_slug: row.vendors?.store_slug || null,
    vendor_logo_url: row.vendors?.logo_url || null,
    vendor_status: row.vendors?.status || 'active',
    vendor_ships_to_argentina: row.vendors?.ships_to_argentina !== false,
    wave_name: row.wave_name || null,
    weight_kg: row.weight_kg != null ? Number(row.weight_kg) : null,
    weight_grams: row.weight_grams != null ? Number(row.weight_grams) : null,
    primary_image_url: primaryImage,
    images: images.map((img) => ({
      id: img.id,
      url: img.url,
      alt_text: img.alt_text || row.title,
      is_primary: Boolean(img.is_primary),
      sort_order: Number(img.sort_order ?? 0),
    })),
    media_variants: row.media_variants || {},
    variants: Array.isArray(row.product_variants) ? row.product_variants : [],
    tags: Array.isArray(row.product_tags) ? row.product_tags : [],
    category_ids: row.category_id ? [row.category_id] : [],
    group_ids: Array.isArray(row.product_group_items)
      ? row.product_group_items.map((g) => g.group_id).filter(Boolean)
      : [],
    average_rating: Number(row.average_rating ?? 0),
    reviews_count: Number(row.reviews_count ?? 0),
    seo_title: row.seo_title || row.title,
    seo_description: row.seo_description || row.short_description || null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

export function transformInternationalProductForD1(row) {
  const images = Array.isArray(row.images)
    ? row.images.map((url, idx) => (typeof url === 'string' ? { url, is_primary: idx === 0, sort_order: idx } : url))
    : [];
  const primaryImage = row.main_image_url || row.image_url || images[0]?.url || null;
  const finalUsd = Number(row.final_price_usd ?? row.base_price_usd ?? 0);
  const finalUyu = row.final_price_uyu != null ? Number(row.final_price_uyu) : null;
  const isAvailable = row.availability === 'in_stock' && row.status === 'published';

  return {
    id: String(row.id),
    slug: String(row.slug || `intl-${row.external_product_id || row.id}`),
    title: String(row.title || '').trim(),
    description: row.description || null,
    short_description: row.short_description || null,
    sku: row.sku || row.external_product_id || null,
    asin: row.asin || row.external_product_id || null,
    external_product_id: row.external_product_id || null,
    catalog_source: 'international',
    source_provider: row.source_provider || 'amazon',
    source_market: row.source_market || 'US',
    is_international: true,
    // Regla comercial estricta: productos internacionales se expresan en USD con su cálculo original
    currency: 'USD',
    price_currency: 'USD',
    base_price: finalUsd,
    compare_at_price: row.amazon_list_price_usd != null ? Number(row.amazon_list_price_usd) : null,
    final_price_usd: finalUsd,
    final_price_uyu: finalUyu,
    urubox_estimated_cost_usd: row.urubox_estimated_cost_usd != null ? Number(row.urubox_estimated_cost_usd) : null,
    total_estimated_cost_usd: row.total_estimated_cost_usd != null ? Number(row.total_estimated_cost_usd) : null,
    amazon_current_price_usd: row.amazon_current_price_usd != null ? Number(row.amazon_current_price_usd) : null,
    amazon_list_price_usd: row.amazon_list_price_usd != null ? Number(row.amazon_list_price_usd) : null,
    amazon_discount_percent: row.amazon_discount_percent != null ? Number(row.amazon_discount_percent) : null,
    amazon_prime: Boolean(row.amazon_prime),
    status: row.status || 'published',
    is_active: isAvailable,
    stock: isAvailable ? 5 : 0,
    stock_status: isAvailable ? 'in_stock' : 'unavailable',
    availability_type: 'international_import',
    condition: 'new',
    is_featured: Boolean(row.is_featured),
    is_new_arrival: Boolean(row.is_new_arrival),
    category_id: row.category_id || null,
    brand_id: row.brand_id || null,
    license_id: row.license_id || null,
    primary_image_url: primaryImage,
    images,
    weight_grams: row.weight_grams != null ? Number(row.weight_grams) : null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.last_synced_at || new Date().toISOString(),
    // Expiración informativa de 48h para proyecciones internacionales si no se refrescan
    expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  };
}

function parseCliArgs(argv) {
  const args = {
    mode: 'incremental',
    dryRun: true,
    batchSize: DEFAULT_BATCH_SIZE,
    pauseMs: DEFAULT_PAUSE_MS,
    cursorFile: path.resolve(process.cwd(), '.d1-sync-cursor.json'),
    maxBatches: 10,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--apply') args.dryRun = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--mode=')) args.mode = arg.split('=')[1];
    else if (arg.startsWith('--batch-size=')) args.batchSize = Math.min(100, Math.max(10, Number(arg.split('=')[1]) || DEFAULT_BATCH_SIZE));
    else if (arg.startsWith('--pause-ms=')) args.pauseMs = Math.max(500, Number(arg.split('=')[1]) || DEFAULT_PAUSE_MS);
    else if (arg.startsWith('--max-batches=')) args.maxBatches = Math.max(1, Number(arg.split('=')[1]) || 10);
    else if (arg.startsWith('--cursor-file=')) args.cursorFile = path.resolve(arg.split('=')[1]);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCursor(cursorFile) {
  try {
    if (fs.existsSync(cursorFile)) {
      return JSON.parse(fs.readFileSync(cursorFile, 'utf8'));
    }
  } catch {
    // ignore corrupt cursor file
  }
  return {
    local_products_updated_at: '1970-01-01T00:00:00.000Z',
    intl_products_updated_at: '1970-01-01T00:00:00.000Z',
  };
}

function saveCursor(cursorFile, cursor) {
  fs.writeFileSync(cursorFile, JSON.stringify(cursor, null, 2), 'utf8');
}

async function fetchSupabaseBatchWithCircuitBreaker(supabaseUrl, serviceKey, relativePath) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_SUPABASE_LATENCY_MS + 1000);

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${relativePath}`, {
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
      throw new Error(`Supabase HTTP ${res.status} after ${elapsed}ms`);
    }
    if (elapsed > MAX_SUPABASE_LATENCY_MS) {
      throw new Error(`Circuit Breaker tripped: Supabase latency ${elapsed}ms > ${MAX_SUPABASE_LATENCY_MS}ms threshold`);
    }

    const data = await res.json();
    return { data, elapsed };
  } finally {
    clearTimeout(timer);
  }
}

async function pushBatchToWorker(workerUrl, syncSecret, payload, dryRun) {
  if (dryRun) {
    console.log(
      `[DRY-RUN] Lote preparado (${payload.upsert_products?.length || 0} upserts, ${payload.unpublish_product_ids?.length || 0} bajas). No se envió a producción.`
    );
    return { ok: true, dryRun: true };
  }

  const res = await fetch(`${workerUrl.replace(/\/+$/, '')}/api/v1/internal/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${syncSecret}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker sync error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function runSyncCli() {
  const args = parseCliArgs(process.argv);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const workerUrl = process.env.CF_CATALOG_WORKER_URL || 'https://collectibles-catalog-api.pixelsncodes-uy.workers.dev';
  const syncSecret = process.env.CATALOG_SYNC_SECRET;

  console.log(`[D1-Sync] Iniciando modo=${args.mode} dryRun=${args.dryRun} batchSize=${args.batchSize} pauseMs=${args.pauseMs}`);

  if (!supabaseUrl || !serviceKey) {
    console.log('[D1-Sync] Variables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no presentes en el entorno actual. Abortando de forma segura.');
    return;
  }

  if (!args.dryRun && (!syncSecret || syncSecret.length < 24)) {
    throw new Error('[D1-Sync] Para ejecutar con --apply se requiere CATALOG_SYNC_SECRET (>= 24 caracteres).');
  }

  const cursor = loadCursor(args.cursorFile);

  for (let batchIndex = 0; batchIndex < args.maxBatches; batchIndex++) {
    const filterTs = encodeURIComponent(cursor.local_products_updated_at);
    const selectCols = encodeURIComponent(
      'id,slug,title,description,short_description,sku,ean,base_price,compare_at_price,currency,stock,status,is_active,is_featured,is_new_arrival,is_preorder,preorder_eta,release_date,condition,category_id,brand_id,license_id,theme_id,vendor_id,vendor_store_id,wave_name,weight_kg,weight_grams,created_at,updated_at,categories(id,name,slug),brands(id,name,slug),vendors(id,store_name,store_slug,logo_url,status,ships_to_argentina),product_images(id,url,alt_text,is_primary,sort_order)'
    );

    const queryPath = `products?select=${selectCols}&updated_at=gt.${filterTs}&order=updated_at.asc&limit=${args.batchSize}`;
    const { data: rows, elapsed } = await fetchSupabaseBatchWithCircuitBreaker(supabaseUrl, serviceKey, queryPath);

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`[D1-Sync] Sin más cambios pendientes en products (latencia=${elapsed}ms).`);
      break;
    }

    const upsertProducts = [];
    const unpublishIds = [];

    for (const row of rows) {
      if (row.status === 'published' && row.is_active !== false) {
        upsertProducts.push(transformLocalProductForD1(row));
      } else {
        unpublishIds.push(String(row.id));
      }
    }

    const lastUpdatedAt = rows[rows.length - 1].updated_at;
    await pushBatchToWorker(
      workerUrl,
      syncSecret,
      {
        batch_id: `local-${Date.now()}-${batchIndex}`,
        upsert_products: upsertProducts,
        unpublish_product_ids: unpublishIds,
        cursor: {
          entity_type: 'local_products',
          last_updated_at: lastUpdatedAt,
          last_id: rows[rows.length - 1].id,
        },
      },
      args.dryRun
    );

    cursor.local_products_updated_at = lastUpdatedAt;
    if (!args.dryRun) {
      saveCursor(args.cursorFile, cursor);
    }

    console.log(`[D1-Sync] Lote #${batchIndex + 1} procesado (${rows.length} filas, ${elapsed}ms). Cursor=${lastUpdatedAt}`);

    if (rows.length < args.batchSize) break;
    await sleep(args.pauseMs);
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  runSyncCli().catch((err) => {
    console.error('[D1-Sync] Detenido por seguridad:', err.message);
    process.exitCode = 1;
  });
}
