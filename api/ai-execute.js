// ============================================================
// COLLECTIBLES 2026 — AI EXECUTE ENDPOINT (SERVER-SIDE GATEWAY)
// Path: /api/ai-execute
// Secure handler for all OpenAI invocations with full telemetry.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { callOpenAIResponses, OpenAIError } from './lib/openai.js';

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
    }

    const resolvedInstructions = instructionsFor(engine, operation);

    // 2. Call OpenAI Responses API server-side
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

    // 3. Log Success Telemetry to ai_usage_events
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

    // 4. Parse structured Part 3 outputs server-side before returning them.
    let structuredData = null;
    if (['PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION','COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE'].includes(engine)) {
      try {
        const clean = String(result.outputText || '').trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();
        structuredData = JSON.parse(clean);
      } catch {
        throw new OpenAIError('INVALID_OUTPUT', 502, 'OpenAI returned invalid structured intelligence output.');
      }
    }

    // Persist advisory Part 3 result separately from raw provider telemetry.
    if (structuredData && client) {
      try {
        const evidence = payload?.evidence || {};
        const evidenceCount = Object.values(evidence).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
        await client.from('ai_intelligence_runs').insert({
          engine,
          country_code: country || 'GLOBAL',
          objective: payload?.objective || null,
          evidence_fingerprint: finalRequestId,
          evidence_count: evidenceCount,
          summary: structuredData.summary || null,
          confidence: Number(structuredData.confidence || 0),
          score_adjustment: Math.max(-10, Math.min(10, Number(structuredData.scoreAdjustment || 0))),
          advisory_action: ['REVIEW','WATCH','IGNORE'].includes(structuredData.action) ? structuredData.action : 'WATCH',
          signals: Array.isArray(structuredData.signals) ? structuredData.signals : [],
          risks: Array.isArray(structuredData.risks) ? structuredData.risks : [],
          recommendations: Array.isArray(structuredData.recommendations) ? structuredData.recommendations : [],
          evidence_ids: Array.isArray(structuredData.evidenceIds) ? structuredData.evidenceIds : [],
          request_id: finalRequestId,
          model: result.model,
          status: 'SUCCESS',
          metadata: { operation, decision_mode: 'ADVISORY_ONLY' }
        });
      } catch (logErr) {
        console.warn('[AI Execute] Intelligence run logging error:', logErr.message);
      }
    }

    // 5. Return sanitized safe result
    return res.status(200).json({
      success: true,
      status: 'SUCCESS',
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
