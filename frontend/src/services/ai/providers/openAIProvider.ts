// ============================================================
// COLLECTIBLES 2026 — OPENAI PROVIDER ADAPTER (CLIENT-SIDE)
// Dispatches AI requests securely to the /api/ai-execute server endpoint.
// OPENAI_API_KEY is NEVER exposed to the browser.
// ============================================================

import type { AIProviderAdapter } from './baseProvider';
import type { AIEngineKey, AIExecuteResponse } from '../types';
import { supabase } from '../../../lib/supabase';

export class OpenAIProvider implements AIProviderAdapter {
  public readonly providerKey = 'OPENAI';

  /**
   * Executes AI request via server-side endpoint
   */
  async execute<T = any>(
    engine: AIEngineKey,
    operation: string,
    payload?: any,
    context?: Record<string, any>,
    prompt?: string,
    systemPrompt?: string
  ): Promise<AIExecuteResponse<T>> {
    const startTime = performance.now();

    try {
      let token: string | undefined;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token;
      } catch (_) {}

      // Build prompt if not explicitly passed
      const resolvedPrompt = prompt || (typeof payload === 'string' ? payload : JSON.stringify(payload || {}));

      const res = await fetch('/api/ai-execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          engine,
          country: context?.country || 'UY',
          operation,
          payload,
          prompt: resolvedPrompt,
          systemPrompt,
          temperature: context?.temperature,
          maxTokens: context?.maxTokens,
          model: context?.model,
          requested_model: context?.requested_model || payload?.requested_model,
          research_depth: context?.research_depth || payload?.research_depth,
          result_limit: context?.resultLimit || payload?.resultLimit || context?.result_limit || payload?.result_limit,
          resultLimit: context?.resultLimit || payload?.resultLimit || context?.result_limit || payload?.result_limit,
          context
        })
      });

      const elapsed = Math.round(performance.now() - startTime);
      let data: any;
      try {
        data = await res.json();
      } catch {
        return {
          success: false,
          status: 'INVALID_OUTPUT',
          provider: 'OPENAI',
          model: null,
          error: `Failed to parse response from AI server (${res.status}).`,
          latency_ms: elapsed
        };
      }

      if (!res.ok) {
        return {
          success: false,
          status: data.status || 'OPENAI_ERROR',
          provider: 'OPENAI',
          model: data.model || null,
          error: data.error || 'OpenAI execution failed.',
          latency_ms: data.latency_ms || elapsed,
          request_id: data.request_id
        };
      }

      const returnedData = (data.data ?? data.text) as T;
      const parsedItemsCount = Array.isArray((returnedData as any)?.items) 
        ? (returnedData as any).items.length 
        : (Array.isArray(returnedData) ? (returnedData as any).length : 0);

      console.log('[FRONTEND_RESEARCH_TRACE]', {
        step: 'PROVIDER_ITEMS',
        hasData: Boolean(returnedData),
        itemsCount: parsedItemsCount,
        status: data.status,
        model: data.model
      });

      return {
        success: true,
        status: 'SUCCESS',
        provider: 'OPENAI',
        model: data.model,
        text: data.text,
        data: returnedData,
        sources: data.sources || [],
        latency_ms: data.latency_ms || elapsed,
        usage: data.usage,
        pricing: data.pricing,
        request_id: data.request_id,
        response_id: data.response_id,
        requested_model: data.requested_model,
        actual_model: data.actual_model || data.model,
        automatic_or_manual: data.automatic_or_manual,
        research_depth: data.research_depth,
        cached: Boolean(data.cached)
      };

    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      return {
        success: false,
        status: 'OPENAI_ERROR',
        provider: 'OPENAI',
        model: null,
        error: err?.message || 'Network error connecting to AI Gateway endpoint.',
        latency_ms: elapsed
      };
    }
  }

  /**
   * Safe health check (calls 0-cost GET /api/openai-test)
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string; configured?: boolean }> {
    try {
      const res = await fetch('/api/openai-test', { method: 'GET' });
      const data = await res.json();
      if (res.ok && data.configured) {
        return {
          healthy: true,
          configured: true,
          message: `OpenAI Provider connected server-side (${data.supportedModels?.length || 4} models available).`
        };
      }
      return {
        healthy: false,
        configured: data.configured || false,
        message: data.configured ? 'OpenAI endpoint issue.' : 'OPENAI_API_KEY not configured on server.'
      };
    } catch (err: any) {
      return {
        healthy: false,
        configured: false,
        message: err?.message || 'Failed to reach OpenAI diagnostic endpoint.'
      };
    }
  }

  /** Pricing is authoritative server-side only. */
  estimateCost(): number {
    return Number.NaN;
  }
}

export const openAIProvider = new OpenAIProvider();
