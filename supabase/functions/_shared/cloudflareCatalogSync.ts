/**
 * cloudflareCatalogSync.ts — Sincronización Asíncrona No Bloqueante Supabase -> Cloudflare D1
 * (Mecanismo Nivel 1 para Edge Functions: create-order, confirm-payment, admin-products)
 *
 * Garantías:
 * 1. Cero impacto en la transacción comercial: envuelve todo en try/catch seguro; jamás falla un pedido.
 * 2. Autenticación estricta: Bearer Token + Firma HMAC-SHA256 con timestamp unix.
 * 3. Consultas planas sin joins pesados a PostgreSQL.
 * 4. Timeout acotado (2500 ms) para evitar retención de recursos en Deno/Edge.
 */

export interface SyncProductResult {
  ok: boolean;
  durationMs: number;
  recordsSynced: number;
  error?: string;
}

/**
 * Calcula la firma HMAC-SHA256 compatible con el Worker de Cloudflare
 */
async function computeHmacSignature(secret: string, timestampMs: string, rawBody: string): Promise<string> {
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
 * Sincroniza uno o más productos hacia Cloudflare D1 de forma asíncrona y segura.
 */
export async function syncProductsToCloudflareD1(
  productIds: string[],
  supabaseClient: any,
  options: {
    workerUrl?: string;
    syncSecret?: string;
    timeoutMs?: number;
  } = {}
): Promise<SyncProductResult> {
  const startedAt = Date.now();
  const cleanIds = Array.from(new Set(productIds.map(String).filter(Boolean)));
  if (cleanIds.length === 0) {
    return { ok: true, durationMs: 0, recordsSynced: 0 };
  }

  const workerUrl = options.workerUrl || Deno.env.get('CF_CATALOG_API_URL') || 'https://collectibles-catalog-api.pixelsncodes-uy.workers.dev';
  const syncSecret = options.syncSecret || Deno.env.get('CATALOG_SYNC_SECRET');

  if (!syncSecret) {
    console.warn('[CF_SYNC_NIVEL_1] CATALOG_SYNC_SECRET no configurado en entorno. Omitiendo sync D1.');
    return { ok: false, durationMs: Date.now() - startedAt, recordsSynced: 0, error: 'MISSING_SECRET' };
  }

  const timeoutMs = options.timeoutMs ?? 2500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. Consulta plana y acotada a productos (máx. 25 IDs)
    const { data: products, error: prodErr } = await supabaseClient
      .from('products')
      .select('id, slug, title, description, short_description, sku, base_price, compare_at_price, status, is_active, condition, category_id, brand_id, license_id, vendor_id, vendor_store_id, is_international, created_at, updated_at')
      .in('id', cleanIds.slice(0, 25));

    if (prodErr || !products || products.length === 0) {
      clearTimeout(timer);
      return { ok: false, durationMs: Date.now() - startedAt, recordsSynced: 0, error: prodErr?.message || 'NO_PRODUCTS_FOUND' };
    }

    // 2. Consulta plana a variantes para stock canónico
    const { data: variants } = await supabaseClient
      .from('product_variants')
      .select('id, product_id, sku, name, price_adjustment, inventory_count, is_active')
      .in('product_id', cleanIds.slice(0, 25));

    // 3. Consulta plana a imágenes
    const { data: images } = await supabaseClient
      .from('product_images')
      .select('id, product_id, url, alt_text, sort_order, is_primary')
      .in('product_id', cleanIds.slice(0, 25));

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

    // 4. Transformar a payload compatible con /api/v1/internal/sync
    const upsertProducts = products.map((p: any) => {
      const prodVariants = variantsByProduct.get(p.id) || [];
      const prodImages = imagesByProduct.get(p.id) || [];
      const primaryImg = prodImages.find((img: any) => img.is_primary)?.url || prodImages[0]?.url || null;

      // Cálculo de stock canónico
      const activeVariants = prodVariants.filter((v: any) => v.is_active !== false);
      const totalStock = activeVariants.length > 0
        ? activeVariants.reduce((sum: number, v: any) => sum + Math.max(0, Number(v.inventory_count || 0)), 0)
        : 0;

      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        short_description: p.short_description,
        sku: p.sku,
        base_price: Number(p.base_price || 0),
        compare_at_price: p.compare_at_price != null ? Number(p.compare_at_price) : null,
        final_price_uyu: Number(p.base_price || 0),
        status: p.status || 'published',
        is_active: p.is_active !== false,
        stock: totalStock,
        stock_status: totalStock > 0 ? 'in_stock' : 'out_of_stock',
        availability_type: totalStock > 0 ? 'immediate' : 'out_of_stock',
        is_international: Boolean(p.is_international),
        currency: 'UYU',
        primary_image_url: primaryImg,
        images: prodImages,
        variants: activeVariants,
        category_id: p.category_id,
        brand_id: p.brand_id,
        license_id: p.license_id,
        vendor_id: p.vendor_id,
        vendor_store_id: p.vendor_store_id,
        updated_at: new Date().toISOString(),
      };
    });

    const payload = {
      batch_id: `sync-n1-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      upsert_products: upsertProducts,
      cursor: {
        entity_type: 'event_level_1',
        last_updated_at: new Date().toISOString(),
        last_id: cleanIds[0],
      },
    };

    const rawBody = JSON.stringify(payload);
    const timestampMs = String(Date.now());
    const signature = await computeHmacSignature(syncSecret, timestampMs, rawBody);

    const res = await fetch(`${workerUrl.replace(/\/+$/, '')}/api/v1/internal/sync`, {
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
      console.warn(`[CF_SYNC_NIVEL_1] Worker respondió HTTP ${res.status}: ${errText.slice(0, 150)}`);
      return { ok: false, durationMs, recordsSynced: 0, error: `HTTP_${res.status}` };
    }

    return { ok: true, durationMs, recordsSynced: upsertProducts.length };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    console.warn(`[CF_SYNC_NIVEL_1] Error silencioso al propagar a D1: ${err.message}`);
    return { ok: false, durationMs, recordsSynced: 0, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}
