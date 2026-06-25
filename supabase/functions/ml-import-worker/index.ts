import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ML_CLIENT_ID = Deno.env.get("MERCADOLIBRE_CLIENT_ID") || "";
const ML_CLIENT_SECRET = Deno.env.get("MERCADOLIBRE_CLIENT_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-test-bypass",
};

// ══════════════════════════════════════════════════════════════
// Helpers copied from mercadolibre-sync/index.ts for compatibility
// ══════════════════════════════════════════════════════════════

async function getValidMercadoLibreToken(supabase: any, sellerId?: string) {
  let query = supabase.from('ml_seller_accounts').select('*');
  if (sellerId) {
    query = query.eq('seller_id', sellerId);
  } else {
    query = query.is('vendor_id', null);
  }
  let { data } = await query.maybeSingle();
  
  if (!data && !sellerId) {
     const { data: fallbackData } = await supabase.from('ml_seller_accounts').select('*').limit(1).maybeSingle();
     data = fallbackData;
  }
  
  if (!data) return null;
  
  let currentAccessToken = data.access_token;
  let currentRefreshToken = data.refresh_token;
  let currentExpiresAt = data.expires_at;
  
  if (currentExpiresAt && new Date(currentExpiresAt) <= new Date()) {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: currentRefreshToken
    });
    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
       method: "POST",
       headers: { "Content-Type": "application/x-www-form-urlencoded" },
       body: params.toString()
    });
    if (res.ok) {
       const mlData = await res.json();
       const expiresAt = new Date(Date.now() + (mlData.expires_in * 1000)).toISOString();
       currentAccessToken = mlData.access_token;
       currentRefreshToken = mlData.refresh_token || currentRefreshToken;
       currentExpiresAt = expiresAt;
       
       await supabase.from('ml_seller_accounts').update({
           access_token: currentAccessToken,
           refresh_token: currentRefreshToken,
           expires_at: currentExpiresAt,
           updated_at: new Date().toISOString()
       }).eq('id', data.id);
    } else {
       throw new Error("Mercado Libre token refresh failed.");
    }
  }
  
  return currentAccessToken;
}

