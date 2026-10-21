/**
 * cloudflareCatalogSync.ts — Sincronización Asíncrona, Persistente, Atómica e Idempotente Supabase -> Cloudflare D1
 * (Mecanismo Nivel 1 Outbox + Fallback para Edge Functions: create-order, refund-order, admin-products)
 *
 * Garantías Clave:
 * 1. Cero bloqueo de transacciones comerciales: persistencia en outbox y llamadas D1 en try/catch seguro.
 * 2. Monotonic Versioning: preserva updated_at autoritativo de PostgreSQL; D1 descarta updates desfasados.
 * 3. Reserva Atómica & SKIP LOCKED: evita procesamiento duplicado concurrente y recupera eventos atascados (timeout 5m).
 * 4. Preservación estricta de Moneda: USD para internacionales (con conversión UYU calculada) y UYU para locales.
 * 5. Dead Letter Queue & Backoff: retiros acotados con backoff exponencial (15s, 30s, 60s, 120s, 240s) y DLQ a 5 intentos.
 * 6. Deduplicación inteligente por entity_id en cada lote de drenaje.
 */

export interface SyncProductResult {
  ok: boolean;
  durationMs: number;
  recordsSynced: number;
  outboxEnqueued?: number;
  error?: string;
}

export interface OutboxEventInput {
  event_type:
    | 'order_created'
    | 'order_cancelled'
    | 'order_refunded'
    | 'stock_adjusted'
    | 'price_changed'
    | 'product_published'
    | 'product_unpublished';
  entity_type?: 'product' | 'taxonomy';
  entity_id: string;
  payload?: Record<string, any>;
  version_timestamp?: string;
}

export interface OutboxBatchResult {
  ok: boolean;
  processed: number;
  deadLetters: number;
  errors: number;
  workerId?: string;
}

