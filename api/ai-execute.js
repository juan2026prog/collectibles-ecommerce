// ============================================================
// COLLECTIBLES 2026 — AI EXECUTE ENDPOINT (SERVER-SIDE GATEWAY)
// Path: /api/ai-execute
// Secure handler for all OpenAI invocations with full telemetry.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { callOpenAIResponses, OpenAIError } from '../server/lib/openai.js';
import { generateEvidenceFingerprint } from '../server/lib/canonicalJson.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_f_7xF86CT0DFwT7YupNh_Q_TzmemHNf';

const ENGINE_COUNTRY_FLAG = {
  AI_SEARCH: 'ai_search_enabled',
  PRODUCT_DISCOVERY: 'product_discovery_enabled',
  TREND_ANALYSIS: 'trend_analysis_enabled',
  PRODUCT_CURATION: 'product_curation_enabled',
  COUNTRY_INTELLIGENCE: 'country_intelligence_enabled',
  RADAR_INTELLIGENCE: 'radar_intelligence_enabled',
  RELEASE_INTELLIGENCE: 'release_intelligence_enabled'
};

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
  if (['PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION','COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE'].includes(engine)) {
    return common + ' You are advisory only: never publish, buy, change prices, or trigger automation. Reason only from evidence in payload.evidence. Missing evidence must reduce confidence, never be guessed. scoreAdjustment is only a bounded advisory adjustment from -10 to 10; deterministic Collectibles scoring remains authoritative. Return ONLY valid JSON: {"summary":string,"confidence":number_0_to_1,"signals":string[],"risks":string[],"recommendations":string[],"evidenceIds":string[],"scoreAdjustment":number_minus10_to_10,"action":"REVIEW"|"WATCH"|"IGNORE"}.';
  }
  return common + ` Operation: ${operation}. Return concise useful output grounded only in supplied data.`;
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

  const authHeader = req.headers.authorization || '';
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const {
    engine = 'AI_SEARCH',
    country = 'UY',
    operation = 'execute',
    prompt,
    payload,
    context = {}
  } = req.body || {};

  const resolvedInput = prompt || (typeof payload === 'string' ? payload : JSON.stringify(payload || {}));

  if (!resolvedInput) {
    return res.status(400).json({
      success: false,
      status: 'INVALID_OUTPUT',
      error: 'Prompt or payload is required.'
    });
  }

  let selectedModel = 'gpt-5.6-terra';
  let engineTimeoutMs = 25000;

  try {
    // 1. Validate System, Country, and Engine configs from Database
    if (client) {
      // Global switch & Circuit breaker
      const { data: sysData } = await client
        .from('ai_system_config')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

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
        const { data: cntrData } = await client
          .from('ai_country_config')
          .select('*')
          .eq('country_code', country)
          .maybeSingle();

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
      const { data: engData } = await client
        .from('ai_engine_config')
        .select('*')
        .eq('engine_key', engine)
        .maybeSingle();

      if (engData) {
        if (!engData.enabled) {
          return res.status(403).json({
            success: false,
            status: 'ENGINE_DISABLED',
            error: `AI Engine ${engine} is disabled.`
          });
        }
        if (engData.model && engData.model !== 'NOT CONFIGURED') {
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
        const { data: usageRows } = await client
          .from('ai_usage_events')
          .select('estimated_cost_usd, engine, country_code, created_at')
          .gte('created_at', startOfMonth);

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

    const isStructuredAdvisoryEngine = ['PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION','COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE'].includes(engine);
    const evidenceObj = payload?.evidence || {};
    const evidenceFingerprint = generateEvidenceFingerprint(evidenceObj);

    // 2. Fingerprint Cache Lookup for Advisory Analysis
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

    const resolvedInstructions = instructionsFor(engine, operation);

    // 3. Call OpenAI Responses API server-side
    const result = await callOpenAIResponses({
      model: selectedModel,
      input: resolvedInput,
      instructions: resolvedInstructions,
      temperature: 0.2,
      maxTokens: 1024,
      timeoutMs: engineTimeoutMs,
      metadata: {
        engine,
        country,
        operation
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

    // 5. Parse structured Part 3 outputs server-side and Validate Evidence IDs
    let structuredData = null;
    let intelligenceRunStatus = 'SUCCESS';

    if (isStructuredAdvisoryEngine) {
      try {
        const clean = String(result.outputText || '').trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();
        structuredData = JSON.parse(clean);
      } catch {
        throw new OpenAIError('INVALID_OUTPUT', 502, 'OpenAI returned invalid structured intelligence output.');
      }

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

    // Persist advisory Part 3 result separately from raw provider telemetry.
    if (structuredData && client) {
      try {
        const evidenceCount = Object.values(evidenceObj).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
        const scoreAdjustment = Math.max(-10, Math.min(10, Number(structuredData.scoreAdjustment || 0)));
        const intelligencePayload = {
          engine,
          country_code: country || 'GLOBAL',
          objective: payload?.objective || null,
          evidence_fingerprint: evidenceFingerprint,
          evidence_count: evidenceCount,
          summary: structuredData.summary || null,
          confidence: Number(structuredData.confidence || 0),
          score_adjustment: scoreAdjustment,
          advisory_action: ['REVIEW','WATCH','IGNORE'].includes(structuredData.action) ? structuredData.action : 'WATCH',
          signals: Array.isArray(structuredData.signals) ? structuredData.signals : [],
          risks: Array.isArray(structuredData.risks) ? structuredData.risks : [],
          recommendations: Array.isArray(structuredData.recommendations) ? structuredData.recommendations : [],
          evidence_ids: Array.isArray(structuredData.evidenceIds) ? structuredData.evidenceIds : [],
          request_id: finalRequestId,
          model: result.model,
          status: intelligenceRunStatus,
          metadata: { 
            operation, 
            decision_mode: 'ADVISORY_ONLY',
            invalid_evidence_neutralized: intelligenceRunStatus === 'INVALID_AI_EVIDENCE'
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

    // 6. Return sanitized safe result
    return res.status(200).json({
      success: true,
      status: intelligenceRunStatus,
      provider: 'OPENAI',
      model: result.model,
      text: result.outputText,
      data: structuredData,
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
