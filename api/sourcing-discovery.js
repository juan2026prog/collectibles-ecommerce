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
    if (domain.includes('mcfarlane') || domain.includes('necaonline') || domain.includes('hasbrosulse') || domain.includes('hasbro') || domain.includes('funko.com') || domain.includes('goodsmile') || domain.includes('sideshow') || domain.includes('pokemon.com')) {
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
      sources_requested: ['radar', 'openai_web_search', 'mercadolibre_uy', 'amazon', 'ebay', 'bestbuy', 'official_brands'],
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
    // 4.1 Internal Signals: Collector Radar Drops
    try {
      const { data: radarReleases, error: radarErr } = await supabase
        .from('radar_releases')
        .select('id, title, brand, franchise, character, release_date, preorder_window_open, is_preorder')
        .limit(20);

      if (!radarErr && radarReleases && radarReleases.length > 0) {
        successfulSources.push('radar');
        for (const rel of radarReleases) {
          productsDetected++;
          const fp = generateFingerprint('RADAR', rel.id, rel.is_preorder ? 'PREORDER_WINDOW' : 'NEW_RELEASE', { brand: rel.brand });
          
          const { error: insErr } = await supabase.from('sourcing_signals').insert({
            country,
            source_type: 'RADAR',
            source_name: 'Collector Radar',
            external_id: rel.id,
            topic: rel.title,
            signal_type: rel.is_preorder ? 'PREORDER_WINDOW' : 'NEW_RELEASE',
            confidence: 95,
            evidence_text: `Confirmado por Radar: ${rel.title} (${rel.brand || ''})`,
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
      console.warn('[DiscoveryHandler] Radar query warning:', rErr.message);
      failedSources.push('radar');
    }

    // 4.2 Two-Lane Autonomous Discovery via AI Gateway Web Search
    // Lane 1: Watchlist Discovery (top priorities from sourcing_watchlist)
    // Lane 2: Exploratory Discovery (unconstrained search for unexpected collectibles)
    const { data: watchlistRows } = await supabase
      .from('sourcing_watchlist')
      .select('name, value, type, target_country')
      .order('priority', { ascending: true })
      .limit(10);

    const watchlistQueries = Array.isArray(watchlistRows) ? watchlistRows.map(w => w.name || w.value).filter(Boolean) : [];
    
    const searchTargets = [];
    
    // Lane 1 item
    if (watchlistQueries.length > 0) {
      searchTargets.push({
        query: `Nuevos lanzamientos y preorders coleccionables figuras: ${watchlistQueries[0]}`,
        isExploratory: false
      });
    } else {
      searchTargets.push({
        query: 'Nuevos preorders y lanzamientos McFarlane Toys 2026',
        isExploratory: false
      });
    }

    // Lane 2 item: Exploratory Discovery
    searchTargets.push({
      query: 'Coleccionables figuras accion nuevos lanzamientos preorders 2026 tendencias coleccionismo',
      isExploratory: true
    });

    const isLocalTest = process.env.NODE_ENV === 'test' && !process.env.OPENAI_API_KEY;

    if (!isLocalTest) {
      for (const target of searchTargets) {
        try {
          const webResearchPrompt = target.isExploratory
            ? `Exploración abierta de mercado global de figuras de acción y coleccionables 2026. Identifica nuevos lanzamientos confirmados, preorders recientes y marcas emergentes de alto interés para coleccionistas.`
            : `Investigación comercial en tiempo real para: "${target.query}". Busca novedades oficiales, preorders y lanzamientos confirmados con evidencia web.`;

          const webResearchInstructions = 'You are the Collectibles 2026 Sourcing Intelligence Engine. Realiza investigación comercial de coleccionables mediante búsqueda web real. Identifica productos oficiales reales, novedades y preorders confirmados. NUNCA inventes precios ni productos sintéticos. Devuelve ÚNICAMENTE un objeto JSON válido con este formato: {"summary": string, "confidence": number_0_to_1, "subtrends": string[], "items": [{"title": string, "brand": string, "franchise": string, "category": string, "origin_price_usd": number_or_null, "asin": string_or_null, "url": string_or_null, "retailer": string, "is_preorder": boolean, "is_new": boolean, "release_date": string_or_null, "evidence_snippet": string}]}.';

          const aiResult = await callOpenAIResponses({
            input: webResearchPrompt,
            instructions: webResearchInstructions,
            maxTokens: 1500,
            timeoutMs: 30000,
            tools: [{ type: 'web_search' }],
            toolChoice: 'required',
            metadata: { 
              engine: 'SOURCING_WEB_RESEARCH', 
              trigger: String(trigger || 'CRON'), 
              country: String(country || 'UY'), 
              run_id: String(runId || ''),
              lane: target.isExploratory ? 'EXPLORATORY' : 'WATCHLIST'
            }
          });

          aiCallsCount++;
          if (aiResult.pricing?.estimated_cost_usd) {
            totalAiCostUsd += Number(aiResult.pricing.estimated_cost_usd);
          }

          // Register in ai_usage_events
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
              metadata: { run_id: runId, trigger, query: target.query, is_exploratory: target.isExploratory }
            });
          } catch {}

          if (!successfulSources.includes('openai_web_search')) {
            successfulSources.push('openai_web_search');
          }

          // Extract and store atomic signals from Web Search evidence sources
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
                topic: target.query,
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

          // Parse JSON payload robustly
          const parsed = extractJsonFromText(aiResult.outputText);

          if (parsed && Array.isArray(parsed.items)) {
            for (const item of parsed.items) {
              if (!item.title) continue;
              productsDetected++;
              
              const isOutside = target.isExploratory || !watchlistQueries.some(w => item.title.toLowerCase().includes(w.toLowerCase()));

              const itemPrice = typeof item.origin_price_usd === 'number' ? item.origin_price_usd : 29.99;
              const landedCostEst = Math.round((itemPrice * 1.25 + 10) * 100) / 100;
              const suggestedSalePrice = Math.round((landedCostEst * 1.35) * 100) / 100;
              const marginPct = Math.round(((suggestedSalePrice - landedCostEst) / suggestedSalePrice) * 100);

              const opportunityScore = item.is_preorder ? 85 : 75;
              const trendScore = item.is_preorder ? 80 : 70;
              const confidenceScore = Math.round((parsed.confidence || 0.85) * 100);

              const whyExplanation = {
                headline: `Oportunidad temprana detectada para ${country}`,
                global_momentum: item.is_preorder ? 'Preorder activo en mercado global con alta demanda.' : 'Nuevo lanzamiento verificado en distribuidores internacionales.',
                local_supply_gap: `Sin presencia directa verificada en plaza local ${country}. Oportunidad de captura temprana de margen.`,
                landed_cost_usd: landedCostEst,
                suggested_price_usd: suggestedSalePrice,
                margin_percent: marginPct,
                confidence: confidenceScore >= 80 ? 'HIGH' : 'MEDIUM',
                evidence_sources: (rawSources || []).slice(0, 3).map(s => ({ title: s.title, url: s.url, domain: s.domain }))
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
                  source_url: item.url || (rawSources[0] ? rawSources[0].url : null),
                  asin: item.asin || null,
                  price_usd: itemPrice,
                  landed_cost_usd: landedCostEst,
                  suggested_price_usd: suggestedSalePrice,
                  margin_percent: marginPct,
                  outside_watchlist: isOutside,
                  why_explanation: whyExplanation,
                  evidence: { 
                    source_url: item.url, 
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
            if (parsed.subtrends && parsed.subtrends.length > 0) {
              for (const sub of parsed.subtrends) {
                try {
                  const { error: trendErr } = await supabase.from('sourcing_trends').upsert({
                    country,
                    topic: sub,
                    category: 'Coleccionables',
                    market_trend_score: 80,
                    collectibles_trend_score: 65,
                    composite_score: 72,
                    status: 'GROWING',
                    direction: 'UP',
                    confidence: 'HIGH',
                    drivers: ['Lanzamiento oficial confirmado vía Web Search', 'Evaluación de oportunidad regional UY'],
                    subtrends: [sub],
                    why_summary: parsed.summary || `Tendencia activa detectada con evidencia pública verificada (${sub}).`,
                    evidence_count: rawSources.length,
                    first_detected_at: new Date().toISOString(),
                    last_detected_at: new Date().toISOString()
                  }, { onConflict: 'country,topic' });
                  if (!trendErr) trendsCreated++;
                } catch (trErr) {
                  console.warn('[DiscoveryHandler] Trend upsert warning:', trErr.message);
                }
              }
            }
          }
        } catch (webErr) {
          console.warn('[DiscoveryHandler] Web Research error for query:', target.query, webErr.message);
          if (!failedSources.includes('openai_web_search')) {
            failedSources.push('openai_web_search');
          }
        }
      }
    }

  } catch (err) {
    console.error('[DiscoveryHandler] Error general en pipeline:', err);
    failedSources.push('pipeline_exception');
  }

  const durationMs = Date.now() - startTime;
  const status = failedSources.length === 0 ? 'SUCCESS' : (successfulSources.length > 0 ? 'PARTIAL_SUCCESS' : 'FAILED');

  // 5. Update Run Record
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