function getEnv(key: string): string | undefined {
  if (typeof Deno !== 'undefined' && (Deno as any)?.env?.get) {
    return (Deno as any).env.get(key);
  }
  if (typeof process !== 'undefined' && process?.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Calcula el próximo instante de reintento usando retroceso exponencial acotado:
 * Intento 1: +15s | Intento 2: +30s | Intento 3: +60s | Intento 4: +120s | Intento 5: +240s
 */
export function calculateNextBackoff(attempts: number, baseSeconds = 15): string {
  const safeAttempts = Math.max(1, Math.min(10, attempts));
  const delaySeconds = baseSeconds * Math.pow(2, safeAttempts - 1);
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

/**
 * Calcula la firma HMAC-SHA256 compatible con el Worker de Cloudflare
 */
export async function computeHmacSignature(secret: string, timestampMs: string, rawBody: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const dataToSign = enc.encode(`${timestampMs}.${rawBody}`);
  const signatureBytes = await crypto.subtle.sign('HMAC', keyMaterial, dataToSign);
  return Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Registra eventos en la cola persistente `public.d1_catalog_outbox`.
 * Diseñado con fail-safe absoluto: un error en la escritura del outbox jamás debe abortar la compra.
 */
export async function enqueueOutboxEvents(
  events: OutboxEventInput[],
  supabaseClient: any
): Promise<{ ok: boolean; enqueued: number; error?: string }> {
  if (!events || events.length === 0 || !supabaseClient) {
    return { ok: true, enqueued: 0 };
  }

  try {
    const rows = events.map((ev) => ({
      event_type: ev.event_type,
      entity_type: ev.entity_type || 'product',
      entity_id: String(ev.entity_id),
      payload: ev.payload || {},
      version_timestamp: ev.version_timestamp || new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      max_attempts: 5,
      next_attempt_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }));

    const { error } = await supabaseClient.from('d1_catalog_outbox').insert(rows);
    if (error) {
      console.warn('[D1_OUTBOX] No se pudo encolar evento en outbox:', error.message);
      return { ok: false, enqueued: 0, error: error.message };
    }

    return { ok: true, enqueued: rows.length };
  } catch (err: any) {
    console.warn('[D1_OUTBOX] Excepción al registrar outbox:', err?.message || err);
    return { ok: false, enqueued: 0, error: err?.message || String(err) };
  }
}

/**
 * Sincroniza uno o más productos hacia Cloudflare D1 de forma asíncrona, idempotente y segura.
 * Respeta estrictamente:
 * - USD para productos internacionales (final_price_usd) + conversión a UYU de mercado.
 * - UYU para productos locales (base_price = final_price_uyu).
 */
export async function syncProductsToCloudflareD1(
  productIds: string[],
  supabaseClient: any,
  options: {
    workerUrl?: string;
    syncSecret?: string;
    timeoutMs?: number;
    eventType?: OutboxEventInput['event_type'];
    useOutbox?: boolean;
    fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  } = {}
): Promise<SyncProductResult> {
  const startedAt = Date.now();
  const cleanIds = Array.from(new Set(productIds.map(String).filter(Boolean)));
  if (cleanIds.length === 0) {
    return { ok: true, durationMs: 0, recordsSynced: 0 };
  }

  // Si se solicita registro en outbox, encolar preventivamente
  let outboxEnqueued = 0;
  if (options.useOutbox && options.eventType) {
    const enqueueRes = await enqueueOutboxEvents(
      cleanIds.map((id) => ({
        event_type: options.eventType!,
        entity_id: id,
        version_timestamp: new Date().toISOString(),
      })),
      supabaseClient
    );
    outboxEnqueued = enqueueRes.enqueued;
  }

  const workerUrl = options.workerUrl || getEnv('CF_CATALOG_API_URL') || 'https://collectibles-catalog-api.pixelsncodes-uy.workers.dev';
  const syncSecret = options.syncSecret || getEnv('CATALOG_SYNC_SECRET');

  if (!syncSecret) {
    console.warn('[CF_SYNC] CATALOG_SYNC_SECRET no configurado en entorno. Omitiendo sync D1 directo.');
    return { ok: false, durationMs: Date.now() - startedAt, recordsSynced: 0, outboxEnqueued, error: 'MISSING_SECRET' };
  }

  const timeoutMs = options.timeoutMs ?? 2500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. Consulta plana a productos locales (máx. 25 IDs)
    const { data: localProducts, error: prodErr } = await supabaseClient
      .from('products')
      .select('id, slug, title, description, short_description, sku, base_price, compare_at_price, status, is_active, condition, category_id, brand_id, license_id, vendor_id, vendor_store_id, created_at, updated_at')
      .in('id', cleanIds.slice(0, 25));

    // Identificar IDs que no estaban en products y buscar en international_products
    const foundLocalIds = new Set((localProducts || []).map((p: any) => p.id));
    const missingIds = cleanIds.filter((id) => !foundLocalIds.has(id));

    let intlProducts: any[] = [];
    if (missingIds.length > 0) {
      try {
        const { data: intlRows } = await supabaseClient
          .from('international_products')
          .select('id, title, description, brand, category, image_url, gallery_images, base_price_usd, final_price_usd, final_price_uyu, currency, availability, status, created_at, updated_at, collectibles_category_id')
          .in('id', missingIds.slice(0, 25));
        if (intlRows) intlProducts = intlRows;
      } catch {
        // Fallback defensivo si la tabla no está disponible
      }
    }

    if ((!localProducts || localProducts.length === 0) && intlProducts.length === 0) {
      clearTimeout(timer);
      return { ok: false, durationMs: Date.now() - startedAt, recordsSynced: 0, outboxEnqueued, error: prodErr?.message || 'NO_PRODUCTS_FOUND' };
    }

    // 2. Consulta a variantes para cálculo canónico de stock local
    const localIds = (localProducts || []).map((p: any) => p.id);
    let variants: any[] = [];
    let images: any[] = [];

    if (localIds.length > 0) {
      const { data: varData } = await supabaseClient
        .from('product_variants')
        .select('id, product_id, sku, name, price_adjustment, inventory_count, is_active')
        .in('product_id', localIds);
      if (varData) variants = varData;

      const { data: imgData } = await supabaseClient
        .from('product_images')
        .select('id, product_id, url, alt_text, sort_order, is_primary')
        .in('product_id', localIds);
      if (imgData) images = imgData;
    }

    const variantsByProduct = new Map<string, any[]>();
    for (const v of variants || []) {
      const list = variantsByProduct.get(v.product_id) || [];
      list.push(v);
      variantsByProduct.set(v.product_id, list);
    }

    const imagesByProduct = new Map<string, any[]>();
    for (const img of images || []) {
      const list = imagesByProduct.get(img.product_id) || [];
      list.push(img);
      imagesByProduct.set(img.product_id, list);
    }

    const upsertProducts: any[] = [];
    const unpublishProducts: Array<{ id: string; updated_at?: string }> = [];

    // 3. Procesar productos locales (moneda inmutable: UYU)
    for (const p of localProducts || []) {
      const isPublished = p.status === 'published' && p.is_active !== false;

      if (!isPublished) {
        unpublishProducts.push({
          id: p.id,
          updated_at: p.updated_at || new Date().toISOString(),
        });
        continue;
      }

      const prodVariants = variantsByProduct.get(p.id) || [];
      const prodImages = imagesByProduct.get(p.id) || [];
      const primaryImg = prodImages.find((img: any) => img.is_primary)?.url || prodImages[0]?.url || null;

      const activeVariants = prodVariants.filter((v: any) => v.is_active !== false);
      const totalStock = activeVariants.length > 0
        ? activeVariants.reduce((sum: number, v: any) => sum + Math.max(0, Number(v.inventory_count || 0)), 0)
        : Number(p.stock ?? 0);

      upsertProducts.push({
        id: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        short_description: p.short_description,
        sku: p.sku,
        catalog_source: 'local',
        source_provider: 'platform',
        source_market: 'UY',
        is_international: false,
        currency: 'UYU',
        price_currency: 'UYU',
        base_price: Number(p.base_price || 0),
        compare_at_price: p.compare_at_price != null ? Number(p.compare_at_price) : null,
        final_price_usd: null,
        final_price_uyu: Number(p.base_price || 0),
        status: p.status || 'published',
        is_active: true,
        stock: totalStock,
        stock_status: totalStock > 0 ? 'in_stock' : 'out_of_stock',
        availability_type: totalStock > 0 ? 'immediate' : 'out_of_stock',
        primary_image_url: primaryImg,
        images: prodImages,
        variants: activeVariants,
        category_id: p.category_id,
        brand_id: p.brand_id,
        license_id: p.license_id,
        vendor_id: p.vendor_id,
        vendor_store_id: p.vendor_store_id,
        updated_at: p.updated_at || new Date().toISOString(),
      });
    }

    // 4. Procesar productos internacionales (moneda inmutable: USD con conversión UYU)
    for (const ip of intlProducts) {
      const isPublished = ip.status === 'published' && ip.availability !== 'discontinued';
      if (!isPublished) {
        unpublishProducts.push({
          id: ip.id,
          updated_at: ip.updated_at || new Date().toISOString(),
        });
        continue;
      }

      const priceUsd = Number(ip.final_price_usd ?? ip.base_price_usd ?? 0);
      const priceUyu = ip.final_price_uyu != null ? Number(ip.final_price_uyu) : Math.round(priceUsd * 43.5);
      const isAvailable = ip.availability !== 'out_of_stock' && ip.availability !== 'unavailable';
      const gallery = Array.isArray(ip.gallery_images) ? ip.gallery_images : [];
      const primaryImg = ip.image_url || gallery[0] || null;

      upsertProducts.push({
        id: ip.id,
        slug: ip.slug || ip.id,
        title: ip.title,
        description: ip.description,
        short_description: ip.short_description || null,
        sku: ip.sku || null,
        catalog_source: 'international',
        source_provider: 'zinc',
        source_market: 'US',
        is_international: true,
        currency: 'USD',
        price_currency: 'USD',
        base_price: priceUsd,
        compare_at_price: null,
        final_price_usd: priceUsd,
        final_price_uyu: priceUyu,
        status: ip.status || 'published',
        is_active: isAvailable,
        stock: isAvailable ? 1 : 0,
        stock_status: isAvailable ? 'in_stock' : 'out_of_stock',
        availability_type: 'international_import',
        primary_image_url: primaryImg,
        images: gallery.map((url: string, idx: number) => ({ id: `${ip.id}-img-${idx}`, url, is_primary: idx === 0 })),
        variants: [{ id: `${ip.id}-intl-default`, name: 'Importación Directa', inventory_count: isAvailable ? 1 : 0, is_active: isAvailable }],
        category_id: ip.collectibles_category_id || null,
        brand_id: null,
        brand_name: ip.brand || 'Importado',
        updated_at: ip.updated_at || new Date().toISOString(),
      });
    }

    const payload: Record<string, any> = {
      batch_id: `sync-n1-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      upsert_products: upsertProducts,
      unpublish_product_ids: unpublishProducts,
      cursor: {
        entity_type: 'event_level_1',
        last_updated_at: new Date().toISOString(),
        last_id: cleanIds[0],
      },
    };

    const rawBody = JSON.stringify(payload);
    const timestampMs = String(Date.now());
    const signature = await computeHmacSignature(syncSecret, timestampMs, rawBody);

    const customFetch = options.fetcher || fetch;
    const res = await customFetch(`${workerUrl.replace(/\/+$/, '')}/api/v1/internal/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${syncSecret}`,
        'X-Catalog-Timestamp': timestampMs,
        'X-Catalog-Signature': signature,
      },
      body: rawBody,
      signal: controller.signal,
    });

    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[CF_SYNC] Worker respondió HTTP ${res.status}: ${errText.slice(0, 150)}`);
      return { ok: false, durationMs, recordsSynced: 0, outboxEnqueued, error: `HTTP_${res.status}` };
    }

    return { ok: true, durationMs, recordsSynced: upsertProducts.length + unpublishProducts.length, outboxEnqueued };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.warn(`[CF_SYNC] Error silencioso al propagar a D1: ${err?.message || err}`);
    return { ok: false, durationMs, recordsSynced: 0, outboxEnqueued, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drenador y reconciliador atómico de lotes de outbox (`d1_catalog_outbox`).
 * Utiliza reserva atómica con `FOR UPDATE SKIP LOCKED` (vía RPC `claim_d1_outbox_batch`)
 * con recuperación automática de eventos atascados y retroceso exponencial ante fallas.
 */
export async function processOutboxBatch(
  supabaseClient: any,
  options: {
    batchSize?: number;
    workerUrl?: string;
    syncSecret?: string;
    workerId?: string;
    fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  } = {}
): Promise<OutboxBatchResult> {
  const batchSize = Math.max(1, Math.min(50, options.batchSize || 25));
  const workerId = options.workerId || `worker-${Math.random().toString(36).slice(2, 9)}`;

  try {
    let rows: any[] = [];

    // 1. Intentar reserva atómica con la función RPC PostgreSQL
    try {
      const { data: claimedRows, error: rpcErr } = await supabaseClient.rpc('claim_d1_outbox_batch', {
        p_batch_size: batchSize,
        p_worker_id: workerId,
        p_stuck_interval_seconds: 300,
      });

      if (!rpcErr && Array.isArray(claimedRows)) {
        rows = claimedRows;
      }
    } catch {
      // Si la RPC aún no está definida en la base, continuar con fallback
    }

    // 2. Fallback: reserva directa en base de datos si la RPC no devolvió filas
    if (rows.length === 0) {
      const nowIso = new Date().toISOString();

      // Recuperar posibles filas atascadas en 'processing' por más de 5 minutos
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      try {
        await supabaseClient
          .from('d1_catalog_outbox')
          .update({
            status: 'pending',
            locked_at: null,
            locked_by: null,
            last_error: 'Stuck event recovered',
          })
          .eq('status', 'processing')
          .lte('locked_at', fiveMinutesAgo);
      } catch {
        // Fallback defensivo si el cliente o mock no implementa encadenamiento
      }

      // Obtener filas pendientes
      const { data: candidateRows, error: fetchErr } = await supabaseClient
        .from('d1_catalog_outbox')
        .select('id, event_type, entity_id, version_timestamp, attempts, max_attempts')
        .in('status', ['pending', 'failed'])
        .lte('next_attempt_at', nowIso)
        .order('next_attempt_at', { ascending: true })
        .limit(batchSize);

      if (fetchErr || !candidateRows || candidateRows.length === 0) {
        return { ok: true, processed: 0, deadLetters: 0, errors: 0, workerId };
      }

      rows = candidateRows;
      // Bloquear atómicamente asignando el workerId
      await supabaseClient
        .from('d1_catalog_outbox')
        .update({
          status: 'processing',
          locked_at: nowIso,
          locked_by: workerId,
        })
        .in('id', rows.map((r: any) => r.id));
    }

    if (rows.length === 0) {
      return { ok: true, processed: 0, deadLetters: 0, errors: 0, workerId };
    }

    // 3. Deduplicación inteligente: si un mismo entity_id tiene varios eventos en el lote,
    // sincronizarlo una sola vez con su estado más reciente
    const latestByEntity = new Map<string, any>();
    for (const r of rows) {
      const existing = latestByEntity.get(r.entity_id);
      if (!existing || new Date(r.version_timestamp).getTime() > new Date(existing.version_timestamp).getTime()) {
        latestByEntity.set(r.entity_id, r);
      }
    }

    const uniqueProductIds = Array.from(latestByEntity.keys());
    const syncRes = await syncProductsToCloudflareD1(uniqueProductIds, supabaseClient, {
      workerUrl: options.workerUrl,
      syncSecret: options.syncSecret,
      fetcher: options.fetcher,
      useOutbox: false, // Evitar ciclo recursivo
    });

    let deadLetters = 0;
    let errors = 0;

    if (syncRes.ok) {
      // Éxito: marcar todas las filas del lote como sincronizadas
      const syncedIds = rows.map((r: any) => r.id);
      await supabaseClient
        .from('d1_catalog_outbox')
        .update({
          status: 'synced',
          locked_at: null,
          locked_by: null,
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .in('id', syncedIds);

      return { ok: true, processed: rows.length, deadLetters: 0, errors: 0, workerId };
    }

    // Fallo de sincronización: incrementar intentos, calcular backoff o mover a dead_letter
    for (const r of rows) {
      const nextAttempts = (r.attempts || 0) + 1;
      const maxAttempts = r.max_attempts || 5;

      if (nextAttempts >= maxAttempts) {
        deadLetters++;
        await supabaseClient
          .from('d1_catalog_outbox')
          .update({
            attempts: nextAttempts,
            status: 'dead_letter',
            locked_at: null,
            locked_by: null,
            last_error: syncRes.error || 'MAX_RETRIES_EXCEEDED',
            processed_at: new Date().toISOString(),
          })
          .eq('id', r.id);
      } else {
        errors++;
        const nextAttemptAt = calculateNextBackoff(nextAttempts);
        await supabaseClient
          .from('d1_catalog_outbox')
          .update({
            attempts: nextAttempts,
            status: 'failed',
            locked_at: null,
            locked_by: null,
            last_error: syncRes.error || 'SYNC_FAILED',
            next_attempt_at: nextAttemptAt,
          })
          .eq('id', r.id);
      }
    }

    return { ok: false, processed: rows.length, deadLetters, errors, workerId };
  } catch (err: any) {
    console.warn('[D1_OUTBOX] Excepción al procesar lote outbox:', err?.message || err);
    return { ok: false, processed: 0, deadLetters: 0, errors: 1, workerId };
  }
}
