import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { authenticateRequest } from '../server/lib/authGuard.js';
import { researchViaGateway } from '../server/lib/sourcingGateway.js';
import { validateCandidateBatch, verifyCandidateSources } from '../server/lib/sourcingSourceVerifier.js';
import { canonicalCandidateKey, validateStoredCandidate, deduplicateCanonicalCandidates, SOURCING_PURCHASE_CAPABILITY, AUTO_PUBLISH } from '../shared/sourcingCandidateValidation.js';

function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function logDatabaseError(stage, table, operation, runId, error) {
  console.error('[Discovery Persistence Error]', {
    stage,
    table,
    operation,
    run_id: runId || null,
    code: error?.code || 'UNKNOWN_CODE',
    message: error?.message || 'Unknown database error',
    details: error?.details || null,
    hint: error?.hint || null
  });
}

export default async function handler(req, res) {
  if (typeof res?.setHeader === 'function') res.setHeader('Cache-Control', 'no-store');
  const started = Date.now();
  const auth = await authenticateRequest(req, { allowCron: true });
  if (!auth.authenticated || !auth.isSuperAdmin) return res.status(403).json({ success: false, status: 'FORBIDDEN', error: 'SUPERADMIN requerido' });
  if (req.method !== 'POST' && !(req.method === 'GET' && auth.isCron)) return res.status(405).json({ success: false, error: 'POST requerido' });

  // Consolidated Sourcing Action: on-demand market presence lookup / candidate source verification / post-enrichment persistence
  const { action, asin, source_url, title, brand, id, candidates: candidatesToPersist } = req.body || {};
  const country = req.body?.country || req.query?.country || 'UY';

  if (action === 'persist_enriched_candidates') {
    const supabase = getServiceRoleClient();
    if (!supabase) {
      console.error('[Discovery Persistence Error] SUPABASE_SERVICE_ROLE_KEY missing for persist_enriched_candidates');
      return res.status(500).json({ success: false, status: 'FAILED', error: 'SERVER_CONFIGURATION_ERROR', attempted: 0, succeeded: 0, failed: 0 });
    }

    const items = Array.isArray(candidatesToPersist) ? candidatesToPersist : [];
    let succeeded = 0;
    let failed = 0;
    const errors = [];

    for (const c of items) {
      if (!c || !c.title) {
        failed++;
        continue;
      }

      const canonicalProductId = c.canonical_product_id || (c.title ? crypto.createHash('sha256').update(canonicalCandidateKey(c)).digest('hex') : null);
      const row = {
        country: c.country_code || country,
        canonical_product_id: canonicalProductId,
        title: c.title,
        brand: c.brand || null,
        franchise: c.franchise || null,
        category: c.category || null,
        status: c.status || 'NEW',
        discovered_from: c.discovered_from || 'WATCHLIST',
        trend_score: c.trend_score ?? 0,
        opportunity_score: c.opportunity_score ?? 0,
        confidence_score: c.confidence_score ?? null,
        source_retailer: c.retailer_source || c.source_retailer || null,
        source_url: c.retailer_url || c.source_url || null,
        asin: c.asin || null,
        price_usd: c.pricing?.origin_price_usd ?? null,
        landed_cost_usd: c.pricing?.landed_cost_estimated_usd ?? null,
        suggested_price_usd: c.pricing?.suggested_sale_price_usd ?? null,
        margin_percent: c.pricing?.estimated_margin_percent ?? null,
        why_explanation: c.why_explanation || {},
        evidence: {
          canonical_candidate: c,
          source_url: c.retailer_url || c.source_url || null,
          image_url: c.image_url || null,
          verification_version: c.validation_version || 1
        },
        last_verified_at: new Date().toISOString()
      };

      try {
        let updateQuery = supabase.from('sourcing_discoveries').update(row).eq('country', row.country);
        if (canonicalProductId) {
          updateQuery = updateQuery.eq('canonical_product_id', canonicalProductId);
        } else {
          updateQuery = updateQuery.eq('title', c.title);
        }
        const { error: updateError, count } = await updateQuery;
        if (updateError) {
          failed++;
          errors.push({ title: c.title, error: updateError.message });
          logDatabaseError('persist_enriched_update', 'sourcing_discoveries', 'UPDATE', null, updateError);
        } else {
          succeeded++;
        }
      } catch (err) {
        failed++;
        errors.push({ title: c.title, error: err.message });
        logDatabaseError('persist_enriched_exception', 'sourcing_discoveries', 'UPDATE', null, err);
      }
    }

    const runStatus = failed === 0 ? 'COMPLETED' : (succeeded > 0 ? 'PARTIAL' : 'FAILED');
    return res.status(runStatus === 'FAILED' ? 502 : 200).json({
      success: runStatus !== 'FAILED',
      status: runStatus,
      attempted: items.length,
      succeeded,
      failed,
      errors: errors.slice(0, 5)
    });
  }

  if (action === 'market_presence' || action === 'validate_candidate' || (asin && source_url && title && action !== 'discovery_run')) {
    if (action === 'validate_candidate' && title && source_url) {
      const c = await verifyCandidateSources({ title, url: source_url, asin, brand, id }, { country });
      return res.status(200).json({ candidate: c });
    }
    if (!/^[A-Z0-9]{10}$/i.test(asin || '') || !title || !source_url) {
      return res.status(200).json({ status: 'NOT_CHECKED', presence: 'UNKNOWN', found: false, exactMatch: false, priceUsd: null, statusMessage: 'Identificador y producto pendientes de verificación' });
    }
    const c = await verifyCandidateSources({ asin, title, url: source_url }, { country: country || 'UY' });
    return res.status(200).json({ asin, ...c.market_presence.tiendamia, identifier_verification: c.provenance.asin.verification });
  }
  const runId = crypto.randomUUID();
  const trigger = auth.isCron ? 'CRON' : 'MANUAL';

  const supabase = getServiceRoleClient();
  if (!supabase) {
    console.error('[Discovery] Server configuration error: SUPABASE_SERVICE_ROLE_KEY missing in runtime environment.', {
      stage: 'service_role_init',
      run_id: runId
    });
    return res.status(500).json({
      success: false,
      status: 'FAILED',
      error: 'SERVER_CONFIGURATION_ERROR',
      message: 'Configuración del servidor incompleta para persistencia de auditoría.',
      purchases_executed: 0,
      auto_publications: 0
    });
  }

  const health = {};
  const errors = [];
  const observations = [];
  const seeds = [];
  const counters = { radar_events: 0, amazon_products: 0, mlu_items: 0, web_search_sources: 0 };
  let signalsCreated = 0;
  let aiCalls = 0;
  let aiCost = 0;
  let candidates = [];
  const { error: runStartError } = await supabase.from('sourcing_discovery_runs').insert({ id: runId, status: 'RUNNING', trigger, countries: [country], started_at: new Date().toISOString(),
    sources_requested: ['radar', 'release_calendar', 'amazon', 'mercadolibre_uy', 'internal_signals', 'openai_web_search'], metadata: { purchase_capability: SOURCING_PURCHASE_CAPABILITY, auto_publish: AUTO_PUBLISH } });
  if (runStartError) {
    logDatabaseError('run_start_insert', 'sourcing_discovery_runs', 'INSERT', runId, runStartError);
    return res.status(502).json({ success: false, status: 'FAILED', error: 'run_persistence', purchases_executed: 0, auto_publications: 0 });
  }

  const collect = async (name, table, columns, limit) => {
    try {
      const { data, error } = await supabase.from(table).select(columns).limit(limit);
      if (error) {
        const isMissingTable = error.code === 'PGRST205' || error.message?.includes('Could not find the table');
        if (isMissingTable) {
          health[name] = { status: 'NOT_CONFIGURED', count: 0, message: `Tabla ${table} pendiente de migración` };
          return [];
        }
        throw new Error(error.message);
      }
      health[name] = { status: data?.length ? 'CONNECTED_WITH_DATA' : 'CONNECTED_NO_DATA', count: data?.length || 0 };
      return data || [];
    } catch (e) {
      health[name] = { status: 'UNKNOWN', error: e.message };
      errors.push(name);
      return [];
    }
  };
  const [releases, products, local, watchlist, storedSignals] = await Promise.all([
    collect('radar', 'release_events', 'id,title,manufacturer,franchise,character,product_line,msrp,currency,source_name,source_url,radar_signal,official_image_url,image_source_url', 20),
    collect('amazon', 'international_products', 'id,external_product_id,title,brand,base_price_usd,product_url_external,availability,source_retailer,image_url,main_image_url_external', 15),
    country === 'UY' ? collect('mercadolibre_uy', 'ml_raw_items', 'id,ml_item_id,title,price,currency_id,available_quantity,permalink,thumbnail', 20) : Promise.resolve([]),
    collect('watchlist', 'sourcing_watchlist', 'id,product_id,canonical_sku,title,brand,source_name', 15),
    collect('internal_signals', 'sourcing_signals', 'id,source_type,source_name,source_url,product_identity,topic,signal_type,value,country,observed_at,metadata', 30)
  ]);
  counters.radar_events = releases.length; counters.amazon_products = products.length; counters.mlu_items = local.length;
  counters.ebay_listings = 0;
  health.release_calendar = { ...health.radar, message: 'Release Calendar y Radar comparten release_events; no se cuentan dos veces' };
  health.ebay = { status: 'DISABLED', count: 0, message: 'eBay deshabilitado en Sourcing V1 (Amazon-First)' };
  health.bestbuy = { status: 'DISABLED', count: 0, message: 'Best Buy deshabilitado en Sourcing V1 (Amazon-First)' };
  health.tiendamia_uy = { status: 'AVAILABLE', message: 'Verificación downstream por ASIN SOURCE_VERIFIED' };

  for (const r of releases) {
    seeds.push({ id: 'radar-' + r.id, title: r.title, brand: r.manufacturer, franchise: r.franchise, character: r.character, line: r.product_line, url: r.source_url,
      retailer: r.source_name, origin_price_usd: r.currency === 'USD' ? r.msrp : null, image_url: r.official_image_url, discovered_from: 'RADAR' });
    observations.push({ source_type: 'RADAR', source_name: r.source_name || 'Radar / Release Calendar', source_url: r.source_url, product_identity: r.title,
      topic: r.franchise || r.title, signal_type: 'NEW_RELEASE', evidence_text: r.title, country: 'GLOBAL', observed_at: new Date().toISOString() });
  }
  for (const p of products) {
    seeds.push({ id: 'catalog-' + p.id, title: p.title, brand: p.brand, url: p.product_url_external, retailer: p.source_retailer,
      origin_price_usd: p.base_price_usd, image_url: p.main_image_url_external || p.image_url, discovered_from: 'RETAILER_DISCOVERY' });
    observations.push({ source_type: 'RETAILER', source_name: p.source_retailer || 'Catálogo internacional', source_url: p.product_url_external,
      product_identity: p.title, topic: p.brand || p.title, signal_type: 'RETAIL_OFFER', evidence_text: p.title, country: 'GLOBAL', observed_at: new Date().toISOString() });
  }
  for (const m of local) observations.push({ source_type: 'MARKETPLACE', source_name: 'Mercado Libre Uruguay', source_url: m.permalink, product_identity: m.title,
    topic: m.title, signal_type: 'LOCAL_SUPPLY', value: m.price, evidence_text: m.title, country: 'UY', observed_at: new Date().toISOString() });
  for (const s of observations) {
    const fingerprint = crypto.createHash('sha256').update([s.source_type, s.source_url, s.product_identity, s.signal_type].join('|')).digest('hex');
    const { error } = await supabase.from('sourcing_signals').upsert({ ...s, confidence: null, fingerprint, collected_at: new Date().toISOString() }, { onConflict: 'fingerprint' });
    if (!error) signalsCreated++; else {
      errors.push('signal_persistence');
      logDatabaseError('signal_persistence_upsert', 'sourcing_signals', 'UPSERT', runId, error);
    }
  }
  // Signal-led research. An empty corpus does not manufacture a brand or a trending query.
  const hypotheses = [...new Set([...seeds.map(s => s.title), ...storedSignals.filter(s => s.product_identity || s.topic).map(s => s.product_identity || s.topic)])].slice(0, 12);
  const priorities = watchlist.map(w => w.title || w.brand || w.canonical_sku || w.product_id).filter(Boolean);
  if (hypotheses.length) {
    try {
      const query = 'Investigar y corroborar globalmente productos concretos detectados por Radar, Release Calendar y retailers: ' + hypotheses.join('; ') +
        '. Priorizar cuando corresponda: ' + priorities.join('; ') + '. Incluir productos fuera de watchlist respaldados por estas señales. Mercado objetivo: ' + country + '. No inferir demanda de una preventa o listing.';
      const research = await researchViaGateway(req, { query, country, signals: observations });
      candidates = research.data?.canonical_candidates || [];
      aiCalls = research.cached ? 0 : (research.batch_telemetry?.batches_executed || 1);
      aiCost = research.pricing?.estimated_cost_usd || 0;
      counters.web_search_sources = research.sources?.length || 0;
      health.openai_web_search = { status: 'CONNECTED_WITH_DATA', count: candidates.length, cached: research.cached || false };
    } catch (e) { errors.push('openai_web_search'); health.openai_web_search = { status: 'UNKNOWN', error: e.message }; }
  } else health.openai_web_search = { status: 'UNKNOWN', message: 'Sin señales reales para investigar' };
  // Retailer/Radar hypotheses are candidates even when research cannot corroborate them.
  // A single shared verifier handles both entrances. No source is invented to fill a quota.
  const seedCandidates = await validateCandidateBatch(seeds, { country, origin: 'RETAILER_DISCOVERY', signalRows: storedSignals, marketRows: local, deadline: Math.min(started + 55000, Date.now() + 8000) });
  candidates = deduplicateCanonicalCandidates([...candidates, ...seedCandidates]);
  let created = 0;
  for (const c of candidates) {
    const outside = !priorities.some(w => (c.title + ' ' + c.brand + ' ' + c.franchise).toLowerCase().includes(w.toLowerCase()));
    c.discovered_from = outside ? 'DISCOVERED_OUTSIDE_WATCHLIST' : 'WATCHLIST';
    // Exact persisted identity reuses the row. Repeated runs do not multiply products.
    const canonicalProductId = crypto.createHash('sha256').update(canonicalCandidateKey(c)).digest('hex');
    let { data: existing, error: readError } = await supabase.from('sourcing_discoveries').select('*').eq('country', country).eq('canonical_product_id', canonicalProductId).limit(1).maybeSingle();
    if (readError) {
      errors.push('candidate_persistence_read');
      logDatabaseError('candidate_persistence_read', 'sourcing_discoveries', 'SELECT', runId, readError);
      continue;
    }
    if (!existing) {
      const legacy = await supabase.from('sourcing_discoveries').select('*').eq('country', country).eq('title', c.title).eq('source_retailer', c.retailer_source).limit(1).maybeSingle();
      if (legacy.error) {
        errors.push('candidate_persistence_read');
        logDatabaseError('candidate_persistence_read_legacy', 'sourcing_discoveries', 'SELECT', runId, legacy.error);
        continue;
      }
      existing = legacy.data && canonicalCandidateKey(validateStoredCandidate(legacy.data)) === canonicalCandidateKey(c) ? legacy.data : null;
    }
    const merged = existing ? deduplicateCanonicalCandidates([c, validateStoredCandidate(existing)]) : [c];
    if (merged.length !== 1) { errors.push('candidate_identity_conflict'); continue; }
    const combined = merged[0];
    Object.assign(c, combined, { discovered_from: c.discovered_from });
    const row = { country, canonical_product_id: canonicalProductId, title: c.title, brand: c.brand, franchise: c.franchise, category: c.category, status: c.status, discovered_from: c.discovered_from,
      trend_score: c.trend_score, opportunity_score: c.opportunity_score, confidence_score: c.confidence_score, source_retailer: c.retailer_source, source_url: c.retailer_url,
      asin: c.asin || null, price_usd: c.pricing.origin_price_usd, landed_cost_usd: c.pricing.landed_cost_estimated_usd, suggested_price_usd: c.pricing.suggested_sale_price_usd,
      margin_percent: c.pricing.estimated_margin_percent, outside_watchlist: outside, why_explanation: c.why_explanation,
      evidence: { canonical_candidate: c, source_url: c.retailer_url, image_url: c.image_url, verification_version: c.validation_version },
      discovered_at: c.created_at, last_verified_at: c.provenance.identity.status === 'OBSERVED' ? new Date().toISOString() : null };
    const { error } = existing ? await supabase.from('sourcing_discoveries').update(row).eq('id', existing.id) : await supabase.from('sourcing_discoveries').insert(row);
    if (error) {
      errors.push('candidate_persistence');
      logDatabaseError('candidate_persistence_write', 'sourcing_discoveries', existing ? 'UPDATE' : 'INSERT', runId, error);
    } else created++;
  }
  const failed = [...new Set(errors)];
  const successful = Object.keys(health).filter(k => health[k].status.startsWith('CONNECTED'));
  const status = failed.length ? (successful.length ? 'PARTIAL_SUCCESS' : 'FAILED') : 'SUCCESS';
  const metadata = { source_health: health, candidates: candidates.length, purchase_capability: SOURCING_PURCHASE_CAPABILITY, auto_publish: AUTO_PUBLISH, purchases_executed: 0, auto_publications: 0 };
  const { error: runEndError } = await supabase.from('sourcing_discovery_runs').update({ completed_at: new Date().toISOString(), status, sources_successful: successful, sources_failed: failed,
    signals_created: signalsCreated, products_detected: seeds.length, discoveries_created: created, ai_calls: aiCalls, estimated_ai_cost_usd: aiCost, metadata }).eq('id', runId);
  if (runEndError) {
    logDatabaseError('run_end_update', 'sourcing_discovery_runs', 'UPDATE', runId, runEndError);
    return res.status(502).json({ success: false, status: 'FAILED', run_id: runId, error: 'run_persistence', discoveries_created: created, purchases_executed: 0, auto_publications: 0 });
  }
  return res.status(status === 'FAILED' ? 502 : 200).json({ success: status !== 'FAILED', run_id: runId, status, trigger, target_market: country,
    duration_ms: Date.now() - started, sources_successful: successful, sources_failed: failed, source_health: health,
    signals_breakdown: { global_signals: observations.filter(s => s.country === 'GLOBAL').length, local_signals: local.length, total_signals: observations.length },
    trends_breakdown: { global_trends: 0, local_trends: 0 }, discoveries_created: created, candidates_generated: candidates.length, raw_counts: counters,
    candidates,
    ai_calls: aiCalls, ai_cost_usd: aiCost, purchases_executed: 0, auto_publications: 0, completed_at: new Date().toISOString() });
}
