// ============================================================
// COLLECTIBLES 2026 — OPENAI DIAGNOSTIC & TEST ENDPOINT
// Path: /api/openai-test
// GET: Safe 0-cost configuration status (no external API calls)
// POST: Controlled live test (guarded by OPENAI_TEST_ENABLED)
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { callOpenAIResponses, getOpenAIConfig, OpenAIError } from './lib/openai.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabasePublicKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseServiceKey;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const config = getOpenAIConfig();
  // Admin certification is authenticated below; production no longer needs a separate env toggle.
  const liveTestEnabled = config.configured;

  // ----------------------------------------------------
  // GET: Safe 0-Cost Diagnostic Info
  // ----------------------------------------------------
  if (req.method === 'GET') {
    return res.status(config.configured ? 200 : 500).json({
      ok: config.configured,
      configured: config.configured,
      models: config.models,
      supportedModels: Object.values(config.models),
      liveTestEnabled,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production'
    });
  }

  // ----------------------------------------------------
  // POST: Controlled Live Test
  // ----------------------------------------------------
  if (req.method === 'POST') {
    // Production live tests are restricted to an authenticated admin/superadmin.
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!supabase || !token) return res.status(401).json({ ok:false, error:'Admin authentication required.' });
    // Use the public client for JWT validation; profile authorization is checked separately.\n    const authClient = createClient(supabaseUrl, supabasePublicKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: authData } = await authClient.auth.getUser(token);
    const user = authData?.user;
    if (!user) return res.status(401).json({ ok:false, error:'Invalid admin session.' });
    const profileClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? supabase : authClient;
    const { data: profile, error: profileError } = await profileClient.from('profiles').select('is_admin,role').eq('id', user.id).maybeSingle();
    if (profileError) return res.status(500).json({ ok:false, error:'Could not verify admin profile.' });
    const isAdmin = profile?.is_admin === true || ['admin','superadmin','super_admin'].includes(String(profile?.role || '').toLowerCase());
    if (!isAdmin) return res.status(403).json({ ok:false, error:'Admin permission required.' });

    if (!liveTestEnabled) {
      return res.status(403).json({
        ok: false,
        error: 'Live OpenAI test is disabled in this environment. Set OPENAI_TEST_ENABLED=true to enable.',
        liveTestEnabled: false
      });
    }

    if (!config.configured) {
      return res.status(500).json({
        ok: false,
        error: 'OPENAI_API_KEY is not configured on the server.',
        configured: false
      });
    }

    const startTime = Date.now();
    const testModel = req.body?.model || 'gpt-5.6-terra';

    try {
      const result = await callOpenAIResponses({
        model: testModel,
        input: 'Respond only with: OPENAI_COLLECTIBLES_OK',
        temperature: 0.0,
        maxTokens: 50,
        timeoutMs: 15000,
        metadata: {
          feature: 'connectivity_test',
          app: 'collectibles'
        }
      });

      const latencyMs = Date.now() - startTime;
      const isExpectedResponse = result.outputText.includes('OPENAI_COLLECTIBLES_OK');

      // Record telemetry in ai_usage_events
      if (supabase) {
        try {
          await supabase.from('ai_usage_events').insert({
            engine: 'AI_SEARCH',
            country_code: 'GLOBAL',
            provider: 'OPENAI',
            model: result.model,
            request_id: result.requestId,
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
            total_tokens: result.usage.totalTokens,
            estimated_cost_usd: result.pricing.estimated_cost_usd !== null ? result.pricing.estimated_cost_usd : 0,
            latency_ms: latencyMs,
            status: isExpectedResponse ? 'SUCCESS' : 'INVALID_OUTPUT',
            fallback_used: false,
            metadata: {
              operation: 'ADMIN_CERTIFICATION_TEST',
              response_id: result.responseId,
              pricing_status: result.pricing.pricing_status,
              pricing_source: result.pricing.pricing_source,
              input_cost_usd: result.pricing.input_cost_usd,
              output_cost_usd: result.pricing.output_cost_usd
            }
          });
        } catch (logErr) {
          console.warn('[OpenAI Test] Telemetry logging failed:', logErr.message);
        }
      }

      return res.status(200).json({
        ok: isExpectedResponse,
        certified: isExpectedResponse,
        response: result.outputText,
        expectedResponse: 'OPENAI_COLLECTIBLES_OK',
        provider: 'OPENAI',
        model: result.model,
        usage: result.usage,
        pricing: result.pricing,
        latencyMs,
        requestId: result.requestId,
        responseId: result.responseId,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorType = err instanceof OpenAIError ? err.errorType : 'OPENAI_ERROR';
      const statusCode = err instanceof OpenAIError ? err.statusCode : 500;

      if (supabase) {
        try {
          await supabase.from('ai_error_events').insert({
            engine: 'AI_SEARCH',
            country_code: 'GLOBAL',
            provider: 'OPENAI',
            model: testModel,
            error_type: errorType,
            error_code: String(statusCode),
            safe_message: err.message.slice(0, 500),
            latency_ms: latencyMs,
            request_id: err.details?.requestId || `test_err_${Date.now()}`,
            metadata: {
              operation: 'ADMIN_CERTIFICATION_TEST',
              details: err.details || {}
            }
          });
        } catch (logErr) {
          console.warn('[OpenAI Test] Error logging failed:', logErr.message);
        }
      }

      return res.status(statusCode).json({
        ok: false,
        error: err.message,
        errorType,
        latencyMs
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({
    ok: false,
    error: 'Method not allowed.'
  });
}
