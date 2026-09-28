import type { AIEngineKey, AIExecuteResponse } from '../types';

export interface AIProviderAdapter {
  readonly providerKey: string;
  execute<T = any>(
    engine: AIEngineKey,
    operation: string,
    payload?: any,
    context?: Record<string, any>
  ): Promise<AIExecuteResponse<T>>;
  healthCheck(): Promise<{ healthy: boolean; message: string }>;
  estimateCost(inputTokens: number, outputTokens: number, model?: string): number;
}

