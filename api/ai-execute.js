// ============================================================
// COLLECTIBLES 2026 — AI EXECUTE ENDPOINT (SERVER-SIDE GATEWAY)
// Path: /api/ai-execute
// Secure handler for all OpenAI invocations with full telemetry.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { callOpenAIResponses, OpenAIError } from '../server/lib/openai.js';
import { generateEvidenceFingerprint } from '../server/lib/canonicalJson.js';
import { 
  resolveResearchMode, 
  generateResearchCacheKey, 
  normalizeQuery, 
  buildDiscoveryPrompt,
  buildCommercialEnrichmentPrompt,
  parseCommercialEnrichmentItems,
  planDiscoveryBatches,
  planEnrichmentBatches,
  normalizeResultLimit,
  deduplicateResearchCandidates
} from '../server/lib/researchCostOptimizer.js';
import { validateRequestedModel } from '../server/lib/openaiPricing.js';
import { authenticateRequest, acquireInFlightLock } from '../server/lib/authGuard.js';
import { validateCandidateBatch, associateSourcesToCandidates, mergeCommercialEnrichment } from '../server/lib/sourcingSourceVerifier.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const ENGINE_COUNTRY_FLAG = {
  AI_SEARCH: 'ai_search_enabled',
  PRODUCT_DISCOVERY: 'product_discovery_enabled',
  TREND_ANALYSIS: 'trend_analysis_enabled',
  PRODUCT_CURATION: 'product_curation_enabled',
  COUNTRY_INTELLIGENCE: 'country_intelligence_enabled',
  RADAR_INTELLIGENCE: 'radar_intelligence_enabled',
  RELEASE_INTELLIGENCE: 'release_intelligence_enabled',
  RESEARCH_INTELLIGENCE: 'product_discovery_enabled',
  SOURCING_WEB_RESEARCH: 'product_discovery_enabled'
};

function classifyDomain(urlStr) {
  try {
    const domain = new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
    if (domain.includes('mcfarlane') || domain.includes('necaonline') || domain.includes('hasbropulse') || domain.includes('funko.com') || domain.includes('goodsmile') || domain.includes('sideshow') || domain.includes('pokemon.com')) {
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

function extractAllowedEvidenceIds(evidence) {
  const allowed = new Set();
  if (!evidence || typeof evidence !== 'object') return allowed;

  const traverse = (item) => {
    if (!item) return;
    if (typeof item === 'string' || typeof item === 'number') {
      allowed.add(String(item));
    } else if (Array.isArray(item)) {
      item.forEach(traverse);
    } else if (typeof item === 'object') {
      if (item.id) allowed.add(String(item.id));
      if (item.canonical_sku) allowed.add(String(item.canonical_sku));
      if (item.sku) allowed.add(String(item.sku));
      if (item.product_id) allowed.add(String(item.product_id));
      if (item.source_product_id) allowed.add(String(item.source_product_id));
      if (item.external_product_id) allowed.add(String(item.external_product_id));
      if (item.asin) allowed.add(String(item.asin));
      if (item.item_id) allowed.add(String(item.item_id));
      if (item.gap_id) allowed.add(String(item.gap_id));
      if (item.event_id) allowed.add(String(item.event_id));
      if (item.wishlist_id) allowed.add(String(item.wishlist_id));
      if (item.source_id) allowed.add(String(item.source_id));
      if (item.candidate_id) allowed.add(String(item.candidate_id));

      for (const [k, v] of Object.entries(item)) {
        if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
          traverse(v);
        }
      }
    }
  };

  traverse(evidence);
  return allowed;
}

function instructionsFor(engine, operation) {
  const common = 'You are the Collectibles 2026 AI engine. Never invent inventory, price, stock, release dates, retailer availability, shipping, customs or product facts. Treat supplied catalog/context data as authoritative. Reply in Spanish unless the user explicitly requests another language.';
  if (engine === 'AI_SEARCH') {
    return common + ' For AI Search, understand collector intent and improve the answer using only supplied products and context. Return ONLY valid JSON with keys headline (string), summary (string), breakdown (array of strings), nextHighlight (string or null), relatedQuestions (array of up to 4 strings).';
  }
  if (engine === 'SOURCING_WEB_RESEARCH' || engine === 'RESEARCH_INTELLIGENCE' || (operation && /^(sourcing_research|web_research|sourcing_market_research)$/i.test(operation))) {
    return common + ' Realiza investigación comercial de coleccionables mediante búsqueda web real. Identifica productos oficiales reales, novedades y preorders confirmados. NUNCA inventes precios, landed costs, stock comercial ni URLs de imagen. Devuelve image_url únicamente cuando corresponda de forma verificable al producto exacto encontrado en la fuente oficial/retailer; de lo contrario null. Devuelve ÚNICAMENTE un JSON válido con la siguiente estructura: {"summary": string, "confidence": number_0_to_1, "subtrends": string[], "items": [{"title": string, "brand": string, "franchise": string, "category": string, "origin_price_usd": number_or_null, "image_url": string_or_null, "asin": string_or_null, "url": string_or_null, "retailer": string, "is_preorder": boolean, "is_new": boolean, "release_date": string_or_null, "evidence_snippet": string}]}.';
  }
  if (['PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION','COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE'].includes(engine)) {
    return common + ' You are advisory only: never publish, buy, change prices, or trigger automation. Reason only from evidence in payload.evidence. Missing evidence must reduce confidence, never be guessed. scoreAdjustment is only a bounded advisory adjustment from -10 to 10; deterministic Collectibles scoring remains authoritative. Return ONLY valid JSON: {"summary":string,"confidence":number_0_to_1,"signals":string[],"risks":string[],"recommendations":string[],"evidenceIds":string[],"scoreAdjustment":number_minus10_to_10,"action":"REVIEW"|"WATCH"|"IGNORE"}.';
  }
  return common + ` Operation: ${operation}. Return concise useful output grounded only in supplied data.`;
}

function parseSourcingItems(outputText) {
  if (!outputText || typeof outputText !== 'string') return { summary: null, confidence: 0.85, subtrends: [], items: [] };
  let structured = null;
  const clean = outputText.trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();
  try {
    structured = JSON.parse(clean);
  } catch {
    const match = outputText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      try {
        structured = JSON.parse(match[1].trim());
      } catch {}
    }
  }

  // Robust repair fallback if truncated
  if (!structured) {
    try {
      const firstBrace = clean.indexOf('{');
      if (firstBrace !== -1) {
        const repaired = clean.slice(firstBrace);
        const itemsMatch = repaired.match(/"items"\s*:\s*\[([\s\S]*)/i);
        if (itemsMatch) {
          const rawItemsBlock = itemsMatch[1];
          const lastItemClose = rawItemsBlock.lastIndexOf('}');
          if (lastItemClose !== -1) {
            const validItemsString = rawItemsBlock.slice(0, lastItemClose + 1);
            const parsedItems = JSON.parse(`[${validItemsString}]`);
            const summaryMatch = repaired.match(/"summary"\s*:\s*"([^"]*)"/i);
            const confMatch = repaired.match(/"confidence"\s*:\s*([0-9.]+)/i);
            structured = {
              summary: summaryMatch ? summaryMatch[1] : null,
              confidence: confMatch ? parseFloat(confMatch[1]) : 0.85,
              subtrends: [],
              items: parsedItems
            };
          }
        }
      }
    } catch {}
  }

  if (!structured) return { summary: null, confidence: 0.85, subtrends: [], items: [] };

  let items = [];
  if (Array.isArray(structured)) {
    items = structured;
  } else if (Array.isArray(structured.items)) {
    items = structured.items;
  } else if (Array.isArray(structured.products)) {
    items = structured.products;
  } else if (Array.isArray(structured.candidates)) {
    items = structured.candidates;
  } else if (Array.isArray(structured.results)) {
    items = structured.results;
  } else if (Array.isArray(structured.discoveries)) {
    items = structured.discoveries;
  }

  return {
    summary: structured.summary || null,
    confidence: typeof structured.confidence === 'number' ? structured.confidence : 0.85,
    subtrends: Array.isArray(structured.subtrends) ? structured.subtrends : [],
    items
  };
}


async function safeDbQuery(queryPromise, fallback = { data: null, error: null }, timeoutMs = 2500) {
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs));
    return await Promise.race([queryPromise, timeout]);
  } catch (err) {
    console.warn('[AI Execute] DB Query error:', err.message);
    return fallback;
  }
}

