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
  buildOptimizedResearchPrompt,
  calculatePreFlightEstimate 
} from '../server/lib/researchCostOptimizer.js';
import { validateRequestedModel } from '../server/lib/openaiPricing.js';
import { authenticateRequest, acquireInFlightLock } from '../server/lib/authGuard.js';

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
    return common + ' Realiza investigación comercial de coleccionables mediante búsqueda web real. Identifica productos oficiales reales, novedades y preorders confirmados. NUNCA inventes precios, landed costs ni stock comercial. Devuelve ÚNICAMENTE un JSON válido con la siguiente estructura: {"summary": string, "confidence": number_0_to_1, "subtrends": string[], "items": [{"title": string, "brand": string, "franchise": string, "category": string, "origin_price_usd": number_or_null, "asin": string_or_null, "url": string_or_null, "retailer": string, "is_preorder": boolean, "is_new": boolean, "release_date": string_or_null, "evidence_snippet": string}]}.';
  }
  if (['PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION','COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE'].includes(engine)) {
    return common + ' You are advisory only: never publish, buy, change prices, or trigger automation. Reason only from evidence in payload.evidence. Missing evidence must reduce confidence, never be guessed. scoreAdjustment is only a bounded advisory adjustment from -10 to 10; deterministic Collectibles scoring remains authoritative. Return ONLY valid JSON: {"summary":string,"confidence":number_0_to_1,"signals":string[],"risks":string[],"recommendations":string[],"evidenceIds":string[],"scoreAdjustment":number_minus10_to_10,"action":"REVIEW"|"WATCH"|"IGNORE"}.';
  }
  return common + ` Operation: ${operation}. Return concise useful output grounded only in supplied data.`;
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

