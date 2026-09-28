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
// COLLECTIBLES AI GATEWAY — PHASE 1
// Central Server/Client Layer for all AI invocations.
// Providers: NullAIProvider fallback + server-side OpenAIProvider
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

  /**
   * Main AI Execution Gateway
   * Hierarchy:
   * 1. Check Global Switch (ai_system_config.global_enabled)
   * 2. Check Circuit Breaker (CLOSED / OPEN)
   * 3. Check Country Config (ai_country_config.ai_enabled)
   * 4. Check Engine Config (ai_engine_config.enabled)
   * 5. Dispatch to configured Provider
   * 6. Safe Fallback execution if disabled / failed
   */
  public async execute<T = any>(options: AIExecuteOptions<T>): Promise<AIExecuteResponse<T>> {
    const startTime = performance.now();
    const { engine, country, operation, payload, context, fallbackHandler } = options;

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

      // 2. Check Country Config if country specified
      if (country) {
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
      const targetProviderKey = engineConfig.provider || systemConfig.provider || 'NONE';
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

      // 5. Execute Provider Adapter
      const result = await providerAdapter.execute<T>(engine, operation, payload, {
        ...context,
        country,
        model: engineConfig.model,
        max_output_tokens: engineConfig.max_output_tokens,
        timeout_ms: engineConfig.timeout_ms
      });
      const elapsed = Math.round(performance.now() - startTime);

      return {
        ...result,
        latency_ms: elapsed
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
}

export const aiGateway = AIGateway.getInstance();

export async function executeAI<T = any>(options: AIExecuteOptions<T>): Promise<AIExecuteResponse<T>> {
  return aiGateway.execute<T>(options);
}

