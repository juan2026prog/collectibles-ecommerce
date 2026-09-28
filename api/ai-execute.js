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
    systemPrompt,
    temperature,
    maxTokens,
    model: requestedModel,
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

  let selectedModel = requestedModel || 'gpt-5.6-terra';
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
        if (engData.model && engData.model !== 'NOT CONFIGURED' && !requestedModel) {
          selectedModel = engData.model;
        }
        if (engData.timeout_ms) {
          engineTimeoutMs = engData.timeout_ms;
        }
      }
    }

    const defaultInstructions = instructionsFor(engine, operation);
    const resolvedInstructions = systemPrompt || defaultInstructions;

    // 2. Call OpenAI Responses API server-side
    const result = await callOpenAIResponses({
      model: selectedModel,
      input: resolvedInput,
      instructions: resolvedInstructions,
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      maxTokens: typeof maxTokens === 'number' ? maxTokens : 1024,
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
        await client.from('ai_usage_events').insert({
          engine,
          country_code: country || 'GLOBAL',
          provider: 'OPENAI',
          model: result.model,
          request_id: finalRequestId,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          total_tokens: result.usage.totalTokens,
          estimated_cost_usd: result.pricing.estimated_cost_usd !== null ? result.pricing.estimated_cost_usd : 0,
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
        });
      } catch (logErr) {
        console.warn('[AI Execute] Telemetry logging error:', logErr.message);
      }
    }

    // 4. Return Sanitize Safe Result
    return res.status(200).json({
      success: true,
      status: 'SUCCESS',
      provider: 'OPENAI',
      model: result.model,
      text: result.outputText,
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
        await client.from('ai_error_events').insert({
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
        });
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