async function executeHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      status: 'INVALID_REQUEST',
      error: 'Method not allowed. Use POST.'
    });
  }

  // 1. Authoritative Authentication & Security Check (Fail-closed)
  const auth = await authenticateRequest(req, { allowCron: true });
  if (!auth.authenticated) {
    return res.status(401).json({
      success: false,
      status: 'UNAUTHORIZED',
      error: auth.message || 'Acceso no autorizado: Se requiere token de sesión Bearer válido.',
      code: auth.error || 'AUTHENTICATION_REQUIRED'
    });
  }

  // Must be at least Admin to trigger AI executions
  if (!auth.isAdmin) {
    return res.status(403).json({
      success: false,
      status: 'FORBIDDEN',
      error: 'Acceso denegado: Se requieren permisos de Administrador para ejecutar operaciones de IA.',
      code: 'ADMIN_REQUIRED'
    });
  }

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const client = (SUPABASE_KEY && !SUPABASE_KEY.startsWith('sb_publishable'))
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(authHeader.startsWith('Bearer ') ? {
          global: { headers: { Authorization: authHeader } }
        } : {})
      })
    : null;

  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const {
    engine = 'AI_SEARCH',
    operation = 'execute',
    country = 'UY',
    query,
    research_depth,
    requested_model,
    time_scope,
    period,
    product_family,
    productFamily,
    category,
    result_limit,
    resultLimit,
    prompt,
    payload,
    context = {}
  } = req.body || {};

  const effectiveResultLimit = normalizeResultLimit(
    result_limit || resultLimit || payload?.result_limit || payload?.resultLimit || context?.result_limit || context?.resultLimit || 'AUTO'
  );

  const effectiveTimeScope = time_scope || period || payload?.time_scope || payload?.period || context?.time_scope || context?.period || 'ALL_TIME';
  const effectiveProductFamily = product_family || productFamily || category || payload?.product_family || payload?.productFamily || payload?.category || context?.product_family || context?.productFamily || context?.category || 'ALL';
  const effectiveDepth = research_depth || payload?.research_depth || context?.research_depth || 'ECONOMICO';
  const modeConfig = resolveResearchMode(effectiveDepth);

  const effectiveRequestedModel = requested_model || req.body?.model || payload?.requested_model || context?.requested_model || 'AUTO';

  const resolvedInput = prompt || (typeof payload === 'string' ? payload : JSON.stringify(payload || {}));

  if (!resolvedInput) {
    return res.status(400).json({
      success: false,
      status: 'INVALID_OUTPUT',
      error: 'Prompt or payload is required.'
    });
  }

  const isSourcingResearch = engine === 'SOURCING_WEB_RESEARCH' || engine === 'RESEARCH_INTELLIGENCE' || (operation && /^(sourcing_research|web_research|sourcing_market_research)$/i.test(operation));

  // Extract clean search query for Sourcing Web Research without nested system prompt wrappers
  let cleanSearchQuery = '';
  if (isSourcingResearch) {
    if (typeof query === 'string' && query.trim()) {
      cleanSearchQuery = query.trim();
    } else if (typeof payload?.query === 'string' && payload.query.trim()) {
      cleanSearchQuery = payload.query.trim();
    } else if (typeof payload?.evidence?.search_query === 'string' && payload.evidence.search_query.trim()) {
      cleanSearchQuery = payload.evidence.search_query.trim();
    } else if (typeof prompt === 'string') {
      const match = prompt.match(/Consulta:\s*"([^"]+)"/i);
      if (match && match[1]) {
        cleanSearchQuery = match[1].trim();
      } else if (!prompt.includes('INVESTIGACIÓN COMERCIAL')) {
        cleanSearchQuery = prompt.trim();
      }
    }
    if (!cleanSearchQuery) {
      cleanSearchQuery = resolvedInput;
    }
  }

  const isWebSearchNeeded = engine === 'SOURCING_WEB_RESEARCH' || engine === 'RESEARCH_INTELLIGENCE' ||
    (operation && /^(sourcing_research|web_research|sourcing_market_research)$/i.test(operation)) ||
    /\b(latest|new|preorder|announced|released|trending|this week|today|recent|2026|preventa|lanzamiento)\b/i.test(cleanSearchQuery || resolvedInput);

  // Validate manual model override against Central Registry
  const modelValidation = validateRequestedModel(effectiveRequestedModel, {
    engine,
    requiresWebSearch: isWebSearchNeeded
  });

  if (!modelValidation.valid) {
    return res.status(400).json({
      success: false,
      status: 'MODEL_NOT_ALLOWED',
      error: modelValidation.message,
      requested_model: effectiveRequestedModel
    });
  }

  const isManualOverride = !modelValidation.isAuto && modelValidation.valid;
  const automaticOrManual = isManualOverride ? 'MANUAL' : 'AUTO';

  // 2. Enforce SUPERADMIN ONLY for Manual Model Override
  if (isManualOverride && !auth.isSuperAdmin) {
    return res.status(403).json({
      success: false,
      status: 'SUPERADMIN_REQUIRED',
      error: 'El selector manual de modelos de IA está restringido exclusivamente a Superadmin. Utilice el modo Automático (AUTO).',
      code: 'SUPERADMIN_REQUIRED',
      requested_model: effectiveRequestedModel
    });
  }

  // Default model & tokens derived from modeConfig for cheap-first routing, or manual override
  let selectedModel = isManualOverride 
    ? modelValidation.model 
    : (isSourcingResearch ? modeConfig.model : 'gpt-5.6-terra');
  let engineTimeoutMs = modeConfig.timeoutMs || 45000;
  let dynamicMaxTokens = modeConfig.maxOutputTokens || 750;
  let sysData = null;
  let cntrData = null;
  let engData = null;

  try {
    // 1. Validate System, Country, and Engine configs from Database
    if (client) {
      // Global switch & Circuit breaker
      const { data: fetchedSysData } = await safeDbQuery(
        client
          .from('ai_system_config')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
      );

      sysData = fetchedSysData;

      if (sysData) {
        if (!sysData.global_enabled) {
          return res.status(403).json({
            success: false,
            status: 'AI_DISABLED',
            error: 'AI Global Master Switch is OFF.'
          });
        }
        if (sysData.circuit_breaker_enabled && sysData.circuit_breaker_state === 'OPEN') {
          return res.status(503).json({
            success: false,
            status: 'CIRCUIT_OPEN',
            error: 'AI Circuit Breaker is OPEN due to budget/error thresholds.'
          });
        }
        if (sysData.default_timeout_ms) {
          engineTimeoutMs = sysData.default_timeout_ms;
        }
      }

      // Country check
      if (country && country !== 'GLOBAL' && country !== 'ALL' && country !== 'TODOS') {
        const { data: fetchedCntrData } = await safeDbQuery(
          client
            .from('ai_country_config')
            .select('*')
            .eq('country_code', country)
            .maybeSingle()
        );

        cntrData = fetchedCntrData;

        if (cntrData) {
          if (!cntrData.ai_enabled || cntrData.status !== 'ACTIVE') {
            return res.status(403).json({
              success: false,
              status: 'COUNTRY_DISABLED',
              error: `AI is disabled for country ${country}.`
            });
          }

          const flagKey = ENGINE_COUNTRY_FLAG[engine];
          if (flagKey && cntrData[flagKey] === false) {
            return res.status(403).json({
              success: false,
              status: 'COUNTRY_DISABLED',
              error: `AI engine ${engine} is disabled for country ${country}.`
            });
          }
        }
      }

      // Engine check
      const { data: fetchedEngData } = await safeDbQuery(
        client
          .from('ai_engine_config')
          .select('*')
          .eq('engine_key', engine)
          .maybeSingle()
      );

      engData = fetchedEngData;

      if (engData) {
        if (!engData.enabled) {
          return res.status(403).json({
            success: false,
            status: 'ENGINE_DISABLED',
            error: `AI Engine ${engine} is disabled.`
          });
        }
        if (!isManualOverride && !isSourcingResearch && engData.model && engData.model !== 'NOT CONFIGURED') {
          selectedModel = engData.model;
        }
        if (engData.timeout_ms) {
          engineTimeoutMs = engData.timeout_ms;
        }
      }

      // Budget check (Daily and Monthly)
      const now = new Date();
      const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

      const hasSysDaily = Number(sysData?.daily_budget_usd || 0) > 0;
      const hasSysMonthly = Number(sysData?.monthly_budget_usd || 0) > 0;
      const hasEngDaily = Number(engData?.daily_budget_usd || 0) > 0;
      const hasEngMonthly = Number(engData?.monthly_budget_usd || 0) > 0;
      const hasCntrDaily = Number(cntrData?.daily_budget_usd || 0) > 0;
      const hasCntrMonthly = Number(cntrData?.monthly_budget_usd || 0) > 0;

      if (hasSysDaily || hasSysMonthly || hasEngDaily || hasEngMonthly || hasCntrDaily || hasCntrMonthly) {
        const { data: usageRows } = await safeDbQuery(
          client
            .from('ai_usage_events')
            .select('estimated_cost_usd, engine, country_code, created_at')
            .gte('created_at', startOfMonth)
        );

        if (usageRows && usageRows.length > 0) {
          let totalMonth = 0;
          let totalToday = 0;
          let engMonth = 0;
          let engToday = 0;
          let cntrMonth = 0;
          let cntrToday = 0;

          for (const row of usageRows) {
            const cost = Number(row.estimated_cost_usd) || 0;
            const isToday = row.created_at >= startOfDay;

            totalMonth += cost;
            if (isToday) totalToday += cost;

            if (row.engine === engine) {
              engMonth += cost;
              if (isToday) engToday += cost;
            }

            if (row.country_code === country) {
              cntrMonth += cost;
              if (isToday) cntrToday += cost;
            }
          }

          if (hasSysDaily && totalToday >= sysData.daily_budget_usd) {
            return res.status(429).json({
              success: false,
              status: 'BUDGET_EXCEEDED',
              error: `Presupuesto diario global de IA excedido (Gastado: $${totalToday.toFixed(4)} / Límite: $${Number(sysData.daily_budget_usd).toFixed(4)})`
            });
          }
          if (hasSysMonthly && totalMonth >= sysData.monthly_budget_usd) {
            return res.status(429).json({
              success: false,
              status: 'BUDGET_EXCEEDED',
              error: `Presupuesto mensual global de IA excedido (Gastado: $${totalMonth.toFixed(4)} / Límite: $${Number(sysData.monthly_budget_usd).toFixed(4)})`
            });
          }
          if (hasEngDaily && engToday >= engData.daily_budget_usd) {
            return res.status(429).json({
              success: false,
              status: 'BUDGET_EXCEEDED',
              error: `Presupuesto diario del motor ${engine} excedido (Gastado: $${engToday.toFixed(4)} / Límite: $${Number(engData.daily_budget_usd).toFixed(4)})`
            });
          }
          if (hasEngMonthly && engMonth >= engData.monthly_budget_usd) {
            return res.status(429).json({
              success: false,
              status: 'BUDGET_EXCEEDED',
              error: `Presupuesto mensual del motor ${engine} excedido (Gastado: $${engMonth.toFixed(4)} / Límite: $${Number(engData.monthly_budget_usd).toFixed(4)})`
            });
          }
          if (hasCntrDaily && cntrToday >= cntrData.daily_budget_usd) {
            return res.status(429).json({
              success: false,
              status: 'BUDGET_EXCEEDED',
              error: `Presupuesto diario del país ${country} excedido (Gastado: $${cntrToday.toFixed(4)} / Límite: $${Number(cntrData.daily_budget_usd).toFixed(4)})`
            });
          }
          if (hasCntrMonthly && cntrMonth >= cntrData.monthly_budget_usd) {
            return res.status(429).json({
              success: false,
              status: 'BUDGET_EXCEEDED',
              error: `Presupuesto mensual del país ${country} excedido (Gastado: $${cntrMonth.toFixed(4)} / Límite: $${Number(cntrData.monthly_budget_usd).toFixed(4)})`
            });
          }
        }
      }
    }

    const isStructuredAdvisoryEngine = !isSourcingResearch && ['PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION','COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE'].includes(engine);
    const evidenceObj = payload?.evidence || {};
    const evidenceFingerprint = generateEvidenceFingerprint(evidenceObj);

    // 2. Sourcing Research Multi-tier Cache Lookup (Global-First Cache)
    const researchCacheKey = isSourcingResearch 
      ? generateResearchCacheKey(cleanSearchQuery || resolvedInput, 'GLOBAL', modeConfig.key, isManualOverride ? selectedModel : 'AUTO', effectiveTimeScope, effectiveProductFamily, effectiveResultLimit) 
      : null;

    // Tools & Responses API configuration
    const tools = isWebSearchNeeded ? [{ type: 'web_search' }] : undefined;
    const toolChoice = isWebSearchNeeded ? (modeConfig.key === 'PROFUNDO' ? 'required' : 'auto') : undefined;

    let result = null;
    let structuredData = null;
    let parsedContainerType = 'NONE';
    let rawCandidateCount = 0;
    let intelligenceRunStatus = 'SUCCESS';
    let finalRequestId = requestId;
    let allSources = [];
    let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let totalPricing = {
      model: selectedModel,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      input_cost_usd: 0,
      output_cost_usd: 0,
      estimated_cost_usd: 0,
      pricing_status: 'PRICED',
      pricing_source: 'CENTRAL_REGISTRY'
    };
    let batchExecutionTelemetry = {
      result_limit: effectiveResultLimit,
      batches_planned: 1,
      batches_executed: 0,
      stop_reason: 'COMPLETED'
    };

    // [RESEARCH_SERVER_TRACE] — Cache key and request params
    if (isSourcingResearch) {
      const discoveryPlan = planDiscoveryBatches(effectiveResultLimit, modeConfig);
      const targetCount = discoveryPlan.targetCount;
      const minTarget = discoveryPlan.minimumUsefulTarget;
      let accumulatedDiscoveries = [];
      let lastSummary = 'Investigación comercial completada.';
      let lastConfidence = 0.85;
      let accumulatedSubtrends = new Set();
      let discoveryStopReason = 'COMPLETED';
      let discoveryBatchesExecuted = 0;

      console.info(`[RESEARCH_TRACE] PHASE_1_DISCOVERY_STARTED`, {
        request_id: requestId,
        query: cleanSearchQuery || resolvedInput,
        target_country: country || 'GLOBAL',
        product_family: effectiveProductFamily,
        time_scope: effectiveTimeScope,
        research_depth: modeConfig.key,
        result_limit: effectiveResultLimit,
        target_count: targetCount,
        min_target: minTarget,
        max_batches: discoveryPlan.maxBatches
      });

      // PHASE 1: DISCOVERY BATCHES
      for (let bIdx = 0; bIdx < discoveryPlan.batches.length; bIdx++) {
        const batch = discoveryPlan.batches[bIdx];
        const excludeTitles = accumulatedDiscoveries.map(c => c.title).filter(Boolean);

        // If batch 2 and batch 1 already got >= minTarget (e.g. >= 8 for AUTO), don't run batch 2
        if (bIdx > 0 && accumulatedDiscoveries.length >= minTarget) {
          discoveryStopReason = 'MINIMUM_TARGET_SATISFIED';
          break;
        }

        const batchInstructions = buildDiscoveryPrompt(
          cleanSearchQuery || resolvedInput,
          country,
          modeConfig,
          effectiveTimeScope,
          effectiveProductFamily,
          effectiveResultLimit,
          {
            batchIndex: bIdx + 1,
            targetCount: batch.targetCount,
            excludeTitles
          }
        );

        console.info(`[RESEARCH_TRACE] DISCOVERY_BATCH_REQUEST_STARTED`, {
          request_id: requestId,
          batch_index: bIdx + 1,
          target_count: batch.targetCount,
          exclude_count: excludeTitles.length
        });

        let batchResult;
        try {
          batchResult = await callOpenAIResponses({
            model: selectedModel,
            input: cleanSearchQuery || resolvedInput,
            instructions: batchInstructions,
            temperature: 0.2,
            maxTokens: batch.maxOutputTokens || dynamicMaxTokens,
            timeoutMs: isWebSearchNeeded ? Math.max(engineTimeoutMs, 50000) : engineTimeoutMs,
            tools,
            toolChoice,
            metadata: {
              engine: String(engine || ''),
              country: String(country || 'GLOBAL'),
              operation: String(operation || 'execute'),
              research_depth: modeConfig.key,
              research_phase: 'DISCOVERY',
              batch_index: String(bIdx + 1),
              result_limit: String(effectiveResultLimit)
            }
          });
        } catch (openaiErr) {
          console.error('[RESEARCH_ERROR] DISCOVERY_OPENAI_CALL_FAILED', {
            batch_index: bIdx + 1,
            error: openaiErr.message
          });
          throw openaiErr;
        }

        discoveryBatchesExecuted++;
        finalRequestId = batchResult.requestId || finalRequestId;
        result = batchResult;

        // Accumulate tokens and pricing
        totalUsage.inputTokens += (batchResult.usage?.inputTokens || 0);
        totalUsage.outputTokens += (batchResult.usage?.outputTokens || 0);
        totalUsage.totalTokens += (batchResult.usage?.totalTokens || 0);

        totalPricing.input_cost_usd = Number((totalPricing.input_cost_usd + (batchResult.pricing?.input_cost_usd || 0)).toFixed(6));
        totalPricing.output_cost_usd = Number((totalPricing.output_cost_usd + (batchResult.pricing?.output_cost_usd || 0)).toFixed(6));
        totalPricing.estimated_cost_usd = Number((totalPricing.estimated_cost_usd + (batchResult.pricing?.estimated_cost_usd || 0)).toFixed(6));

        if (Array.isArray(batchResult.sources)) {
          allSources.push(...batchResult.sources);
        }

        let parsedBatch = { items: [], summary: null, confidence: 0.85, subtrends: [] };
        try {
          parsedBatch = parseSourcingItems(batchResult.outputText);
        } catch (parseErr) {
          console.warn('[RESEARCH_WARN] DISCOVERY_PARSE_ERROR', parseErr.message);
        }

        if (parsedBatch.summary) lastSummary = parsedBatch.summary;
        if (parsedBatch.confidence) lastConfidence = parsedBatch.confidence;
        (parsedBatch.subtrends || []).forEach(st => accumulatedSubtrends.add(st));

        rawCandidateCount += (parsedBatch.items?.length || 0);
        const prevCount = accumulatedDiscoveries.length;
        accumulatedDiscoveries = deduplicateResearchCandidates(accumulatedDiscoveries, parsedBatch.items || []);
        const newUniquesInBatch = accumulatedDiscoveries.length - prevCount;

        console.info('[RESEARCH_SERVER_TRACE] DISCOVERY_BATCH_BREAKDOWN', {
          request_id: finalRequestId,
          batch_number: bIdx + 1,
          batch_target: batch.targetCount,
          raw_items_detected: (parsedBatch.items || []).length,
          before_dedupe: prevCount,
          after_dedupe: accumulatedDiscoveries.length,
          new_uniques_in_batch: newUniquesInBatch,
          accumulated_total: accumulatedDiscoveries.length,
          batch_cost_usd: batchResult.pricing?.estimated_cost_usd
        });

        // If target limit reached, stop discovery
        if (accumulatedDiscoveries.length >= targetCount) {
          discoveryStopReason = 'LIMIT_REACHED';
          accumulatedDiscoveries = accumulatedDiscoveries.slice(0, targetCount);
          break;
        }

        // If no new candidates found in batch 2
        if (bIdx > 0 && newUniquesInBatch === 0) {
          discoveryStopReason = 'SATURATION_NO_NEW_CANDIDATES';
          break;
        }

        // Budget safety
        if (totalPricing.estimated_cost_usd >= 0.08) {
          discoveryStopReason = 'BUDGET_CAP_REACHED';
          break;
        }
      }

      // Assign candidate_ids to accumulated discoveries
      accumulatedDiscoveries = accumulatedDiscoveries.map((c, i) => ({
        ...c,
        candidate_id: c.candidate_id || `c_${i + 1}`
      }));

      // PHASE 2: COMMERCIAL ENRICHMENT BATCHES (Grouped by <= 15 items)
      let enrichmentBatchesExecuted = 0;
      let allEnrichmentItems = [];

      if (accumulatedDiscoveries.length > 0 && isWebSearchNeeded) {
        const enrichmentPlan = planEnrichmentBatches(accumulatedDiscoveries.length, modeConfig);

        console.info(`[RESEARCH_TRACE] PHASE_2_COMMERCIAL_ENRICHMENT_STARTED`, {
          request_id: finalRequestId,
          candidates_to_enrich: accumulatedDiscoveries.length,
          enrichment_batches_planned: enrichmentPlan.batchCount
        });

        for (let eIdx = 0; eIdx < enrichmentPlan.batches.length; eIdx++) {
          const eBatch = enrichmentPlan.batches[eIdx];
          const chunk = accumulatedDiscoveries.slice(eBatch.startIndex, eBatch.endIndex);

          const enrichmentPrompt = buildCommercialEnrichmentPrompt(chunk, country, modeConfig);

          console.info(`[RESEARCH_TRACE] ENRICHMENT_BATCH_REQUEST_STARTED`, {
            request_id: finalRequestId,
            enrichment_batch_index: eIdx + 1,
            total_enrichment_batches: enrichmentPlan.batchCount,
            candidates_in_chunk: chunk.length
          });

          let enrichResult;
          try {
            enrichResult = await callOpenAIResponses({
              model: selectedModel,
              input: `Verificar fichas comerciales para lote ${eIdx + 1}`,
              instructions: enrichmentPrompt,
              temperature: 0.2,
              maxTokens: eBatch.maxOutputTokens || 2000,
              timeoutMs: Math.max(engineTimeoutMs, 50000),
              tools,
              toolChoice,
              metadata: {
                engine: String(engine || ''),
                country: String(country || 'GLOBAL'),
                operation: String(operation || 'execute'),
                research_depth: modeConfig.key,
                research_phase: 'COMMERCIAL_ENRICHMENT',
                enrichment_batch: String(eIdx + 1),
                total_enrichment_batches: String(enrichmentPlan.batchCount)
              }
            });
          } catch (enrichOpenAiErr) {
            console.warn('[RESEARCH_WARN] ENRICHMENT_OPENAI_CALL_FAILED', {
              enrichment_batch: eIdx + 1,
              error: enrichOpenAiErr.message
            });
            // Commercial enrichment failure is non-blocking: discovery candidates are preserved
            break;
          }

          enrichmentBatchesExecuted++;
          finalRequestId = enrichResult.requestId || finalRequestId;

          totalUsage.inputTokens += (enrichResult.usage?.inputTokens || 0);
          totalUsage.outputTokens += (enrichResult.usage?.outputTokens || 0);
          totalUsage.totalTokens += (enrichResult.usage?.totalTokens || 0);

          totalPricing.input_cost_usd = Number((totalPricing.input_cost_usd + (enrichResult.pricing?.input_cost_usd || 0)).toFixed(6));
          totalPricing.output_cost_usd = Number((totalPricing.output_cost_usd + (enrichResult.pricing?.output_cost_usd || 0)).toFixed(6));
          totalPricing.estimated_cost_usd = Number((totalPricing.estimated_cost_usd + (enrichResult.pricing?.estimated_cost_usd || 0)).toFixed(6));

          if (Array.isArray(enrichResult.sources)) {
            allSources.push(...enrichResult.sources);
          }

          let parsedEnrichment = [];
          try {
            parsedEnrichment = parseCommercialEnrichmentItems(enrichResult.outputText);
          } catch (parseEnrichErr) {
            console.warn('[RESEARCH_WARN] ENRICHMENT_PARSE_ERROR', parseEnrichErr.message);
          }
          allEnrichmentItems.push(...parsedEnrichment);

          console.info('[RESEARCH_SERVER_TRACE] ENRICHMENT_BATCH_RECEIVED', {
            request_id: finalRequestId,
            enrichment_batch: eIdx + 1,
            parsed_enrichment_count: parsedEnrichment.length,
            commercial_sources_found: parsedEnrichment.reduce((acc, p) => acc + (p.commercial_sources?.length || 0), 0),
            batch_cost_usd: enrichResult.pricing?.estimated_cost_usd
          });

          if (totalPricing.estimated_cost_usd >= 0.09) {
            break;
          }
        }

        // Merge commercial enrichment items into discoveries
        try {
          accumulatedDiscoveries = mergeCommercialEnrichment(accumulatedDiscoveries, allEnrichmentItems);
          if (accumulatedDiscoveries.telemetry) {
            console.info('[RESEARCH_SERVER_TRACE] ENRICHMENT_MERGE_COMPLETED', {
              request_id: finalRequestId,
              ...accumulatedDiscoveries.telemetry
            });
          }
        } catch (mergeErr) {
          console.warn('[RESEARCH_WARN] ENRICHMENT_MERGE_ERROR', mergeErr.message);
        }
      }

      batchExecutionTelemetry = {
        result_limit: effectiveResultLimit,
        target_count: targetCount,
        discovery_batches_planned: discoveryPlan.maxBatches,
        discovery_batches_executed: discoveryBatchesExecuted,
        discovery_stop_reason: discoveryStopReason,
        enrichment_batches_executed: enrichmentBatchesExecuted,
        total_batches_executed: discoveryBatchesExecuted + enrichmentBatchesExecuted,
        stop_reason: discoveryStopReason
      };

      parsedContainerType = 'items';
      structuredData = {
        summary: lastSummary,
        confidence: lastConfidence,
        subtrends: Array.from(accumulatedSubtrends),
        items: accumulatedDiscoveries
      };
    } else {
      // Non-sourcing single-call advisory engines
      const resolvedInstructions = instructionsFor(engine, operation);

      console.info(`[RESEARCH_TRACE] OPENAI_REQUEST_STARTED`, {
        request_id: requestId,
        query: cleanSearchQuery || resolvedInput,
        target_country: country || 'GLOBAL',
        engine,
        requested_model: effectiveRequestedModel,
        actual_model: selectedModel,
        dynamic_max_tokens: dynamicMaxTokens
      });

      result = await callOpenAIResponses({
        model: selectedModel,
        input: resolvedInput,
        instructions: resolvedInstructions,
        temperature: 0.2,
        maxTokens: req.body?.maxTokens || 1500,
        timeoutMs: engineTimeoutMs,
        tools,
        toolChoice,
        metadata: {
          engine: String(engine || ''),
          country: String(country || 'GLOBAL'),
          operation: String(operation || 'execute')
        }
      });

      finalRequestId = result.requestId || requestId;
      totalUsage = result.usage;
      totalPricing = result.pricing;
      if (Array.isArray(result.sources)) {
        allSources = result.sources;
      }

      const clean = String(result.outputText || '').trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();
      try {
        structuredData = JSON.parse(clean);
      } catch {
        const match = String(result.outputText || '').match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match && match[1]) {
          try {
            structuredData = JSON.parse(match[1].trim());
          } catch {}
        }
      }

      if (!structuredData && isStructuredAdvisoryEngine) {
        throw new OpenAIError('INVALID_OUTPUT', 502, 'OpenAI returned invalid structured intelligence output.');
      }
    }

    const elapsedMs = Date.now() - startTime;

    console.info(`[RESEARCH_TRACE] EXECUTION_COMPLETED`, {
      request_id: finalRequestId,
      actual_model: selectedModel,
      raw_candidate_count: rawCandidateCount,
      unique_candidate_count: Array.isArray(structuredData?.items) ? structuredData.items.length : 0,
      batches_planned: batchExecutionTelemetry.batches_planned,
      batches_executed: batchExecutionTelemetry.batches_executed,
      stop_reason: batchExecutionTelemetry.stop_reason,
      total_tokens: totalUsage.totalTokens,
      estimated_cost_usd: totalPricing.estimated_cost_usd,
      latency_ms: elapsedMs
    });

    if (isStructuredAdvisoryEngine && structuredData) {

      // Evidence ID Strict Validation: returnedEvidenceIds ⊆ allowedEvidenceIds
      const allowedEvidenceIds = extractAllowedEvidenceIds(evidenceObj);
      const returnedEvidenceIds = Array.isArray(structuredData.evidenceIds) ? structuredData.evidenceIds : [];

      let invalidEvidenceDetected = false;
      if (returnedEvidenceIds.length > 0 && allowedEvidenceIds.size > 0) {
        for (const returnedId of returnedEvidenceIds) {
          if (!allowedEvidenceIds.has(String(returnedId))) {
            invalidEvidenceDetected = true;
            break;
          }
        }
      }

      if (invalidEvidenceDetected) {
        // Neutralize AI adjustment; deterministic Collectibles score remains authoritative.
        structuredData.scoreAdjustment = 0;
        structuredData.action = 'REVIEW';
        structuredData.risks = [
          ...(structuredData.risks || []),
          'Alerta de Integridad: OpenAI retornó identificadores de evidencia no sustentados en los datos suministrados.'
        ];
        intelligenceRunStatus = 'INVALID_AI_EVIDENCE';
      }
    }

    const classifiedSources = (allSources || []).map(s => ({
      ...s,
      source_type: classifyDomain(s.url),
      observed_at: new Date().toISOString()
    }));

    // 4. Log Success Telemetry to ai_usage_events
    if (client) {
      try {
        const usagePayload = {
          engine,
          country_code: country || 'GLOBAL',
          provider: 'OPENAI',
          model: selectedModel,
          request_id: finalRequestId,
          input_tokens: totalUsage.inputTokens,
          output_tokens: totalUsage.outputTokens,
          total_tokens: totalUsage.totalTokens,
          estimated_cost_usd: totalPricing.estimated_cost_usd,
          latency_ms: elapsedMs,
          status: 'SUCCESS',
          fallback_used: false,
          metadata: {
            operation,
            requested_model: effectiveRequestedModel,
            automatic_or_manual: automaticOrManual,
            research_depth: modeConfig.key,
            response_id: result?.responseId,
            pricing_status: totalPricing.pricing_status,
            pricing_source: totalPricing.pricing_source,
            input_cost_usd: totalPricing.input_cost_usd,
            output_cost_usd: totalPricing.output_cost_usd,
            batch_telemetry: batchExecutionTelemetry,
            context
          }
        };
        const { error: usageInsertError } = await client.from('ai_usage_events').insert(usagePayload);
        if (usageInsertError) {
          const { error: usageRpcError } = await client.rpc('log_ai_usage_event', {
            p_engine: usagePayload.engine,
            p_country_code: usagePayload.country_code,
            p_provider: usagePayload.provider,
            p_model: usagePayload.model,
            p_request_id: usagePayload.request_id,
            p_input_tokens: usagePayload.input_tokens,
            p_output_tokens: usagePayload.output_tokens,
            p_total_tokens: usagePayload.total_tokens,
            p_estimated_cost_usd: usagePayload.estimated_cost_usd,
            p_latency_ms: usagePayload.latency_ms,
            p_status: usagePayload.status,
            p_fallback_used: usagePayload.fallback_used,
            p_metadata: usagePayload.metadata
          });
          if (usageRpcError) throw usageRpcError;
        }
      } catch (logErr) {
        console.warn('[AI Execute] Telemetry logging error:', logErr.message);
      }
    }

    // Persist research run in ai_intelligence_runs and sourcing_research_cache
    if (structuredData && client) {
      try {
        const evidenceCount = Object.values(evidenceObj).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
        const scoreAdjustment = Math.max(-10, Math.min(10, Number(structuredData.scoreAdjustment || 0)));
        const intelligencePayload = {
          engine,
          country_code: country || 'GLOBAL',
          objective: payload?.objective || (isSourcingResearch ? resolvedInput : null),
          evidence_fingerprint: isSourcingResearch ? researchCacheKey : evidenceFingerprint,
          evidence_count: isSourcingResearch ? (Array.isArray(structuredData.items) ? structuredData.items.length : 0) : evidenceCount,
          summary: structuredData.summary || null,
          confidence: Number(structuredData.confidence || 0.85),
          score_adjustment: scoreAdjustment,
          advisory_action: ['REVIEW','WATCH','IGNORE'].includes(structuredData.action) ? structuredData.action : 'WATCH',
          signals: Array.isArray(structuredData.signals) ? structuredData.signals : (Array.isArray(structuredData.subtrends) ? structuredData.subtrends : []),
          risks: Array.isArray(structuredData.risks) ? structuredData.risks : [],
          recommendations: Array.isArray(structuredData.recommendations) ? structuredData.recommendations : [],
          evidence_ids: Array.isArray(structuredData.evidenceIds) ? structuredData.evidenceIds : [],
          request_id: finalRequestId,
          model: selectedModel,
          status: intelligenceRunStatus,
          metadata: { 
            operation, 
            decision_mode: isSourcingResearch ? 'SOURCING_RESEARCH' : 'ADVISORY_ONLY',
            invalid_evidence_neutralized: intelligenceRunStatus === 'INVALID_AI_EVIDENCE',
            research_depth: modeConfig.key,
            batch_telemetry: batchExecutionTelemetry,
            items: Array.isArray(structuredData.items) ? structuredData.items : [],
            sources: classifiedSources
          }
        };

        const { error: runInsertError } = await client.from('ai_intelligence_runs').insert(intelligencePayload);
        if (runInsertError) {
          const { error: runRpcError } = await client.rpc('log_ai_intelligence_run', {
            p_payload: intelligencePayload
          });
          if (runRpcError) throw runRpcError;
        }
      } catch (logErr) {
        console.warn('[AI Execute] Intelligence run logging error:', logErr.message);
      }
    }

    // Persist Sourcing Research Cache for future instant reuse across countries
    if (isSourcingResearch && researchCacheKey && client && totalUsage?.totalTokens > 0) {
      try {
        const ttlDays = modeConfig.key === 'PROFUNDO' ? 7 : 3;
        const expiresAt = new Date(Date.now() + (ttlDays * 24 * 3600 * 1000)).toISOString();
        const rawItems = Array.isArray(structuredData?.items) ? structuredData.items : [];
        
        await client.from('sourcing_research_cache').upsert({
          cache_key: researchCacheKey,
          query: resolvedInput,
          normalized_query: normalizeQuery(resolvedInput),
          scope: 'GLOBAL',
          research_depth: modeConfig.key,
          model: selectedModel,
          summary: structuredData?.summary || null,
          confidence: Number(structuredData?.confidence || 0.85),
          subtrends: Array.isArray(structuredData?.subtrends) ? structuredData.subtrends : [],
          items: rawItems,
          sources: classifiedSources,
          input_tokens: totalUsage.inputTokens,
          output_tokens: totalUsage.outputTokens,
          cost_usd: totalPricing.estimated_cost_usd,
          expires_at: expiresAt
        }, { onConflict: 'cache_key' });
      } catch (cacheWriteErr) {
        console.warn('[AI Execute] Sourcing research cache write non-blocking error:', cacheWriteErr.message);
      }
    }

    // 6. Return sanitized safe result
    return res.status(200).json({
      success: true,
      status: intelligenceRunStatus,
      provider: 'OPENAI',
      model: selectedModel,
      requested_model: effectiveRequestedModel,
      actual_model: selectedModel,
      automatic_or_manual: automaticOrManual,
      research_depth: modeConfig.key,
      text: result?.outputText || JSON.stringify(structuredData),
      data: structuredData,
      sources: classifiedSources,
      response_id: result?.responseId || null,
      request_id: finalRequestId,
      latency_ms: elapsedMs,
      usage: totalUsage,
      pricing: totalPricing,
      batch_telemetry: batchExecutionTelemetry
    });


  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    let errorType = 'INTERNAL_SERVER_ERROR';
    let statusCode = 500;
    if (err instanceof OpenAIError) {
      errorType = err.errorType;
      statusCode = err.statusCode;
    } else if (err instanceof ReferenceError || err instanceof TypeError) {
      errorType = 'RESEARCH_INTERNAL_ERROR';
      statusCode = 500;
    }
    const safeMessage = err.message || 'An unexpected AI execution error occurred.';

    // Log Error Telemetry to ai_error_events
    if (client) {
      try {
        const errorPayload = {
          engine,
          country_code: country || 'GLOBAL',
          provider: 'OPENAI',
          model: selectedModel,
          error_type: errorType,
          error_code: err.details?.code ? String(err.details.code) : String(statusCode),
          safe_message: safeMessage.slice(0, 500),
          latency_ms: elapsedMs,
          request_id: requestId,
          metadata: {
            operation,
            context,
            details: err.details || {}
          }
        };
        const { error: errorInsertError } = await client.from('ai_error_events').insert(errorPayload);
        if (errorInsertError) {
          const { error: errorRpcError } = await client.rpc('log_ai_error_event', {
            p_engine: errorPayload.engine,
            p_country_code: errorPayload.country_code,
            p_provider: errorPayload.provider,
            p_model: errorPayload.model,
            p_error_type: errorPayload.error_type,
            p_error_code: errorPayload.error_code,
            p_safe_message: errorPayload.safe_message,
            p_latency_ms: errorPayload.latency_ms,
            p_request_id: errorPayload.request_id,
            p_metadata: errorPayload.metadata
          });
          if (errorRpcError) throw errorRpcError;
        }
      } catch (logErr) {
        console.warn('[AI Execute] Error telemetry logging failed:', logErr.message);
      }
    }

    return res.status(statusCode).json({
      success: false,
      status: errorType,
      error: safeMessage,
      request_id: requestId,
      latency_ms: elapsedMs
    });
  }
}

