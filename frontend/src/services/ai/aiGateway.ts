import { supabase } from '../../lib/supabase';
import type { 
  AIExecuteOptions, 
  AIExecuteResponse, 
  AISystemConfig, 
  AIEngineConfig, 
  AICountryConfig 
} from './types';
import { nullAIProvider } from './providers/nullProvider';
import { openAIProvider } from './providers/openAIProvider';
import type { AIProviderAdapter } from './providers/baseProvider';

// ============================================================
// COLLECTIBLES AI GATEWAY — PHASE 2 HARDENED
// Central Server/Client Layer for all AI invocations.
// Available providers: NullAIProvider ('NONE'), OpenAIProvider ('OPENAI')
// ============================================================

export class AIGateway {
  private static instance: AIGateway;
  private providers: Map<string, AIProviderAdapter> = new Map();

  private constructor() {
    this.registerProvider(nullAIProvider);
    this.registerProvider(openAIProvider);
  }

  public static getInstance(): AIGateway {
    if (!AIGateway.instance) {
      AIGateway.instance = new AIGateway();
    }
    return AIGateway.instance;
  }

  public registerProvider(provider: AIProviderAdapter) {
    this.providers.set(provider.providerKey, provider);
  }

  public getProvider(providerKey: string): AIProviderAdapter | undefined {
    return this.providers.get(providerKey);
  }

  /**
   * Main AI Execution Gateway
   * Hierarchy:
   * 1. Check Global Switch (ai_system_config.global_enabled)
   * 2. Check Circuit Breaker (CLOSED / OPEN)
   * 3. Check Country Config (ai_country_config.ai_enabled)
   * 4. Check Engine Config (ai_engine_config.enabled)
   * 5. Dispatch to Provider (NullAIProvider or OpenAIProvider)
   * 6. Safe Fallback execution if disabled / failed
   */
  public async execute<T = any>(options: AIExecuteOptions<T>): Promise<AIExecuteResponse<T>> {
    const startTime = performance.now();
    const { engine, country, operation, payload, context, prompt, systemPrompt, fallbackHandler } = options;

    try {
      // 1. Fetch Global System Config
      const { data: systemData } = await supabase
        .from('ai_system_config')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const systemConfig = systemData as AISystemConfig | null;

      // Check Master Kill Switch
      if (!systemConfig || !systemConfig.global_enabled) {
        return await this.handleDisabledOrFallback(
          'AI_DISABLED',
          'AI Global is turned OFF. Master kill switch active.',
          engine,
          country,
          fallbackHandler,
          startTime
        );
      }

      // Check Circuit Breaker
      if (systemConfig.circuit_breaker_enabled && systemConfig.circuit_breaker_state === 'OPEN') {
        return await this.handleDisabledOrFallback(
          'CIRCUIT_OPEN',
          'AI Circuit Breaker is OPEN due to error/budget thresholds.',
          engine,
          country,
          fallbackHandler,
          startTime
        );
      }

      // 2. Check Country Config if specific 2-letter country is targeted (GLOBAL/ALL is always allowed)
      const isGlobalScope = !country || country === 'ALL' || country === 'GLOBAL' || country === 'TODOS';
      if (!isGlobalScope) {
        const { data: countryData } = await supabase
          .from('ai_country_config')
          .select('*')
          .eq('country_code', country)
          .maybeSingle();

        const countryConfig = countryData as AICountryConfig | null;
        if (!countryConfig || !countryConfig.ai_enabled || countryConfig.status !== 'ACTIVE') {
          return await this.handleDisabledOrFallback(
            'COUNTRY_DISABLED',
            `AI is disabled for country ${country}.`,
            engine,
            country,
            fallbackHandler,
            startTime
          );
        }
      }

      // 3. Check Engine Config
      const { data: engineData } = await supabase
        .from('ai_engine_config')
        .select('*')
        .eq('engine_key', engine)
        .maybeSingle();

      const engineConfig = engineData as AIEngineConfig | null;
      if (!engineConfig || !engineConfig.enabled) {
        return await this.handleDisabledOrFallback(
          'ENGINE_DISABLED',
          `AI Engine ${engine} is disabled.`,
          engine,
          country,
          fallbackHandler,
          startTime
        );
      }

      // 4. Resolve Provider
      const targetProviderKey = (engineConfig.provider && engineConfig.provider !== 'NONE')
        ? engineConfig.provider 
        : (systemConfig.provider || 'NONE');

      const providerAdapter = this.providers.get(targetProviderKey) || this.providers.get('NONE');

      if (!providerAdapter || targetProviderKey === 'NONE') {
        return await this.handleDisabledOrFallback(
          'PROVIDER_NOT_CONFIGURED',
          'AI Provider is set to NONE. No external AI configured.',
          engine,
          country,
          fallbackHandler,
          startTime
        );
      }

      // Merge context with engine config
      const executionContext = {
        ...context,
        country: country || 'UY',
        model: engineConfig.model !== 'NOT CONFIGURED' ? engineConfig.model : undefined,
        temperature: engineConfig.temperature,
        maxTokens: engineConfig.max_output_tokens
      };

      // 5. Execute Provider Adapter
      const result = await (providerAdapter as any).execute(
        engine, 
        operation, 
        payload, 
        executionContext, 
        prompt, 
        systemPrompt
      );

      const elapsed = Math.round(performance.now() - startTime);

      if (!result.success && fallbackHandler) {
        try {
          const fallbackData = await fallbackHandler();
          return {
            success: true,
            status: 'FALLBACK',
            provider: result.provider,
            model: result.model,
            data: fallbackData,
            fallback_executed: true,
            latency_ms: elapsed,
            error: result.error
          };
        } catch (fbErr: any) {
          return {
            ...result,
            latency_ms: elapsed
          };
        }
      }

      return {
        ...result,
        latency_ms: result.latency_ms || elapsed
      };

    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      console.warn(`[AIGateway] Execution error for engine ${engine}:`, err?.message || err);

      if (fallbackHandler) {
        try {
          const fallbackData = await fallbackHandler();
          return {
            success: true,
            status: 'FALLBACK',
            provider: null,
            model: null,
            data: fallbackData,
            fallback_executed: true,
            latency_ms: elapsed
          };
        } catch (fbErr: any) {
          return {
            success: false,
            status: 'AI_DISABLED',
            provider: null,
            model: null,
            error: fbErr?.message || 'Fallback execution failed.',
            latency_ms: elapsed
          };
        }
      }

      return {
        success: false,
        status: 'AI_DISABLED',
        provider: null,
        model: null,
        error: err?.message || 'AI Gateway execution failed.',
        latency_ms: elapsed
      };
    }
  }

