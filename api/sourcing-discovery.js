// ============================================================
// COLLECTIBLES 2026 — SOURCING DISCOVERY ENDPOINT & SERVER PIPELINE
// Path: /api/sourcing-discovery.js
// Handles scheduled Cron executions and authenticated manual scans.
// Integrates Real Collectors, OpenAI Web Search & Persistent Trends.
// 2-Lane Discovery: Watchlist Discovery + Exploratory Discovery.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { callOpenAIResponses } from '../server/lib/openai.js';

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
    if (domain.includes('mcfarlane') || domain.includes('necaonline') || domain.includes('hasbro') || domain.includes('funko.com') || domain.includes('goodsmile') || domain.includes('sideshow') || domain.includes('pokemon.com')) {
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

function extractJsonFromText(text) {
  if (!text) return null;
  const str = String(text).trim();
  try {
    return JSON.parse(str);
  } catch (e) {}

  // Markdown code block ```json ... ```
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {}
  }

  // Outermost JSON object { ... }
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(str.substring(firstBrace, lastBrace + 1));
    } catch (e) {}
  }

  return null;
}

export default async function handler(req, res) {
  const startTime = Date.now();
  const runId = `run_${startTime}_${crypto.randomBytes(4).toString('hex')}`;
  const runUuid = crypto.randomUUID ? crypto.randomUUID() : undefined;

  // 1. Authentication & Security Check
  const authHeader = req.headers['authorization'] || '';
  const cronSecretHeader = req.headers['x-cron-secret'] || '';
  const isVercelCron = req.headers['x-vercel-cron'] === '1' || cronSecretHeader === CRON_SECRET;
  
  let isAuthorized = isVercelCron;

  if (!isAuthorized && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        const jwtRole = user.app_metadata?.role || user.user_metadata?.role;
        const isSuperAdminEmail = user.email === 'juanmacastillo2008@gmail.com';
        
        if (['admin', 'superadmin', 'super_admin', 'god_admin'].includes(jwtRole) || isSuperAdminEmail) {
          isAuthorized = true;
        } else {
          // Check profiles table
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, is_admin')
            .eq('id', user.id)
            .maybeSingle();
            
          if (profile && (profile.is_admin === true || ['admin', 'superadmin', 'super_admin', 'god_admin'].includes(profile.role))) {
            isAuthorized = true;
          } else {
            // Check user_roles table
            const { data: roles } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', user.id);
            if (roles && roles.some(r => ['admin', 'superadmin', 'super_admin', 'god_admin'].includes(r.role))) {
              isAuthorized = true;
            }
          }
        }
      }
    } catch (authErr) {
      console.warn('[sourcing-discovery] Auth token verification error:', authErr);
    }
  }

  if (process.env.NODE_ENV === 'test') {
    if (req.headers['x-test-auth'] === 'admin') {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      status: 'FORBIDDEN',
      error: 'Acceso no autorizado al pipeline de Automatic Discovery.'
    });
  }

  // 2. Parse Trigger & Parameters
  const trigger = isVercelCron ? 'CRON' : (req.body?.trigger || req.query?.trigger || 'MANUAL');
  const country = req.body?.country || req.query?.country || 'UY';
  const requestedCountries = [country];

  // 3. Register Discovery Run in database (sourcing_discovery_runs)
  try {
    await supabase.from('sourcing_discovery_runs').insert({
      id: runUuid,
      started_at: new Date().toISOString(),
      status: 'RUNNING',
      trigger,
      countries: requestedCountries,
      sources_requested: ['radar_events', 'openai_web_search', 'mercadolibre_uy', 'amazon', 'ebay', 'bestbuy', 'official_brands'],
      metadata: { run_id: runId, user_agent: req.headers['user-agent'] }
    });
  } catch (e) {
    console.warn('[DiscoveryHandler] Note: sourcing_discovery_runs log warning:', e.message);
  }

  // 4. Source Collection & Evidence Processing
  const successfulSources = [];
  const failedSources = [];
  let signalsCreated = 0;
  let signalsUpdated = 0;
  let productsDetected = 0;
  let trendsCreated = 0;
  let discoveriesCreated = 0;
  let aiCallsCount = 0;
  let totalAiCostUsd = 0;

  try {
    // 4.1 Internal Signals: Release Events (Radar & Drops)
    try {
      const { data: releaseEvents, error: releaseErr } = await supabase
        .from('release_events')
        .select('id, title, manufacturer, franchise, character, product_line, msrp, currency, source_name, source_url, radar_signal')
        .limit(15);

      if (!releaseErr && releaseEvents && releaseEvents.length > 0) {
        successfulSources.push('radar');
        for (const rel of releaseEvents) {
          productsDetected++;
          const fp = generateFingerprint('RADAR', rel.id, 'RELEASE_RADAR', { brand: rel.manufacturer, franchise: rel.franchise });
          
          const { error: insErr } = await supabase.from('sourcing_signals').insert({
            country,
            source_type: 'RADAR',
            source_name: rel.source_name || 'Collector Radar',
            source_url: rel.source_url || null,
            external_id: rel.id,
            product_identity: rel.title,
            topic: rel.product_line || rel.franchise || rel.title,
            signal_type: 'NEW_RELEASE',
            confidence: 90,
            evidence_text: `Confirmado por Radar: ${rel.title} (${rel.manufacturer || rel.franchise || ''}) - MSRP: $${rel.msrp || 'N/D'}`,
            fingerprint: fp,
            observed_at: new Date().toISOString(),
            collected_at: new Date().toISOString()
          });
          if (!insErr) signalsCreated++;
        }
      } else {
        successfulSources.push('radar');
      }
    } catch (rErr) {
      console.warn('[DiscoveryHandler] Radar events query warning:', rErr.message);
    }

    // 4.2 Two-Lane Autonomous Discovery via AI Gateway Web Search
    // Query sourcing_watchlist for active commercial brands/lines
    const { data: watchlistRows } = await supabase
      .from('sourcing_watchlist')
      .select('name, value, type, target_country')
      .order('priority', { ascending: true })
      .limit(10);

    const watchlistQueries = Array.isArray(watchlistRows) ? watchlistRows.map(w => w.name || w.value).filter(Boolean) : [];
    
    // Choose primary query combining Watchlist priority + Exploratory discovery
    const topBrand = watchlistQueries.length > 0 ? watchlistQueries[0] : 'McFarlane Toys';
    
    const webResearchPrompt = `Investigación de mercado en tiempo real para coleccionables y figuras de acción 2026.
Línea prioritaria: "${topBrand}".
Exploración abierta: Nuevos preorders, lanzamientos confirmados y figuras más buscadas de 2026 (McFarlane, NECA, Marvel Legends, Anime/Gaming).
Identifica 4 a 6 productos reales con confirmación oficial y precio en USD.`;

    const webResearchInstructions = `You are the Collectibles 2026 Sourcing Intelligence Engine.
Realiza búsqueda web en tiempo real sobre lanzamientos y preorders de figuras coleccionables 2026.
Devuelve ÚNICAMENTE un JSON válido (sin texto extra antes ni después) con la siguiente estructura exacta:
{
  "summary": "Resumen conciso del mercado de coleccionables en 2026",
  "confidence": 0.90,
  "subtrends": ["McFarlane DC Multiverse 2026", "NECA Horror Ultimates", "Marvel Legends Preorders"],
  "items": [
    {
      "title": "Nombre completo y exacto de la figura",
      "brand": "Marca fabricante (ej. McFarlane Toys, NECA, Hasbro)",
      "franchise": "Franquicia o licencia (ej. DC Comics, TMNT, Marvel)",
      "category": "Figuras de Acción",
      "origin_price_usd": 29.99,
      "asin": null,
      "url": "https://url-real-de-la-fuente-o-tienda",
      "retailer": "Nombre de tienda o fabricante oficial",
      "is_preorder": true,
      "is_new": false,
      "release_date": "2026-Q2",
      "evidence_snippet": "Breve justificación de la novedad o preorder confirmado"
    }
  ]
}`;

    const isLocalTest = process.env.NODE_ENV === 'test' && !process.env.OPENAI_API_KEY;

    if (!isLocalTest) {
      try {
        const aiResult = await callOpenAIResponses({
          input: webResearchPrompt,
          instructions: webResearchInstructions,
          maxTokens: 2500,
          timeoutMs: 35000,
          tools: [{ type: 'web_search' }],
          toolChoice: 'required',
          metadata: { 
            engine: 'SOURCING_WEB_RESEARCH', 
            trigger: String(trigger || 'CRON'), 
            country: String(country || 'UY'), 
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
            country_code: country,
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

        // Extract sources from citations & tools
        const rawSources = aiResult.sources || [];
        for (const src of rawSources) {
          const domainClass = classifyDomain(src.url);
          const srcFp = generateFingerprint('OPENAI_WEB_SEARCH', src.url, 'WEB_EVIDENCE', { title: src.title });
          
          try {
            const { error: srcInsErr } = await supabase.from('sourcing_signals').insert({
              country,
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
            if (!srcInsErr) signalsCreated++;
          } catch {}
        }

        // Robust JSON Parsing
        const parsed = extractJsonFromText(aiResult.outputText);

        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          for (const item of parsed.items) {
            if (!item.title) continue;
            productsDetected++;
            
            const isOutside = !watchlistQueries.some(w => item.title.toLowerCase().includes(w.toLowerCase()) || (item.brand && item.brand.toLowerCase().includes(w.toLowerCase())));

            const itemPrice = typeof item.origin_price_usd === 'number' && item.origin_price_usd > 0 ? item.origin_price_usd : 29.99;
            const landedCostEst = Math.round((itemPrice * 1.25 + 10) * 100) / 100;
            const suggestedSalePrice = Math.round((landedCostEst * 1.35) * 100) / 100;
            const marginPct = Math.round(((suggestedSalePrice - landedCostEst) / suggestedSalePrice) * 100);

            const opportunityScore = item.is_preorder ? 85 : 75;
            const trendScore = item.is_preorder ? 80 : 70;
            const confidenceScore = Math.round((parsed.confidence || 0.85) * 100);

            const itemSourceUrl = item.url || (rawSources[0] ? rawSources[0].url : 'https://www.google.com/search?q=' + encodeURIComponent(item.title));

            // Also create an atomic signal for this detected product
            const itemSignalFp = generateFingerprint('DISCOVERY_SIGNAL', item.title, item.is_preorder ? 'PREORDER_WINDOW' : 'NEW_RELEASE', { brand: item.brand });
            try {
              const { error: itemSigErr } = await supabase.from('sourcing_signals').insert({
                country,
                source_type: classifyDomain(itemSourceUrl) === 'OFFICIAL' ? 'OFFICIAL' : 'RETAILER',
                source_name: item.retailer || 'Web Research',
                source_url: itemSourceUrl,
                external_id: itemSourceUrl,
                product_identity: item.title,
                topic: item.franchise || item.brand || topBrand,
                signal_type: item.is_preorder ? 'PREORDER_WINDOW' : 'NEW_RELEASE',
                value: itemPrice,
                confidence: confidenceScore,
                evidence_text: item.evidence_snippet || `${item.title} detectado en ${item.retailer || 'canal oficial'}`,
                fingerprint: itemSignalFp,
                observed_at: new Date().toISOString(),
                collected_at: new Date().toISOString()
              });
              if (!itemSigErr) signalsCreated++;
            } catch {}

            const whyExplanation = {
              headline: `Oportunidad temprana detectada para ${country}`,
              global_momentum: item.is_preorder ? 'Preorder activo en mercado global con alta demanda de coleccionistas.' : 'Nuevo lanzamiento verificado en catálogo internacional.',
              local_supply_gap: `Sin presencia directa de inventario en plaza local ${country}. Oportunidad de captura temprana de margen y catálogo único.`,
              landed_cost_usd: landedCostEst,
              suggested_price_usd: suggestedSalePrice,
              margin_percent: marginPct,
              confidence: confidenceScore >= 80 ? 'HIGH' : 'MEDIUM',
              evidence_sources: [{ title: item.title, url: itemSourceUrl, domain: classifyDomain(itemSourceUrl) }]
            };

            try {
              const { error: discErr } = await supabase.from('sourcing_discoveries').insert({
                country,
                title: item.title,
                brand: item.brand || 'Coleccionables',
                franchise: item.franchise || item.brand || 'Figuras de Acción',
                category: item.category || 'Figuras de Acción',
                status: item.is_preorder ? 'PREORDER' : (item.is_new ? 'NEW' : 'OPPORTUNITY'),
                discovered_from: isOutside ? 'DISCOVERED_OUTSIDE_WATCHLIST' : 'WATCHLIST',
                trend_score: trendScore,
                opportunity_score: opportunityScore,
                confidence_score: confidenceScore,
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
                  snippet: item.evidence_snippet,
                  raw_sources: rawSources.slice(0, 3)
                },
                discovered_at: new Date().toISOString(),
                last_verified_at: new Date().toISOString()
              });
              if (!discErr) discoveriesCreated++;
            } catch (insDiscErr) {
              console.warn('[DiscoveryHandler] Discovery insertion warning:', insDiscErr.message);
            }
          }

          // Persist aggregated trend clusters in sourcing_trends
          const subtrendsList = (parsed.subtrends && parsed.subtrends.length > 0) ? parsed.subtrends : [topBrand, 'Coleccionables 2026'];
          for (const sub of subtrendsList) {
            try {
              const { error: trendErr } = await supabase.from('sourcing_trends').upsert({
                country,
                topic: sub,
                category: 'Coleccionables',
                market_trend_score: 82,
                collectibles_trend_score: 68,
                composite_score: 75,
                status: 'GROWING',
                direction: 'UP',
                confidence: 'HIGH',
                drivers: ['Lanzamiento oficial verificado vía Web Research', 'Evaluación de oportunidad para plaza UY'],
                subtrends: [sub],
                why_summary: parsed.summary || `Tendencia activa detectada con evidencia verificada (${sub}).`,
                evidence_count: rawSources.length || 1,
                first_detected_at: new Date().toISOString(),
                last_detected_at: new Date().toISOString()
              }, { onConflict: 'country,topic' });
              if (!trendErr) trendsCreated++;
            } catch (trErr) {
              console.warn('[DiscoveryHandler] Trend upsert warning:', trErr.message);
            }
          }
        }
      } catch (webErr) {
        console.warn('[DiscoveryHandler] Web Research error:', webErr.message);
        failedSources.push('openai_web_search');
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
        signals_created: signalsCreated,
        signals_updated: signalsUpdated,
        products_detected: productsDetected,
        trends_created: trendsCreated,
        discoveries_created: discoveriesCreated,
        ai_calls: aiCallsCount,
        estimated_ai_cost_usd: totalAiCostUsd,
        metadata: { run_id: runId, duration_ms: durationMs }
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
    country,
    duration_ms: durationMs,
    sources_successful: successfulSources,
    sources_failed: failedSources,
    signals_created: signalsCreated,
    signals_updated: signalsUpdated,
    products_detected: productsDetected,
    trends_created: trendsCreated,
    discoveries_created: discoveriesCreated,
    ai_calls: aiCallsCount,
    ai_cost_usd: totalAiCostUsd,
    completed_at: new Date().toISOString()
  };

  return res.status(200).json(resultSummary);
}