function cleanTitle(title: string): string {
  let t = title;
  const spamWords = [
    /envío gratis/gi, /envio gratis/gi, /nuevo/gi, /garantía/gi, /garantia/gi,
    /original/gi, /meli/gi, /mercado libre/gi, /mercadolibre/gi, /cuotas/gi,
    /impecable/gi, /caja/gi, /oferta/gi, /exclusivo/gi, /descuento/gi
  ];
  for (const regex of spamWords) {
    t = t.replace(regex, "");
  }
  t = t.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
  t = t.replace(/[!¡?¿*\"#]/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

async function suggestInternalCategory(supabase: any, cleanTitleText: string) {
  const t = cleanTitleText.toLowerCase();
  const { data: rules } = await supabase
    .from('category_keyword_rules')
    .select('category_id, keyword, priority');

  let bestCategoryId = null;
  let highestPriority = -1;

  if (rules) {
    for (const r of rules) {
      const kw = r.keyword.toLowerCase();
      if (t.includes(kw) && r.priority > highestPriority) {
        bestCategoryId = r.category_id;
        highestPriority = r.priority;
      }
    }
  }
  return bestCategoryId;
}

function detectUniverseAndLine(cleanTitleText: string) {
  const t = cleanTitleText.toLowerCase();
  let universe = null;
  let line = null;

  if (t.includes("marvel") || t.includes("avengers") || t.includes("spiderman") || t.includes("iron man") || t.includes("thor")) {
    universe = "Marvel";
  } else if (t.includes("dc comics") || t.includes("batman") || t.includes("superman") || t.includes("joker") || t.includes("justice league")) {
    universe = "DC Comics";
  } else if (t.includes("star wars") || t.includes("darth vader") || t.includes("mandalorian") || t.includes("jedi")) {
    universe = "Star Wars";
  } else if (t.includes("harry potter") || t.includes("hogwarts") || t.includes("gryffindor")) {
    universe = "Harry Potter";
  } else if (t.includes("pokemon") || t.includes("pikachu") || t.includes("charizard")) {
    universe = "Pokémon";
  } else if (t.includes("dragon ball") || t.includes("goku") || t.includes("vegeta")) {
    universe = "Dragon Ball";
  } else if (t.includes("anime") || t.includes("naruto") || t.includes("one piece")) {
    universe = "Anime";
  }

  if (t.includes("funko") || t.includes("pop!")) {
    line = "Funko POP";
  } else if (t.includes("marvel legends")) {
    line = "Marvel Legends";
  } else if (t.includes("black series")) {
    line = "Black Series";
  } else if (t.includes("mcfarlane")) {
    line = "McFarlane";
  } else if (t.includes("die cast") || t.includes("diecast") || t.includes("1:64")) {
    line = "Die-Cast";
  } else if (t.includes("vintage")) {
    line = "Vintage";
  }

  return { universe, line };
}

function extractRealSkuFromML(item: any, variation: any = null) {
   let sku = null;
   let source = 'missing';
   const getFromAttr = (attrs: any[], code: string) => attrs?.find((a: any) => a.id === code)?.value_name;

   if (item.seller_custom_field) { sku = item.seller_custom_field; source = 'seller_custom_field'; }
   else if (variation?.seller_custom_field) { sku = variation.seller_custom_field; source = 'seller_custom_field_var'; }
   else if (getFromAttr(item.attributes, 'SELLER_SKU')) { sku = getFromAttr(item.attributes, 'SELLER_SKU'); source = 'seller_sku'; }
   else if (getFromAttr(item.attributes, 'SKU')) { sku = getFromAttr(item.attributes, 'SKU'); source = 'sku'; }
   else if (item.inventory_id) { sku = item.inventory_id; source = 'inventory_id'; }
   else if (variation?.inventory_id) { sku = variation.inventory_id; source = 'inventory_id_var'; }

   if (!sku) {
       sku = item.id; 
       source = 'ml_item_id_fallback';
   }
   return { sku, source, generated_sku: sku };
}

// Custom Fetch with backoff for rate limits
async function customFetch(url: string, init?: any): Promise<Response> {
  let attempts = 0;
  const maxAttempts = 3;
  let delay = 1000;
  while (attempts < maxAttempts) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429) {
        console.warn(`[ML API 429] Rate limit hit on ${url}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        attempts++;
        delay *= 2;
        continue;
      }
      return res;
    } catch (err: any) {
      if (attempts === maxAttempts - 1) throw err;
      console.warn(`[ML API Error] Fetch failed on ${url}: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      attempts++;
      delay *= 2;
    }
  }
  return fetch(url, init);
}

// ══════════════════════════════════════════════════════════════
// Core Sync Function logic adapted for a single item
// ══════════════════════════════════════════════════════════════

async function importMLItemToStaging(supabase: any, mlId: string, sellerId: string, vendorId: string | null, token: string) {
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  
  // 1. Fetch ML Item
  let res = await customFetch(`https://api.mercadolibre.com/items/${mlId}`, { headers });
  if (res.status === 429) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  if (res.status === 401) {
    console.log(`[Staging Ingest] Auth failed for item ${mlId}, falling back to public fetch...`);
    res = await customFetch(`https://api.mercadolibre.com/items/${mlId}`);
    if (res.status === 429) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
  }
  const item = await res.json();
  if (!res.ok) {
    throw new Error(item.message || `No se pudo obtener el item de ML (status ${res.status})`);
  }

  // 2. Fetch Description
  let description = item.title;
  try {
    let descRes = await customFetch(`https://api.mercadolibre.com/items/${mlId}/description`, { headers });
    if (descRes.status === 429) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
    if (descRes.status === 401) {
      descRes = await customFetch(`https://api.mercadolibre.com/items/${mlId}/description`);
      if (descRes.status === 429) {
        throw new Error("RATE_LIMIT_EXCEEDED");
      }
    }
    if (descRes.ok) {
      const descData = await descRes.json();
      description = descData.plain_text || item.title;
    }
  } catch(_e: any) {
    if (_e.message === "RATE_LIMIT_EXCEEDED") throw _e;
    /* description fallback */
  }

  // 3. Extract details
  const { sku: sellerSku } = extractRealSkuFromML(item);
  const catalogProductId = item.catalog_product_id || null;
  const originalSellerId = (item.seller_id || "").toString();
  const titleOriginal = item.title;
  const price = Number(item.price || 0);
  const stock = Number(item.available_quantity || 0);
  const permalink = item.permalink;
  const thumbnail = (item.pictures?.[0]?.secure_url || item.pictures?.[0]?.url || item.thumbnail || "").replace('http://', 'https://');

  // 4. Run Normalizer
  const cleanTitleText = cleanTitle(titleOriginal);
  
  // Detect Brand
  let brandId = null;
  let brandName = item.attributes?.find((a: any) => a.id === 'BRAND')?.value_name || null;
  if (brandName) {
     const { data: existingBrands } = await supabase
       .from('brands')
       .select('id, status, owner_vendor_id')
       .ilike('name', brandName.trim());
     
     const approvedBrand = existingBrands?.find((b: any) => b.status === 'approved');
     const vendorPendingBrand = vendorId ? existingBrands?.find((b: any) => b.status === 'pending_review' && b.owner_vendor_id === vendorId) : null;
     
     if (approvedBrand) {
        brandId = approvedBrand.id;
     } else if (vendorPendingBrand) {
        brandId = vendorPendingBrand.id;
     } else {
        const slugBrandBase = brandName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
        const slugBrand = vendorId ? `${slugBrandBase}-v${vendorId.substring(0, 4)}` : slugBrandBase;
        const { data: newBr } = await supabase
          .from('brands')
          .insert({
            name: brandName.trim(),
            slug: slugBrand,
            owner_vendor_id: vendorId || null,
            status: vendorId ? 'pending_review' : 'approved',
            is_active: true
          })
          .select()
          .single();
        if (newBr) brandId = newBr.id;
     }
  }

  // Suggest Category, Universe and Line
  const suggestedInternalCategoryId = await suggestInternalCategory(supabase, cleanTitleText);
  const { universe, line } = detectUniverseAndLine(cleanTitleText);

  // 5. Store / Upsert in ml_raw_items Zone
  const rawPayloadObj = {
     ...item,
     description,
     normalized_metadata: {
       clean_title: cleanTitleText,
       brand_name: brandName,
       brand_id: brandId,
       suggested_category_id: suggestedInternalCategoryId,
       detected_universe: universe,
       detected_line: line,
       extracted_seller_sku: sellerSku
     }
  };

  // Get Safe Seller ID mapping (checks if seller account exists)
  const { data: sellerAcc } = await supabase
    .from('ml_seller_accounts')
    .select('seller_id')
    .eq('seller_id', originalSellerId)
    .maybeSingle();
  const safeSellerId = sellerAcc ? originalSellerId : sellerId;

  const { data: rawRecord, error: rawErr } = await supabase
    .from('ml_raw_items')
    .upsert({
       seller_id: safeSellerId,
       ml_item_id: mlId,
       catalog_product_id: catalogProductId,
       title: titleOriginal,
       price: price,
       currency_id: item.currency_id || 'UYU',
       available_quantity: stock,
       permalink: permalink,
       thumbnail: thumbnail,
       raw_payload: rawPayloadObj,
       status: 'analyzing',
       updated_at: new Date().toISOString()
    }, { onConflict: 'ml_item_id' })
    .select()
    .single();

  if (rawErr) throw new Error(`Failed to save raw item: ${rawErr.message}`);

  // Delete existing matches first
  await supabase
    .from('ml_import_matches')
    .delete()
    .eq('raw_item_id', rawRecord.id);

  // 6. Matching Engine
  const matchesToInsert = [];

  // SKU Match
  if (sellerSku) {
    const { data: skuMatches } = await supabase
      .from('product_variants')
      .select('product_id')
      .eq('sku', sellerSku);
    if (skuMatches) {
       for (const m of skuMatches) {
         matchesToInsert.push({
           raw_item_id: rawRecord.id,
           matched_product_id: m.product_id,
           match_type: 'sku',
           confidence_score: 0.95,
           is_strong: true
         });
       }
    }
  }

  // GTIN Match
  const gtinAttr = item.attributes?.find((a: any) => ['GTIN', 'EAN', 'UPC'].includes(a.id))?.value_name;
  if (gtinAttr) {
    const { data: gtinMatches } = await supabase
      .from('product_variants')
      .select('product_id')
      .eq('sku', gtinAttr);
    if (gtinMatches) {
       for (const m of gtinMatches) {
         if (!matchesToInsert.some(x => x.matched_product_id === m.product_id)) {
           matchesToInsert.push({
             raw_item_id: rawRecord.id,
             matched_product_id: m.product_id,
             match_type: 'gtin',
             confidence_score: 0.90,
             is_strong: true
           });
         }
       }
    }
  }

  // Catalog Product ID Match
  if (catalogProductId) {
    const { data: catMatches } = await supabase
      .from('products')
      .select('id')
      .contains('metadata', { catalog_product_id: catalogProductId });
    if (catMatches) {
       for (const m of catMatches) {
         if (!matchesToInsert.some(x => x.matched_product_id === m.id)) {
           matchesToInsert.push({
             raw_item_id: rawRecord.id,
             matched_product_id: m.id,
             match_type: 'catalog_id',
             confidence_score: 1.00,
             is_strong: true
           });
         }
       }
    }
  }

  // Trigram Title Match
  const { data: trgmMatches, error: trgmErr } = await supabase.rpc('match_products_by_title', {
     title_query: cleanTitleText,
     similarity_threshold: 0.3
  });
  if (!trgmErr && trgmMatches) {
     for (const m of trgmMatches) {
        if (!matchesToInsert.some(x => x.matched_product_id === m.id)) {
           const confidence = Number(m.similarity.toFixed(2));
           matchesToInsert.push({
              raw_item_id: rawRecord.id,
              matched_product_id: m.id,
              match_type: 'title_similarity',
              confidence_score: confidence,
              is_strong: confidence >= 0.80
           });
        }
     }
  }

  if (matchesToInsert.length > 0) {
     await supabase.from('ml_import_matches').insert(matchesToInsert);
  }

  // Update classification status
  const finalStatus = matchesToInsert.length > 0 ? 'review_needed' : 'pending';
  await supabase
    .from('ml_raw_items')
    .update({ status: finalStatus, updated_at: new Date().toISOString() })
    .eq('id', rawRecord.id);

  // Log success
  await supabase.from('ml_import_logs').insert({
     seller_id: safeSellerId,
     action: 'staging_import',
     status: 'success',
     details: {
       ml_item_id: mlId,
       raw_item_id: rawRecord.id,
       clean_title: cleanTitleText,
       match_count: matchesToInsert.length,
       final_status: finalStatus
     }
  });

  // Classify item status
  const mlStatus = item.status || 'active';
  const stockQty = Number(item.available_quantity || 0);
  
  let itemCategory = "importado";
  let itemReason = "active";
  
  if (mlStatus === 'closed' || mlStatus === 'deleted') {
    itemCategory = "no_elegible";
    itemReason = mlStatus;
  } else if (stockQty === 0) {
    itemCategory = "omitido";
    itemReason = "out_of_stock";
  } else if (mlStatus === 'paused') {
    itemCategory = "omitido";
    itemReason = "paused";
  }

  return { status: "success", category: itemCategory, reason: itemReason };
}

// ══════════════════════════════════════════════════════════════
// Deno Serve Entry point
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// Helper: Process a single batch of items for a job
// ══════════════════════════════════════════════════════════════

async function processBatchForJob(supabase: any, job: any): Promise<number> {
  console.log(`[ML Import Worker] Processing Job ${job.id} for seller ${job.seller_id}`);

  // 1. Fetch and claim a batch of pending/failed items using the atomic claim function
  const BATCH_SIZE = 24;
  const { data: pendingItems, error: itemsErr } = await supabase
    .rpc('claim_import_job_items', { p_job_id: job.id, p_limit: BATCH_SIZE });

  if (itemsErr) throw itemsErr;

  // Check if the job has finished entirely
  if (!pendingItems || pendingItems.length === 0) {
    // Check if there are any remaining running items
    const { count: runningCount } = await supabase
      .from('ml_import_job_items')
      .select('*', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .eq('status', 'running');

    if ((runningCount || 0) === 0) {
      // If absolutely no pending/failed/running items are left, set job as complete
      const { count: failedItemsCount } = await supabase
        .from('ml_import_job_items')
        .select('*', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .eq('status', 'failed');
      
      const finalJobStatus = (failedItemsCount || 0) > 0 ? 'partial' : 'completed';
      await supabase
        .from('ml_import_jobs')
        .update({
          status: finalJobStatus,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          estimated_finish_at: null // Clear when complete
        })
        .eq('id', job.id);
      
      console.log(`[ML Import Worker] Job ${job.id} finished with status: ${finalJobStatus}`);
    } else {
      console.log(`[ML Import Worker] Job ${job.id} has items currently running. Waiting...`);
    }

    return 0;
  }

  // 2. Prepare items processing state
  const itemIds = pendingItems.map((it: any) => it.id);
  const itemAttemptsMap = new Map(pendingItems.map((it: any) => [it.id, it.attempts]));
  const processedItemIds = new Set<string>();

  // 3. Retrieve valid token for this seller
  let token = "";
  try {
    token = await getValidMercadoLibreToken(supabase, job.seller_id);
  } catch (tokenErr: any) {
    // Mark batch items as failed if token fails
    await supabase
      .from('ml_import_job_items')
      .update({
        status: 'failed',
        attempts: pendingItems[0].attempts + 1,
        error_message: `Token auth error: ${tokenErr.message}`,
        http_status: 401,
        processed_at: new Date().toISOString()
      })
      .in('id', itemIds);

    await supabase
      .from('ml_import_jobs')
      .update({
        last_error: `Auth error: ${tokenErr.message}`,
        error_items: (job.error_items || 0) + pendingItems.length,
        processed_items: (job.processed_items || 0) + pendingItems.length,
        last_processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id);

    throw tokenErr;
  }

  // 4. Process in parallel chunks with dynamic concurrency limit
  let batchImported = 0;
  let batchSkipped = 0;
  let batchErrors = 0;
  let rateLimitDetected = false;

  let concurrencyLimit = 5; // Default to 5 concurrent requests
  let offset = 0;
  
  while (offset < pendingItems.length) {
    if (rateLimitDetected) {
      concurrencyLimit = 2; // Drop to 2 if 429 detected
    }
    
    const chunk = pendingItems.slice(offset, offset + concurrencyLimit);
    offset += concurrencyLimit;
    
    await Promise.all(chunk.map(async (item: any) => {
      const nextAttempt = (itemAttemptsMap.get(item.id) || 0) + 1;
      try {
        const result = await importMLItemToStaging(supabase, item.ml_item_id, job.seller_id, job.vendor_id, token);
        
        await supabase
          .from('ml_import_job_items')
          .update({
            status: 'completed',
            attempts: nextAttempt,
            processed_at: new Date().toISOString(),
            error_message: null,
            http_status: 200
          })
          .eq('id', item.id);

        processedItemIds.add(item.id);

        if (result.category === 'omitido' || result.category === 'no_elegible') {
          batchSkipped++;
        } else {
          batchImported++;
        }

      } catch (err: any) {
        processedItemIds.add(item.id);
        batchErrors++;
        
        const isRateLimit = err.message === 'RATE_LIMIT_EXCEEDED' || err.status === 429;
        if (isRateLimit) {
          rateLimitDetected = true;
          console.warn(`[ML Import Worker] Rate limit 429 detected for item ${item.ml_item_id}`);
          
          await supabase
            .from('ml_import_job_items')
            .update({
              status: 'failed',
              attempts: nextAttempt,
              error_message: 'Mercado Libre Rate Limit Exceeded (429)',
              http_status: 429,
              processed_at: new Date().toISOString()
            })
            .eq('id', item.id);
        } else {
          console.error(`[ML Import Worker] Failed item ${item.ml_item_id}:`, err.message);
          await supabase
            .from('ml_import_job_items')
            .update({
              status: 'failed',
              attempts: nextAttempt,
              error_message: err.message,
              http_status: err.status || 500,
              processed_at: new Date().toISOString()
            })
            .eq('id', item.id);
        }
      }
    }));

    if (rateLimitDetected) {
      console.log(`[ML Import Worker] Aborting batch processing early due to 429 Rate Limit`);
      break;
    }
  }

  // 5. Reset any unprocessed items in this batch from 'running' back to 'pending'
  const unprocessedItems = pendingItems.filter((it: any) => !processedItemIds.has(it.id));
  if (unprocessedItems.length > 0) {
    const unprocessedIds = unprocessedItems.map((it: any) => it.id);
    await supabase
      .from('ml_import_job_items')
      .update({ status: 'pending' })
      .in('id', unprocessedIds);
    console.log(`[ML Import Worker] Reset ${unprocessedIds.length} unprocessed items back to pending`);
  }

  // 6. Update job stats in database
  const totalProcessed = (pendingItems.length - unprocessedItems.length);
  
  // Retrieve current aggregates
  const { data: updatedJob } = await supabase
    .from('ml_import_jobs')
    .select('processed_items, imported_items, skipped_items, error_items, started_at, total_items')
    .eq('id', job.id)
    .single();

  const newProcessed = (updatedJob?.processed_items || 0) + totalProcessed;
  const newImported = (updatedJob?.imported_items || 0) + batchImported;
  const newSkipped = (updatedJob?.skipped_items || 0) + batchSkipped;
  const newErrors = (updatedJob?.error_items || 0) + batchErrors;

  // Calculate items_per_minute & estimated_finish_at
  const startedAtTime = updatedJob?.started_at ? new Date(updatedJob.started_at).getTime() : Date.now();
  const durationMs = Date.now() - startedAtTime;
  const durationMinutes = durationMs / 60000;
  const itemsPerMin = durationMinutes > 0.05 ? Math.round(newProcessed / durationMinutes) : 0;
  
  let estimatedFinishAt: string | null = null;
  const remainingItems = (updatedJob?.total_items || 0) - newProcessed;
  if (itemsPerMin > 0 && remainingItems > 0) {
    const remainingMinutes = remainingItems / itemsPerMin;
    estimatedFinishAt = new Date(Date.now() + remainingMinutes * 60000).toISOString();
  }

  const updatePayload: any = {
    processed_items: newProcessed,
    imported_items: newImported,
    skipped_items: newSkipped,
    error_items: newErrors,
    items_per_minute: itemsPerMin,
    estimated_finish_at: estimatedFinishAt,
    last_processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (rateLimitDetected) {
    updatePayload.next_run_at = new Date(Date.now() + 60000).toISOString();
  } else {
    updatePayload.next_run_at = null;
  }

  await supabase
    .from('ml_import_jobs')
    .update(updatePayload)
    .eq('id', job.id);

  console.log(`[ML Import Worker] Batch processed for job ${job.id}: Imported=${batchImported}, Skipped=${batchSkipped}, Errors=${batchErrors}. Speed=${itemsPerMin} items/min`);
  return totalProcessed;
}

// ══════════════════════════════════════════════════════════════
// Deno Serve Entry point
// ══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "process_queue";

    if (action !== "process_queue") {
      return new Response(JSON.stringify({ success: false, error: `Acción '${action}' no soportada.` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      });
    }

    const startTime = Date.now();
    const maxDuration = 40000; // 40 seconds loop
    let totalProcessedCount = 0;
    let round = 1;

    while (Date.now() - startTime < maxDuration) {
      console.log(`[ML Import Worker] Starting Round ${round}...`);
      
      // 1. Fetch currently running jobs (respecting next_run_at backoff)
      const nowStr = new Date().toISOString();
      const { data: runningJobs, error: runningErr } = await supabase
        .from('ml_import_jobs')
        .select('*')
        .eq('status', 'running')
        .or(`next_run_at.is.null,next_run_at.lte.${nowStr}`)
        .order('last_processed_at', { ascending: true, nullsFirst: true });

      if (runningErr) throw runningErr;

      let activeJobs = runningJobs || [];

      // 2. If running jobs count < 3, check if we can promote pending jobs to running
      if (activeJobs.length < 3) {
         // Get list of vendors that are already active (running or paused/fetching_ids, etc.)
         const { data: allActiveJobs, error: allActiveErr } = await supabase
           .from('ml_import_jobs')
           .select('vendor_id')
           .in('status', ['running', 'fetching_ids', 'paused']);

         if (allActiveErr) throw allActiveErr;

         const activeVendorIds = new Set((allActiveJobs || []).map((j: any) => j.vendor_id).filter(Boolean));

         // Fetch pending jobs
         const { data: pendingJobs, error: pendingErr } = await supabase
           .from('ml_import_jobs')
           .select('*')
           .eq('status', 'pending')
           .order('created_at', { ascending: true });

         if (pendingErr) throw pendingErr;

         if (pendingJobs && pendingJobs.length > 0) {
            for (const pJob of pendingJobs) {
               if (activeJobs.length >= 3) break;
               
               // Avoid promoting a job if its vendor already has a running/active job
               if (pJob.vendor_id && activeVendorIds.has(pJob.vendor_id)) {
                  continue;
               }

               // Promote job to running
               const { data: updatedJob, error: promoErr } = await supabase
                 .from('ml_import_jobs')
                 .update({ 
                    status: 'running', 
                    started_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString() 
                 })
                 .eq('id', pJob.id)
                 .select()
                 .single();

               if (promoErr) {
                 console.error(`[ML Import Worker] Failed to promote job ${pJob.id}:`, promoErr.message);
                 continue;
               }

               if (updatedJob) {
                  activeJobs.push(updatedJob);
                  if (updatedJob.vendor_id) activeVendorIds.add(updatedJob.vendor_id);
               }
            }
         }
      }

      if (activeJobs.length === 0) {
         console.log(`[ML Import Worker] No active or promoteable jobs in queue.`);
         break;
      }

      // 3. Round-Robin Ordering: Sort active jobs by last_processed_at ASC (NULLS FIRST)
      activeJobs.sort((a: any, b: any) => {
         const timeA = a.last_processed_at ? new Date(a.last_processed_at).getTime() : 0;
         const timeB = b.last_processed_at ? new Date(b.last_processed_at).getTime() : 0;
         return timeA - timeB;
      });

      // Limit execution to top 3 active jobs
      const jobsToProcess = activeJobs.slice(0, 3);
      console.log(`[ML Import Worker] Round ${round} processing jobs: ${jobsToProcess.map(j => j.id).join(', ')}`);

      // 4. Process one batch of items for each of the selected active jobs concurrently
      let processedAny = false;
      await Promise.all(jobsToProcess.map(async (job) => {
         try {
            const count = await processBatchForJob(supabase, job);
            if (count > 0) {
               processedAny = true;
               totalProcessedCount += count;
            }
         } catch (jobErr: any) {
            console.error(`[ML Import Worker] Error processing batch for job ${job.id}:`, jobErr.message);
         }
      }));

      if (!processedAny) {
         console.log(`[ML Import Worker] No items processed in Round ${round}. Exiting loop.`);
         break;
      }

      round++;
      // Pause slightly between rounds (e.g. 500ms) to prevent absolute thrashing
      await new Promise(r => setTimeout(r, 500));
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Completed queue processing. Total processed items in run: ${totalProcessedCount}`,
      rounds: round - 1
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (globalErr: any) {
    console.error("[ML Import Worker] General error:", globalErr.message);
    return new Response(JSON.stringify({ success: false, error: globalErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