// Decorate every successful research response, including both cache paths.
// Existing model routing, batching, budget checks and authentication run first.
export default async function handler(req, res) {
  const sendJson = res.json.bind(res);
  res.json = async payload => {
    const engine = req.body?.engine;
    const operation = req.body?.operation;
    const research = ['RESEARCH_INTELLIGENCE', 'SOURCING_WEB_RESEARCH'].includes(engine) || /^(sourcing_research|web_research|sourcing_market_research)$/i.test(operation || '');
    if (research && payload.success && payload.data && typeof payload.data === 'object') {
      const raw = payload.data;
      let items = Array.isArray(raw) ? raw : [raw.items, raw.products, raw.candidates, raw.results, raw.discoveries].find(Array.isArray) || [];
      const target = req.body?.country || 'UY';
      const allSources = payload.sources || [];

      // Deterministically correlate global Web Search citations to candidate items
      if (allSources.length && items.length) {
        items = associateSourcesToCandidates(items, allSources);
      }

      let signalRows = [], marketRows = [];
      if (SUPABASE_KEY && items.length) {
        const verifierDb = createClient(SUPABASE_URL, SUPABASE_KEY);
        const titles = items.map(i => i.title || i.name).filter(Boolean);
        const [signalResult, marketResult] = await Promise.all([
          verifierDb.from('sourcing_signals').select('*').in('product_identity', titles).limit(100),
          target === 'UY' ? verifierDb.from('ml_raw_items').select('title,price,currency_id,permalink').in('title', titles).limit(100) : Promise.resolve({ data: [] })
        ]);
        signalRows = signalResult.data || []; marketRows = marketResult.data || [];
      }
      const canonical = await validateCandidateBatch(items, { country: target, origin: 'MANUAL_RESEARCH', signalRows, marketRows, deadline: Date.now() + 12000 });
      payload.data = { ...(Array.isArray(raw) ? { items: raw } : raw), items, canonical_candidates: canonical };
      console.info('[CANONICAL_VALIDATION_TRACE]', { entry: 'MANUAL_RESEARCH', input: items.length, output: canonical.length, observed: canonical.map(c => Object.values(c.provenance).filter(p => ['OBSERVED', 'CORROBORATED'].includes(p.status)).length) });
    }
    return sendJson(payload);
  };
  return executeHandler(req, res);
}