  private async handleDisabledOrFallback<T>(
    status: AIExecuteResponse['status'],
    message: string,
    _engine: string,
    _country?: string,
    fallbackHandler?: () => Promise<T> | T,
    startTime: number = performance.now()
  ): Promise<AIExecuteResponse<T>> {
    const elapsed = Math.round(performance.now() - startTime);

    if (fallbackHandler) {
      try {
        const fallbackData = await fallbackHandler();
        return {
          success: true,
          status: 'FALLBACK',
          provider: null,
          model: null,
          data: fallbackData,
          fallback_executed: true,
          latency_ms: elapsed
        };
      } catch (fbErr: any) {
        return {
          success: false,
          status,
          provider: null,
          model: null,
          error: fbErr?.message || message,
          latency_ms: elapsed
        };
      }
    }

    return {
      success: false,
      status,
      provider: null,
      model: null,
      error: message,
      latency_ms: elapsed
    };
  }

  /**
   * Fetches available, enabled models catalog from Central AI Gateway
   */
  public async getAvailableModels(engine = 'RESEARCH_INTELLIGENCE'): Promise<AIModelsResponse> {
    try {
      let token: string | undefined;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token;
      } catch (_) {}

      const res = await fetch(`/api/ai-models?engine=${encodeURIComponent(engine)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (!res.ok) {
        throw new Error(`Models HTTP error ${res.status}`);
      }

      return await res.json();
    } catch (err: any) {
      console.warn('[AIGateway] Failed to fetch live models from backend:', err);
      // Safe fallback catalog when network is unreachable
      return {
        success: true,
        default: 'AUTO',
        engine,
        models: [
          {
            id: 'gpt-4o-mini',
            display_name: 'GPT-4o mini',
            badge: '⚡ Más económico',
            description: 'Baja latencia, costo mínimo y excelente rendimiento en búsqueda',
            enabled: true,
            allowed: true,
            web_search: true,
            research_intelligence: true,
            structured_output: true,
            pricing: {
              input_per_million: 0.15,
              cached_input_per_million: 0.075,
              output_per_million: 0.60,
              status: 'VERIFIED'
            }
          },
          {
            id: 'gpt-5.6-terra',
            display_name: 'GPT-5.6 Terra',
            badge: '🔎 Mayor capacidad',
            description: 'Modelo balanceado con amplio contexto y alta precisión de análisis',
            enabled: true,
            allowed: true,
            web_search: true,
            research_intelligence: true,
            structured_output: true,
            pricing: {
              input_per_million: 2.00,
              cached_input_per_million: 0.20,
              output_per_million: 12.00,
              status: 'VERIFIED'
            }
          },
          {
            id: 'gpt-5.6-sol',
            display_name: 'GPT-5.6 Sol',
            badge: '🧠 Razonamiento profundo',
            description: 'Modelo insignia para investigación compleja y síntesis multidominio',
            enabled: true,
            allowed: true,
            web_search: true,
            research_intelligence: true,
            structured_output: true,
            pricing: {
              input_per_million: 4.00,
              cached_input_per_million: 0.40,
              output_per_million: 20.00,
              status: 'VERIFIED'
            }
          },
          {
            id: 'gpt-4o',
            display_name: 'GPT-4o',
            badge: 'Omni Standard',
            description: 'Modelo multimodal estándar de alta fidelidad',
            enabled: true,
            allowed: true,
            web_search: true,
            research_intelligence: true,
            structured_output: true,
            pricing: {
              input_per_million: 2.50,
              cached_input_per_million: 1.25,
              output_per_million: 10.00,
              status: 'VERIFIED'
            }
          }
        ]
      };
    }
  }

  /**
   * Pre-flight Live Token & Cost Estimator (Zero OpenAI Cost Guarantee)
   */
  public async estimateCost(params: {
    query: string;
    country?: string;
    product_family?: string;
    category?: string;
    research_depth?: 'ECONOMICO' | 'ESTANDAR' | 'PROFUNDO';
    requested_model?: string;
    time_scope?: string;
    period?: string;
    engine?: string;
    operation?: string;
    force_refresh?: boolean;
  }): Promise<AIPreFlightEstimate> {
    const {
      query,
      country = 'UY',
      product_family,
      category,
      research_depth = 'ECONOMICO',
      requested_model = 'AUTO',
      time_scope = 'ALL_TIME',
      period,
      engine = 'RESEARCH_INTELLIGENCE',
      operation = 'sourcing_market_research',
      force_refresh = false
    } = params;

    try {
      let token: string | undefined;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token;
      } catch (_) {}

      const effectiveTimeScope = time_scope || period || 'ALL_TIME';
      const effectiveProductFamily = product_family || category || 'ALL';

      const res = await fetch('/api/ai-estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          query,
          country,
          product_family: effectiveProductFamily,
          category: effectiveProductFamily,
          research_depth,
          requested_model,
          time_scope: effectiveTimeScope,
          period: effectiveTimeScope,
          engine,
          operation,
          force_refresh
        })
      });

      if (!res.ok) {
        throw new Error(`Estimate HTTP error ${res.status}`);
      }

      return await res.json();
    } catch (err: any) {
      console.warn('[AIGateway] Pre-flight estimation error:', err);
      // Local dynamic fallback estimate without network
      const isAuto = !requested_model || requested_model === 'AUTO';
      const fallbackModel = isAuto 
        ? (research_depth === 'ECONOMICO' ? 'gpt-4o-mini' : (research_depth === 'ESTANDAR' ? 'gpt-5.6-terra' : 'gpt-5.6-sol'))
        : requested_model;

      const inputTokensExpected = research_depth === 'ECONOMICO' ? 21000 : (research_depth === 'ESTANDAR' ? 28000 : 42000);
      const inputTokensMin = research_depth === 'ECONOMICO' ? 16500 : (research_depth === 'ESTANDAR' ? 22000 : 30000);
      const inputTokensMax = research_depth === 'ECONOMICO' ? 26000 : (research_depth === 'ESTANDAR' ? 36000 : 58000);

      const outputTokensExpected = research_depth === 'ECONOMICO' ? 450 : (research_depth === 'ESTANDAR' ? 600 : 900);
      const outputTokensMin = research_depth === 'ECONOMICO' ? 250 : (research_depth === 'ESTANDAR' ? 350 : 500);
      const outputTokensMax = research_depth === 'ECONOMICO' ? 600 : (research_depth === 'ESTANDAR' ? 750 : 1200);

      // Model pricing rates per 1M tokens
      const rates: Record<string, { in: number; out: number }> = {
        'gpt-4o-mini': { in: 0.15, out: 0.60 },
        'gpt-5.6-luna': { in: 0.20, out: 1.20 },
        'gpt-5.6-terra': { in: 2.00, out: 12.00 },
        'gpt-4o': { in: 2.50, out: 10.00 },
        'gpt-5.6-sol': { in: 4.00, out: 20.00 },
        'gpt-4-turbo': { in: 10.00, out: 30.00 },
        'gpt-4.5-preview': { in: 75.00, out: 150.00 }
      };

      const mRate = rates[fallbackModel] || rates['gpt-4o-mini'];
      const inputCostExpected = (inputTokensExpected / 1000000) * mRate.in;
      const outputCostExpected = (outputTokensExpected / 1000000) * mRate.out;
      const totalExpected = inputCostExpected + outputCostExpected;

      const inputCostMin = (inputTokensMin / 1000000) * mRate.in;
      const outputCostMin = (outputTokensMin / 1000000) * mRate.out;
      const totalMin = inputCostMin + outputCostMin;

      const inputCostMax = (inputTokensMax / 1000000) * mRate.in;
      const outputCostMax = (outputTokensMax / 1000000) * mRate.out;
      const totalMax = inputCostMax + outputCostMax;

      return {
        success: true,
        model: fallbackModel,
        requested_model: requested_model || 'AUTO',
        is_manual_override: !isAuto,
        research_depth,
        research_depth_label: research_depth === 'ECONOMICO' ? '⚡ Económico' : (research_depth === 'ESTANDAR' ? '🔎 Estándar' : '🧠 Profundo'),
        max_candidates: research_depth === 'ECONOMICO' ? 5 : (research_depth === 'ESTANDAR' ? 8 : 15),
        estimated_input_tokens: inputTokensExpected,
        estimated_input_tokens_min: inputTokensMin,
        estimated_input_tokens_expected: inputTokensExpected,
        estimated_input_tokens_max: inputTokensMax,
        estimated_output_tokens_min: outputTokensMin,
        estimated_output_tokens_expected: outputTokensExpected,
        max_output_tokens: outputTokensMax,
        estimated_input_cost_usd: Number(inputCostExpected.toFixed(6)),
        estimated_output_cost_usd: Number(outputCostExpected.toFixed(6)),
        estimated_cost_min_usd: Number(totalMin.toFixed(6)),
        estimated_cost_expected_usd: Number(totalExpected.toFixed(6)),
        estimated_cost_max_usd: Number(totalMax.toFixed(6)),
        estimated_total_min_usd: Number(totalMin.toFixed(6)),
        estimated_total_max_usd: Number(totalMax.toFixed(6)),
        estimated_total_avg_usd: Number(totalExpected.toFixed(6)),
        web_search_planned: true,
        cache: { status: 'MISS', age_seconds: null },
        requires_confirmation: totalExpected >= 0.05,
        hard_limit_exceeded: false,
        warning_threshold_usd: 0.02,
        pricing_source: 'LOCAL_FALLBACK',
        openai_calls_used: 0
      };
    }
  }
}

export const aiGateway = AIGateway.getInstance();

export async function executeAI<T = any>(options: AIExecuteOptions<T>): Promise<AIExecuteResponse<T>> {
  return aiGateway.execute<T>(options);
}