export default async function handler(req, res) {
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
    prompt,
    payload,
    context = {}
  } = req.body || {};

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
      if (country && country !== 'GLOBAL') {
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
      ? generateResearchCacheKey(cleanSearchQuery || resolvedInput, 'GLOBAL', modeConfig.key, isManualOverride ? selectedModel : 'AUTO', effectiveTimeScope, effectiveProductFamily) 
      : null;

    if (isSourcingResearch && client && context?.force_refresh !== true && context?.certification !== true) {
      try {
        const { data: cachedResearch } = await safeDbQuery(
          client
            .from('sourcing_research_cache')
            .select('*')
            .eq('cache_key', researchCacheKey)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        );

        if (cachedResearch) {
          const cachedData = {
            summary: cachedResearch.summary,
            confidence: Number(cachedResearch.confidence || 0.85),
            subtrends: cachedResearch.subtrends || [],
            items: cachedResearch.items || []
          };
          const cachedElapsed = 1;
          return res.status(200).json({
            success: true,
            status: 'SUCCESS',
            provider: 'OPENAI',
            model: cachedResearch.model || modeConfig.model,
            cached: true,
            text: JSON.stringify(cachedData),
            data: cachedData,
            sources: cachedResearch.sources || [],
            request_id: `cached_${cachedResearch.cache_key?.slice(0, 12) || Date.now()}`,
            latency_ms: cachedElapsed,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            pricing: {
              model: cachedResearch.model || modeConfig.model,
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
              input_cost_usd: 0,
              output_cost_usd: 0,
              estimated_cost_usd: 0,
              pricing_status: 'PRICED',
              pricing_source: 'SOURCING_RESEARCH_CACHE'
            }
          });
        }

        // Secondary cache lookup in ai_intelligence_runs
        const { data: cachedRun } = await client
          .from('ai_intelligence_runs')
          .select('*')
          .eq('evidence_fingerprint', researchCacheKey)
          .eq('status', 'SUCCESS')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cachedRun && cachedRun.metadata) {
          const cachedData = {
            summary: cachedRun.summary,
            confidence: Number(cachedRun.confidence || 0.85),
            subtrends: cachedRun.signals || [],
            items: cachedRun.metadata.items || []
          };
          return res.status(200).json({
            success: true,
            status: 'SUCCESS',
            provider: 'OPENAI',
            model: cachedRun.model || modeConfig.model,
            cached: true,
            text: JSON.stringify(cachedData),
            data: cachedData,
            sources: cachedRun.metadata.sources || [],
            request_id: `cached_${cachedRun.request_id || Date.now()}`,
            latency_ms: 1,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            pricing: {
              model: cachedRun.model || modeConfig.model,
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
              input_cost_usd: 0,
              output_cost_usd: 0,
              estimated_cost_usd: 0,
              pricing_status: 'PRICED',
              pricing_source: 'INTELLIGENCE_RUNS_CACHE'
            }
          });
        }
      } catch (cacheErr) {
        console.warn('[AI Execute] Sourcing research cache lookup skipped:', cacheErr.message);
      }
    }

    // 2b. Fingerprint Cache Lookup for Advisory Analysis
    if (isStructuredAdvisoryEngine && client && context?.force_refresh !== true && context?.certification !== true) {
      try {
        const cacheTtlHours = 2;
        const cacheCutoff = new Date(Date.now() - (cacheTtlHours * 3600 * 1000)).toISOString();
        const { data: cachedRun } = await client
          .from('ai_intelligence_runs')
          .select('*')
          .eq('evidence_fingerprint', evidenceFingerprint)
          .eq('engine', engine)
          .eq('status', 'SUCCESS')
          .gte('created_at', cacheCutoff)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cachedRun) {
          return res.status(200).json({
            success: true,
            status: 'SUCCESS',
            provider: 'OPENAI',
            model: cachedRun.model,
            cached: true,
            data: {
              summary: cachedRun.summary,
              confidence: cachedRun.confidence,
              scoreAdjustment: cachedRun.score_adjustment,
              action: cachedRun.advisory_action,
              signals: cachedRun.signals,
              risks: cachedRun.risks,
              recommendations: cachedRun.recommendations,
              evidenceIds: cachedRun.evidence_ids
            },
            request_id: cachedRun.request_id,
            latency_ms: 1,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            pricing: {
              model: cachedRun.model,
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
              input_cost_usd: 0,
              output_cost_usd: 0,
              estimated_cost_usd: 0,
              pricing_status: 'PRICED',
              pricing_source: 'EVIDENCE_FINGERPRINT_CACHE'
            }
          });
        }
      } catch (cacheErr) {
        console.warn('[AI Execute] Fingerprint cache lookup skipped:', cacheErr.message);
      }
    }

    const resolvedInstructions = isSourcingResearch 
      ? buildOptimizedResearchPrompt(cleanSearchQuery || resolvedInput, country, modeConfig, effectiveTimeScope, effectiveProductFamily)
      : instructionsFor(engine, operation);

    const tools = isWebSearchNeeded ? [{ type: 'web_search' }] : undefined;
    const toolChoice = isWebSearchNeeded ? (modeConfig.key === 'PROFUNDO' ? 'required' : 'auto') : undefined;

    // 3. Call OpenAI Responses API server-side with mode-specific token & cost constraints
    const result = await callOpenAIResponses({
      model: selectedModel,
      input: isSourcingResearch ? (cleanSearchQuery || resolvedInput) : resolvedInput,
      instructions: resolvedInstructions,
      temperature: 0.2,
      maxTokens: isSourcingResearch ? dynamicMaxTokens : (req.body?.maxTokens || 1500),
      timeoutMs: isWebSearchNeeded ? Math.max(engineTimeoutMs, 50000) : engineTimeoutMs,
      tools,
      toolChoice,
      metadata: {
        engine: String(engine || ''),
        country: String(country || 'GLOBAL'),
        operation: String(operation || 'execute'),
        research_depth: modeConfig.key,
        has_web_search: isWebSearchNeeded ? 'true' : 'false'
      }
    });


    const elapsedMs = Date.now() - startTime;
    const finalRequestId = result.requestId || requestId;

    // 4. Log Success Telemetry to ai_usage_events
    if (client) {
      try {
        const usagePayload = {
          engine,
          country_code: country || 'GLOBAL',
          provider: 'OPENAI',
          model: result.model,
          request_id: finalRequestId,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          total_tokens: result.usage.totalTokens,
          estimated_cost_usd: result.pricing.estimated_cost_usd,
          latency_ms: elapsedMs,
          status: 'SUCCESS',
          fallback_used: false,
          metadata: {
            operation,
            requested_model: effectiveRequestedModel,
            automatic_or_manual: automaticOrManual,
            research_depth: modeConfig.key,
            response_id: result.responseId,
            pricing_status: result.pricing.pricing_status,
            pricing_source: result.pricing.pricing_source,
            input_cost_usd: result.pricing.input_cost_usd,
            output_cost_usd: result.pricing.output_cost_usd,
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

    const classifiedSources = (result.sources || []).map(s => ({
      ...s,
      source_type: classifyDomain(s.url),
      observed_at: new Date().toISOString()
    }));

    // 5. Parse structured Part 3 outputs server-side and Validate Evidence IDs
    let structuredData = null;
    let intelligenceRunStatus = 'SUCCESS';

    if (isStructuredAdvisoryEngine || isSourcingResearch) {
      try {
        const clean = String(result.outputText || '').trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();
        structuredData = JSON.parse(clean);
      } catch {
        const match = String(result.outputText || '').match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match && match[1]) {
          try {
            structuredData = JSON.parse(match[1].trim());
          } catch {}
        }
        if (!structuredData && isSourcingResearch) {
          // Robust JSON repair for research outputs (e.g. if truncated by token limit)
          try {
            let repaired = (result.outputText || '').trim();
            const firstBrace = repaired.indexOf('{');
            if (firstBrace !== -1) {
              repaired = repaired.slice(firstBrace);
              // Find the last complete item in "items": [...]
              const itemsMatch = repaired.match(/"items"\s*:\s*\[([\s\S]*)/i);
              if (itemsMatch) {
                const rawItemsBlock = itemsMatch[1];
                const lastItemClose = rawItemsBlock.lastIndexOf('}');
                if (lastItemClose !== -1) {
                  const validItemsString = rawItemsBlock.slice(0, lastItemClose + 1);
                  const parsedItems = JSON.parse(`[${validItemsString}]`);
                  
                  // Extract summary and subtrends if available
                  const summaryMatch = repaired.match(/"summary"\s*:\s*"([^"]*)"/i);
                  const confMatch = repaired.match(/"confidence"\s*:\s*([0-9.]+)/i);
                  structuredData = {
                    summary: summaryMatch ? summaryMatch[1] : 'Investigación de mercado completada.',
                    confidence: confMatch ? parseFloat(confMatch[1]) : 0.85,
                    subtrends: [],
                    items: parsedItems
                  };
                }
              }
            }
          } catch (repairErr) {
            console.warn('[AI Execute] JSON repair attempt failed:', repairErr.message);
          }
        }
        if (!structuredData && isStructuredAdvisoryEngine) {
          throw new OpenAIError('INVALID_OUTPUT', 502, 'OpenAI returned invalid structured intelligence output.');
        }
      }
    }

    if (isSourcingResearch && structuredData) {
      if (Array.isArray(structuredData)) {
        structuredData = {
          summary: 'Investigación de mercado completada.',
          confidence: 0.85,
          subtrends: [],
          items: structuredData
        };
      } else if (!Array.isArray(structuredData.items)) {
        if (Array.isArray(structuredData.products)) structuredData.items = structuredData.products;
        else if (Array.isArray(structuredData.candidates)) structuredData.items = structuredData.candidates;
        else if (Array.isArray(structuredData.results)) structuredData.items = structuredData.results;
        else if (Array.isArray(structuredData.discoveries)) structuredData.items = structuredData.discoveries;
        else structuredData.items = [];
      }
    }

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
          model: result.model,
          status: intelligenceRunStatus,
          metadata: { 
            operation, 
            decision_mode: isSourcingResearch ? 'SOURCING_RESEARCH' : 'ADVISORY_ONLY',
            invalid_evidence_neutralized: intelligenceRunStatus === 'INVALID_AI_EVIDENCE',
            research_depth: modeConfig.key,
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
    if (isSourcingResearch && researchCacheKey && client && result?.usage?.totalTokens > 0) {
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
          model: result.model,
          summary: structuredData?.summary || null,
          confidence: Number(structuredData?.confidence || 0.85),
          subtrends: Array.isArray(structuredData?.subtrends) ? structuredData.subtrends : [],
          items: rawItems,
          sources: classifiedSources,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          cost_usd: result.pricing.estimated_cost_usd,
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
      model: result.model,
      requested_model: effectiveRequestedModel,
      actual_model: result.model,
      automatic_or_manual: automaticOrManual,
      research_depth: modeConfig.key,
      text: result.outputText,
      data: structuredData,
      sources: classifiedSources,
      response_id: result.responseId,
      request_id: finalRequestId,
      latency_ms: elapsedMs,
      usage: result.usage,
      pricing: result.pricing
    });


  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    const errorType = err instanceof OpenAIError ? err.errorType : 'OPENAI_ERROR';
    const statusCode = err instanceof OpenAIError ? err.statusCode : 500;
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
