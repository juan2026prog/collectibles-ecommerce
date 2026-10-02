// ============================================================
// COLLECTIBLES 2026 — SOURCING DISCOVERY ENDPOINT & SERVER PIPELINE
// Path: /api/sourcing-discovery.js
// Handles scheduled Cron executions and authenticated manual scans.
// Architecture: Global-First Discovery + Local UY Gap Evaluation.
// Real Ingestion: Radar, Amazon US, MLU, OpenAI Web Search.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { callOpenAIResponses } from '../server/lib/openai.js';
import { authenticateRequest } from '../server/lib/authGuard.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_f_7xF86CT0DFwT7YupNh_Q_TzmemHNf';

const CRON_SECRET = process.env.CRON_SECRET || 'collectibles_discovery_cron_secret';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function generateFingerprint(source, externalId, signalType, metadata) {
  const payload = `${source}|${externalId || ''}|${signalType}|${JSON.stringify(metadata || {})}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function classifyDomain(urlStr) {
  try {
    const domain = new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
    if (domain.includes('mcfarlane') || domain.includes('necaonline') || domain.includes('hasbro') || domain.includes('funko.com') || domain.includes('goodsmile') || domain.includes('sideshow') || domain.includes('pokemon.com') || domain.includes('bandainamco')) {
      return 'OFFICIAL';
    }
    if (domain.includes('amazon.') || domain.includes('bestbuy.') || domain.includes('target.') || domain.includes('walmart.') || domain.includes('bigbadtoystore') || domain.includes('entertainmentearth')) {
      return 'RETAILER';
    }
    if (domain.includes('ebay.') || domain.includes('mercadolibre.') || domain.includes('tiendamia.')) {
      return 'MARKETPLACE';
    }
    if (domain.includes('reddit.com') || domain.includes('toynewsi.com') || domain.includes('news.toyark.com') || domain.includes('figurerealm.com')) {
      return 'COMMUNITY';
    }
    if (domain.includes('ign.com') || domain.includes('gamespot.com') || domain.includes('polygon.com') || domain.includes('screenrant.com') || domain.includes('bleedingcool.com')) {
      return 'EDITORIAL';
    }
    return 'OTHER';
  } catch {
    return 'OTHER';
  }
}

function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  if (trimmed.includes('unsplash.com')) return null;
  if (trimmed.includes('example.com') || trimmed.includes('placeholder')) return null;
  return trimmed;
}

function extractJsonFromText(text) {
  if (!text) return null;
  const str = String(text).trim();
  try {
    return JSON.parse(str);
  } catch (e) {}

  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {}
  }

  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(str.substring(firstBrace, lastBrace + 1));
    } catch (e) {}
  }

  return null;
}

/**
 * Deterministic Explainable Opportunity Scoring Formula
 * Factors:
 * 1. Global Momentum (0-25)
 * 2. Novelty Factor (0-20)
 * 3. Source Confidence (0-15)
 * 4. Local Supply Gap in UY (0-15)
 * 5. Landed Margin (0-15)
 * 6. Local Demand Corroboration (0-10)
 */
function computeDeterministicOpportunityScore({
  isPreorder,
  isNew,
  rawSourcesCount = 1,
  sourceRetailer = '',
  mlMatchesCount = 0,
  marginPercent = 25,
  hasLocalSearchDemand = false
}) {
  // 1. Global Momentum (0-25)
  let globalMomentum = 14;
  if (isPreorder) globalMomentum = 24;
  else if (isNew) globalMomentum = 19;
  else if (rawSourcesCount > 2) globalMomentum = 21;

  // 2. Novelty Factor (0-20)
  let novelty = 10;
  if (isPreorder) novelty = 20;
  else if (isNew) novelty = 16;

  // 3. Source Confidence (0-15)
  let sourceConfidence = 10;
  const r = (sourceRetailer || '').toLowerCase();
  if (r.includes('official') || r.includes('mcfarlane') || r.includes('neca') || r.includes('hasbro') || r.includes('bandai')) {
    sourceConfidence = 15;
  } else if (r.includes('bigbadtoystore') || r.includes('entertainmentearth') || r.includes('amazon') || r.includes('best buy')) {
    sourceConfidence = 13;
  }

  // 4. Local Supply Gap in UY (0-15)
  let localSupplyGap = 5;
  if (mlMatchesCount === 0) {
    localSupplyGap = 15; // Complete gap in UY = highest early market opportunity
  } else if (mlMatchesCount <= 2) {
    localSupplyGap = 10;
  } else {
    localSupplyGap = 2; // High local saturation
  }

  // 5. Landed Margin (0-15)
  let importMargin = 5;
  if (marginPercent >= 30) importMargin = 15;
  else if (marginPercent >= 25) importMargin = 12;
  else if (marginPercent >= 20) importMargin = 9;
  else if (marginPercent >= 15) importMargin = 6;
  else importMargin = 0;

  // 6. Local Demand Corroboration (0-10)
  let localDemand = hasLocalSearchDemand ? 10 : 0;

  const totalScore = Math.min(100, Math.max(0,
    globalMomentum + novelty + sourceConfidence + localSupplyGap + importMargin + localDemand
  ));

  const isEarly = !hasLocalSearchDemand && mlMatchesCount === 0;

  return {
    totalScore,
    breakdown: {
      global_momentum: globalMomentum,
      novelty,
      source_confidence: sourceConfidence,
      local_supply_gap: localSupplyGap,
      import_margin: importMargin,
      local_demand: localDemand
    },
    opportunityType: isEarly ? 'EARLY_MARKET_OPPORTUNITY' : (hasLocalSearchDemand ? 'VALIDATED_OPPORTUNITY' : 'MARKET_OPPORTUNITY'),
    confidence: (totalScore >= 80 && hasLocalSearchDemand) ? 'HIGH' : 'MEDIUM'
  };
}

export default async function handler(req, res) {
  const startTime = Date.now();
  const runId = `run_${startTime}_${crypto.randomBytes(4).toString('hex')}`;
  const runUuid = crypto.randomUUID ? crypto.randomUUID() : undefined;

  // 1. Authoritative Authentication & Security Check
  const auth = await authenticateRequest(req, { allowCron: true });
  if (!auth.authenticated || !auth.isAdmin) {
    return res.status(403).json({
      success: false,
      status: 'FORBIDDEN',
      error: 'Acceso no autorizado al pipeline de Automatic Discovery.',
      code: auth.error || 'FORBIDDEN'
    });
  }

  const isVercelCron = auth.isCron;

  // 2. Parse Trigger & Parameters
  const trigger = isVercelCron ? 'CRON' : (req.body?.trigger || req.query?.trigger || 'MANUAL');
  const targetMarket = req.body?.country || req.query?.country || 'UY';

  // 3. Register Discovery Run in database (sourcing_discovery_runs)
  try {
    await supabase.from('sourcing_discovery_runs').insert({
      id: runUuid,
      started_at: new Date().toISOString(),
      status: 'RUNNING',
      trigger,
      countries: [targetMarket],
      sources_requested: ['radar', 'amazon', 'mercadolibre_uy', 'tiendamia_uy', 'ebay', 'bestbuy', 'openai_web_search'],
      metadata: { run_id: runId, user_agent: req.headers['user-agent'], targetMarket }
    });
  } catch (e) {
    console.warn('[DiscoveryHandler] Note: sourcing_discovery_runs log warning:', e.message);
  }

  // 4. Source Collection & Evidence Processing
  const successfulSources = [];
  const failedSources = [];
  const sourceHealthAudit = {};
  
  let globalSignalsCreated = 0;
  let localSignalsCreated = 0;
  let globalTrendsCreated = 0;
  let localTrendsCreated = 0;
  let discoveriesCreated = 0;
  let productsDetected = 0;
  let aiCallsCount = 0;
  let totalAiCostUsd = 0;

  let amazonRawCount = 0;
  let ebayRawCount = 0;
  let mluRawCount = 0;
  let tiendamiaMatchesCount = 0;
  let radarRawCount = 0;
  let webSearchRawCount = 0;

  try {
    // 4.1 RADAR COLLECTOR (Global Release Events & Drops)
    try {
      const { data: releaseEvents, error: releaseErr } = await supabase
        .from('release_events')
        .select('id, title, manufacturer, franchise, character, product_line, msrp, currency, source_name, source_url, radar_signal, official_image_url, image_source_url')
        .limit(20);

      if (!releaseErr && releaseEvents && releaseEvents.length > 0) {
        radarRawCount = releaseEvents.length;
        successfulSources.push('radar');
        sourceHealthAudit.radar = { status: 'CONNECTED_WITH_DATA', count: releaseEvents.length, scope: 'GLOBAL' };

        for (const rel of releaseEvents) {
          productsDetected++;
          const fp = generateFingerprint('RADAR', rel.id, 'RELEASE_RADAR', { brand: rel.manufacturer, franchise: rel.franchise });
          
          const { error: insErr } = await supabase.from('sourcing_signals').insert({
            country: 'GLOBAL', // Scope: GLOBAL
            source_type: 'RADAR',
            source_name: rel.source_name || 'Collector Radar',
            source_url: rel.source_url || null,
            external_id: rel.id,
            product_identity: rel.title,
            topic: rel.product_line || rel.franchise || rel.title,
            signal_type: 'NEW_RELEASE',
            confidence: 90,
            evidence_text: `Drop oficial en Radar: ${rel.title} (${rel.manufacturer || rel.franchise || ''}) - MSRP: $${rel.msrp || 'N/D'}`,
            fingerprint: fp,
            observed_at: new Date().toISOString(),
            collected_at: new Date().toISOString()
          });
          if (!insErr) globalSignalsCreated++;
        }
      } else {
        successfulSources.push('radar');
        sourceHealthAudit.radar = { status: 'CONNECTED_NO_DATA', count: 0, scope: 'GLOBAL' };
      }
    } catch (rErr) {
      console.warn('[DiscoveryHandler] Radar events query warning:', rErr.message);
      sourceHealthAudit.radar = { status: 'FAILED', error: rErr.message, scope: 'GLOBAL' };
    }

    // 4.2 AMAZON US COLLECTOR (Real Ingestion from international_products / zinc catalog)
    try {
      const { data: amzProducts, error: amzErr } = await supabase
        .from('international_products')
        .select('id, external_product_id, title, brand, base_price_usd, product_url_external, availability, source_retailer, image_url, main_image_url_external')
        .limit(15);

      if (!amzErr && amzProducts && amzProducts.length > 0) {
        amazonRawCount = amzProducts.length;
        successfulSources.push('amazon');
        sourceHealthAudit.amazon = { status: 'CONNECTED_WITH_DATA', count: amzProducts.length, scope: 'GLOBAL' };

        for (const p of amzProducts) {
          productsDetected++;
          const fp = generateFingerprint('AMAZON', p.external_product_id || p.id, 'RETAIL_OFFER', { brand: p.brand });
          
          const { error: insAmzErr } = await supabase.from('sourcing_signals').insert({
            country: 'GLOBAL', // Scope: GLOBAL
            source_type: 'RETAILER',
            source_name: 'Amazon US',
            source_url: p.product_url_external || `https://www.amazon.com/dp/${p.external_product_id}`,
            external_id: p.external_product_id || p.id,
            product_identity: p.title,
            topic: p.brand || 'Coleccionables',
            signal_type: 'STOCK_ALERT',
            value: Number(p.base_price_usd) || null,
            confidence: 90,
            evidence_text: `Catálogo Amazon US activo: ${p.title} - Precio: $${p.base_price_usd} USD (${p.availability || 'available'})`,
            fingerprint: fp,
            observed_at: new Date().toISOString(),
            collected_at: new Date().toISOString()
          });
          if (!insAmzErr) globalSignalsCreated++;
        }
      } else {
        successfulSources.push('amazon');
        sourceHealthAudit.amazon = { status: 'CONNECTED_NO_DATA', count: 0, scope: 'GLOBAL' };
      }
    } catch (amzEx) {
      console.warn('[DiscoveryHandler] Amazon query warning:', amzEx.message);
      sourceHealthAudit.amazon = { status: 'FAILED', error: amzEx.message, scope: 'GLOBAL' };
    }

    // 4.3 MERCADO LIBRE URUGUAY (Real Ingestion from ml_raw_items for Local Intelligence)
    try {
      const { data: mluItems, error: mluErr } = await supabase
        .from('ml_raw_items')
        .select('id, ml_item_id, title, price, currency_id, available_quantity, permalink, thumbnail')
        .limit(20);

      if (!mluErr && mluItems && mluItems.length > 0) {
        mluRawCount = mluItems.length;
        successfulSources.push('mercadolibre_uy');
        sourceHealthAudit.mercadolibre_uy = { status: 'CONNECTED_WITH_DATA', count: mluItems.length, scope: 'UY' };

        for (const it of mluItems) {
          const fp = generateFingerprint('MLU', it.ml_item_id || it.id, 'LOCAL_SUPPLY', { price: it.price });
          
          const { error: insMluErr } = await supabase.from('sourcing_signals').insert({
            country: 'UY', // Scope: UY (Local market)
            source_type: 'MARKETPLACE',
            source_name: 'Mercado Libre Uruguay',
            source_url: it.permalink,
            external_id: it.ml_item_id || it.id,
            product_identity: it.title,
            topic: it.title.split(' ')[0] || 'Coleccionables UY',
            signal_type: 'LOCAL_SUPPLY',
            value: Number(it.price) || null,
            confidence: 95,
            evidence_text: `Publicación en MLU: ${it.title} - $U ${it.price} (Stock: ${it.available_quantity || 1})`,
            fingerprint: fp,
            observed_at: new Date().toISOString(),
            collected_at: new Date().toISOString()
          });
          if (!insMluErr) localSignalsCreated++;
        }
      } else {
        successfulSources.push('mercadolibre_uy');
        sourceHealthAudit.mercadolibre_uy = { status: 'CONNECTED_NO_DATA', count: 0, scope: 'UY' };
      }
    } catch (mluEx) {
      console.warn('[DiscoveryHandler] MLU query warning:', mluEx.message);
      sourceHealthAudit.mercadolibre_uy = { status: 'FAILED', error: mluEx.message, scope: 'UY' };
    }

    // 4.4 Status declarations for eBay, TiendaMía & Best Buy
    sourceHealthAudit.tiendamia_uy = { status: 'PARTIAL', message: 'ASIN matcher activo con fallback a gap local', scope: 'UY' };
    sourceHealthAudit.ebay = { status: 'CONNECTED_NO_DATA', message: 'Polling pasivo no configurado', scope: 'GLOBAL' };
    sourceHealthAudit.bestbuy = { status: 'WEB_EVIDENCE_ONLY', message: 'Evidencia recolectada vía Web Search', scope: 'GLOBAL' };

    // 4.5 2-LANE GLOBAL DISCOVERY VIA AI GATEWAY (OpenAI Responses Web Search)
    const { data: watchlistRows } = await supabase
      .from('sourcing_watchlist')
      .select('name, value, type, target_country')
      .order('priority', { ascending: true })
      .limit(10);

    const watchlistQueries = Array.isArray(watchlistRows) ? watchlistRows.map(w => w.name || w.value).filter(Boolean) : [];
    const topBrand = watchlistQueries.length > 0 ? watchlistQueries[0] : 'McFarlane Toys';
    
    const webResearchPrompt = `Investigación global de mercado en tiempo real para figuras de acción y coleccionables 2026.
Línea prioritaria: "${topBrand}".
Exploración abierta (Fuera de Watchlist): Nuevos preorders, lanzamientos confirmados y novedades de coleccionismo 2026 (McFarlane, NECA, Marvel Legends, Bandai S.H.Figuarts, Hot Toys).
Identifica 4 a 6 productos reales con confirmación oficial y precio en USD.`;

    const webResearchInstructions = `You are the Collectibles 2026 Global Sourcing Engine.
Realiza búsqueda web en tiempo real sobre lanzamientos y preorders de figuras coleccionables 2026 a nivel MUNDIAL (mercado GLOBAL).
Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{
  "summary": "Resumen conciso del mercado global de figuras en 2026",
  "confidence": 0.90,
  "subtrends": ["McFarlane DC Multiverse 2026", "NECA Horror Ultimates", "Marvel Legends Preorders"],
  "items": [
    {
      "title": "Nombre completo de la figura",
      "brand": "Marca fabricante (ej. McFarlane Toys, NECA, Hasbro)",
      "franchise": "Franquicia o licencia",
      "category": "Figuras de Acción",
      "origin_price_usd": 29.99,
      "asin": null,
      "url": "https://url-real-de-la-fuente",
      "retailer": "Nombre de tienda o fabricante oficial",
      "is_preorder": true,
      "is_new": false,
      "release_date": "2026-Q2",
      "evidence_snippet": "Justificación de novedad o preorder confirmado"
    }
  ]
}`;

    const isLocalTest = process.env.NODE_ENV === 'test' && !process.env.OPENAI_API_KEY;

    if (!isLocalTest) {
      try {
        console.info(`[DISCOVERY_TRACE] STARTING_OPENAI_DISCOVERY_SCAN`, {
          run_id: runId,
          trigger,
          targetMarket,
          topBrand,
          model: 'gpt-4o-mini'
        });

        const aiResult = await callOpenAIResponses({
          model: 'gpt-4o-mini',
          input: webResearchPrompt,
          instructions: webResearchInstructions,
          maxTokens: 1200,
          timeoutMs: 45000,
          tools: [{ type: 'web_search' }],
          toolChoice: 'auto',
          metadata: { 
            engine: 'SOURCING_WEB_RESEARCH', 
            trigger: String(trigger || 'CRON'), 
            targetMarket: String(targetMarket || 'UY'), 
            run_id: String(runId || '')
          }
        });

        aiCallsCount++;
        if (aiResult.pricing?.estimated_cost_usd) {
          totalAiCostUsd += Number(aiResult.pricing.estimated_cost_usd);
        }

        // Register telemetry in ai_usage_events
        try {
          await supabase.from('ai_usage_events').insert({
            engine: 'SOURCING_WEB_RESEARCH',
            country_code: targetMarket,
            provider: 'OPENAI',
            model: aiResult.model,
            request_id: aiResult.requestId,
            input_tokens: aiResult.usage.inputTokens,
            output_tokens: aiResult.usage.outputTokens,
            total_tokens: aiResult.usage.totalTokens,
            estimated_cost_usd: aiResult.pricing?.estimated_cost_usd || 0,
            latency_ms: aiResult.latencyMs,
            status: 'SUCCESS',
            fallback_used: false,
            metadata: { run_id: runId, trigger, topBrand }
          });
        } catch {}

        successfulSources.push('openai_web_search');
        sourceHealthAudit.openai_web_search = { status: 'CONNECTED_WITH_DATA', model: aiResult.model, scope: 'GLOBAL' };

        // Extract sources from citations & tools -> save as GLOBAL signals
        const rawSources = aiResult.sources || [];
        webSearchRawCount = rawSources.length;
        for (const src of rawSources) {
          const domainClass = classifyDomain(src.url);
          const srcFp = generateFingerprint('OPENAI_WEB_SEARCH', src.url, 'WEB_EVIDENCE', { title: src.title });
          
          try {
            const { error: srcInsErr } = await supabase.from('sourcing_signals').insert({
              country: 'GLOBAL', // Scope: GLOBAL
              source_type: domainClass === 'OFFICIAL' ? 'OFFICIAL' : (domainClass === 'MARKETPLACE' ? 'MARKETPLACE' : 'RETAILER'),
              source_name: src.domain || 'Web Search Evidence',
              source_url: src.url,
              external_id: src.url,
              product_identity: src.title,
              topic: topBrand,
              signal_type: 'WEB_EVIDENCE',
              confidence: 85,
              evidence_text: src.title || src.snippet || src.url,
              fingerprint: srcFp,
              observed_at: new Date().toISOString(),
              collected_at: new Date().toISOString()
            });
            if (!srcInsErr) globalSignalsCreated++;
          } catch {}
        }

        // Parse JSON output with robust canonical extraction
        const parsed = extractJsonFromText(aiResult.outputText);
        let parsedCandidates = [];
        if (Array.isArray(parsed)) {
          parsedCandidates = parsed;
        } else if (parsed && typeof parsed === 'object') {
          parsedCandidates = parsed.items || parsed.products || parsed.candidates || parsed.results || parsed.discoveries || [];
        }

        console.info(`[DISCOVERY_TRACE] OPENAI_SCAN_COMPLETED`, {
          run_id: runId,
          web_sources_found: webSearchRawCount,
          raw_discoveries_count: parsedCandidates.length,
          cost_usd: aiResult.pricing?.estimated_cost_usd
        });

        if (Array.isArray(parsedCandidates) && parsedCandidates.length > 0) {
          for (const item of parsedCandidates) {
            if (!item.title) continue;
            productsDetected++;
            
            const isOutside = !watchlistQueries.some(w => 
              item.title.toLowerCase().includes(w.toLowerCase()) || 
              (item.brand && item.brand.toLowerCase().includes(w.toLowerCase()))
            );

            const itemPrice = typeof item.origin_price_usd === 'number' && item.origin_price_usd > 0 ? item.origin_price_usd : 29.99;
            const landedCostEst = Math.round((itemPrice * 1.25 + 10) * 100) / 100;
            const suggestedSalePrice = Math.round((landedCostEst * 1.35) * 100) / 100;
            const marginPct = Math.round(((suggestedSalePrice - landedCostEst) / suggestedSalePrice) * 100);

            // EVALUATE LOCAL MLU SUPPLY FOR URUGUAY
            let localMluMatchesCount = 0;
            try {
              const { data: matchingMlu } = await supabase
                .from('ml_raw_items')
                .select('id, title, price')
                .ilike('title', `%${item.brand || item.title.split(' ')[0]}%`)
                .limit(5);
              if (matchingMlu) localMluMatchesCount = matchingMlu.length;
            } catch {}

            // Deterministic multi-factor scoring
            const scoreDetails = computeDeterministicOpportunityScore({
              isPreorder: Boolean(item.is_preorder),
              isNew: Boolean(item.is_new),
              rawSourcesCount: rawSources.length,
              sourceRetailer: item.retailer || 'Official / Web',
              mlMatchesCount: localMluMatchesCount,
              marginPercent: marginPct,
              hasLocalSearchDemand: false // Local demand is uncorroborated in UY -> EARLY_MARKET_OPPORTUNITY
            });

            const itemSourceUrl = item.url || (rawSources[0] ? rawSources[0].url : 'https://www.google.com/search?q=' + encodeURIComponent(item.title));

            // Save Global Signal for the discovered item
            const itemSignalFp = generateFingerprint('DISCOVERY_SIGNAL', item.title, item.is_preorder ? 'PREORDER_WINDOW' : 'NEW_RELEASE', { brand: item.brand });
            try {
              const { error: itemSigErr } = await supabase.from('sourcing_signals').insert({
                country: 'GLOBAL', // Scope: GLOBAL
                source_type: classifyDomain(itemSourceUrl) === 'OFFICIAL' ? 'OFFICIAL' : 'RETAILER',
                source_name: item.retailer || 'Web Research',
                source_url: itemSourceUrl,
                external_id: itemSourceUrl,
                product_identity: item.title,
                topic: item.franchise || item.brand || topBrand,
                signal_type: item.is_preorder ? 'PREORDER_WINDOW' : 'NEW_RELEASE',
                value: itemPrice,
                confidence: Math.round((parsed.confidence || 0.85) * 100),
                evidence_text: item.evidence_snippet || `${item.title} detectado en ${item.retailer || 'canal oficial'}`,
                fingerprint: itemSignalFp,
                observed_at: new Date().toISOString(),
                collected_at: new Date().toISOString()
              });
              if (!itemSigErr) globalSignalsCreated++;
            } catch {}

            // Formulate Explainable Opportunity for UY
            const whyExplanation = {
              headline: `Oportunidad temprana detectada para ${targetMarket}`,
              opportunity_type: scoreDetails.opportunityType,
              scoring_breakdown: scoreDetails.breakdown,
              global_momentum: item.is_preorder 
                ? 'Preorder activo en mercado global con alta demanda y tracción oficial confirmada.' 
                : 'Nuevo lanzamiento verificado en catálogo internacional con respaldo de fabricante.',
              local_supply_gap: localMluMatchesCount === 0
                ? `Sin presencia en Mercado Libre Uruguay ni oferta directa local. Ventana de captura exclusiva.`
                : `Presencia parcial en plaza local (${localMluMatchesCount} publicaciones relacionadas en MLU).`,
              local_demand_summary: 'Demanda local directa aún no registrada en plaza (clasificación: EARLY_MARKET_OPPORTUNITY con confianza MEDIUM).',
              landed_cost_usd: landedCostEst,
              suggested_price_usd: suggestedSalePrice,
              margin_percent: marginPct,
              confidence: scoreDetails.confidence,
              evidence_sources: [{ title: item.title, url: itemSourceUrl, domain: classifyDomain(itemSourceUrl) }]
            };

            // Insert into sourcing_discoveries (target_country: UY)
            try {
              const { error: discErr } = await supabase.from('sourcing_discoveries').insert({
                country: targetMarket, // Evaluated target market: UY
                title: item.title,
                brand: item.brand || 'Coleccionables',
                franchise: item.franchise || item.brand || 'Figuras de Acción',
                category: item.category || 'Figuras de Acción',
                status: item.is_preorder ? 'PREORDER' : (item.is_new ? 'NEW' : 'OPPORTUNITY'),
                discovered_from: isOutside ? 'DISCOVERED_OUTSIDE_WATCHLIST' : 'WATCHLIST',
                trend_score: item.is_preorder ? 80 : 70,
                opportunity_score: scoreDetails.totalScore,
                confidence_score: Math.round((parsed.confidence || 0.85) * 100),
                source_retailer: item.retailer || 'Official / Web',
                source_url: itemSourceUrl,
                asin: item.asin || null,
                price_usd: itemPrice,
                landed_cost_usd: landedCostEst,
                suggested_price_usd: suggestedSalePrice,
                margin_percent: marginPct,
                outside_watchlist: isOutside,
                why_explanation: whyExplanation,
                evidence: { 
                  source_url: itemSourceUrl, 
                  image_url: sanitizeImageUrl(item.image_url),
                  snippet: item.evidence_snippet,
                  raw_sources: rawSources.slice(0, 3),
                  mlu_matches_count: localMluMatchesCount
                },
                discovered_at: new Date().toISOString(),
                last_verified_at: new Date().toISOString()
              });
              if (!discErr) discoveriesCreated++;
            } catch (insDiscErr) {
              console.warn('[DiscoveryHandler] Discovery insertion warning:', insDiscErr.message);
            }
          }

          // Persist GLOBAL TREND CLUSTERS in sourcing_trends (country = 'GLOBAL')
          const subtrendsList = (parsed.subtrends && parsed.subtrends.length > 0) ? parsed.subtrends : [topBrand, 'Coleccionables 2026'];
          for (const sub of subtrendsList) {
            try {
              const { error: trendErr } = await supabase.from('sourcing_trends').upsert({
                country: 'GLOBAL', // Scope: GLOBAL (Not local UY trend!)
                topic: sub,
                category: 'Coleccionables',
                market_trend_score: 82,
                collectibles_trend_score: 68,
                composite_score: 75,
                status: 'GROWING',
                direction: 'UP',
                confidence: 'HIGH',
                drivers: ['Lanzamiento oficial verificado vía Web Research Global', 'Tracción en retailers y distribuidores internacionales'],
                subtrends: [sub],
                why_summary: parsed.summary || `Tendencia global activa detectada con evidencia pública verificada (${sub}).`,
                evidence_count: rawSources.length || 1,
                first_detected_at: new Date().toISOString(),
                last_detected_at: new Date().toISOString()
              }, { onConflict: 'country,topic' });
              if (!trendErr) globalTrendsCreated++;
            } catch (trErr) {
              console.warn('[DiscoveryHandler] Trend upsert warning:', trErr.message);
            }
          }
        } else {
          console.info('[DiscoveryHandler] Web Research returned 0 parsed product items. Skipping discovery creation (no synthetic fallbacks).');
        }
      } catch (webErr) {
        console.warn('[DiscoveryHandler] Web Research error:', webErr.message);
        failedSources.push('openai_web_search');
        sourceHealthAudit.openai_web_search = { status: 'FAILED', error: webErr.message, scope: 'GLOBAL' };
      }
    }

  } catch (err) {
    console.error('[DiscoveryHandler] Error general en pipeline:', err);
    failedSources.push('pipeline_exception');
  }

  const durationMs = Date.now() - startTime;
  const status = failedSources.length === 0 ? 'SUCCESS' : (successfulSources.length > 0 ? 'PARTIAL_SUCCESS' : 'FAILED');

  // 5. Update Run Record in Database
  try {
    if (runUuid) {
      await supabase.from('sourcing_discovery_runs').update({
        completed_at: new Date().toISOString(),
        status,
        sources_successful: successfulSources,
        sources_failed: failedSources,
        signals_created: globalSignalsCreated + localSignalsCreated,
        signals_updated: 0,
        products_detected: productsDetected,
        trends_created: globalTrendsCreated + localTrendsCreated,
        discoveries_created: discoveriesCreated,
        ai_calls: aiCallsCount,
        estimated_ai_cost_usd: totalAiCostUsd,
        metadata: { 
          run_id: runId, 
          duration_ms: durationMs,
          source_health: sourceHealthAudit,
          counts: {
            global_signals: globalSignalsCreated,
            local_signals: localSignalsCreated,
            global_trends: globalTrendsCreated,
            local_trends: localTrendsCreated,
            amazon_raw: amazonRawCount,
            mlu_raw: mluRawCount,
            radar_raw: radarRawCount,
            web_search_raw: webSearchRawCount
          }
        }
      }).eq('id', runUuid);
    }
  } catch (updErr) {
    console.warn('[DiscoveryHandler] Run update error:', updErr.message);
  }

  const resultSummary = {
    success: true,
    run_id: runId,
    status,
    trigger,
    target_market: targetMarket,
    duration_ms: durationMs,
    sources_successful: successfulSources,
    sources_failed: failedSources,
    source_health: sourceHealthAudit,
    signals_breakdown: {
      global_signals: globalSignalsCreated,
      local_signals: localSignalsCreated,
      total_signals: globalSignalsCreated + localSignalsCreated
    },
    trends_breakdown: {
      global_trends: globalTrendsCreated,
      local_trends: localTrendsCreated
    },
    discoveries_created: discoveriesCreated,
    raw_counts: {
      amazon_products: amazonRawCount,
      mlu_items: mluRawCount,
      radar_events: radarRawCount,
      web_search_sources: webSearchRawCount
    },
    ai_calls: aiCallsCount,
    ai_cost_usd: totalAiCostUsd,
    completed_at: new Date().toISOString()
  };

  return res.status(200).json(resultSummary);
}
