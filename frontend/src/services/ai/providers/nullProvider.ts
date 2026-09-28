import type { AIProviderAdapter } from './baseProvider';
import type { AIEngineKey, AIExecuteResponse } from '../types';

export class NullAIProvider implements AIProviderAdapter {
  public readonly providerKey = 'NONE';

  async execute<T = any>(
    _engine: AIEngineKey,
    _operation: string,
    _payload?: any,
    _context?: Record<string, any>
  ): Promise<AIExecuteResponse<T>> {
    return {
      success: false,
      status: 'AI_DISABLED',
      provider: null,
      model: null,
      error: 'AI Provider is set to NONE. Operation bypassed safely.',
      latency_ms: 0
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    return {
      healthy: true,
      message: 'NullAIProvider active — no external AI connections.'
    };
  }

  estimateCost(_inputTokens: number, _outputTokens: number, _model?: string): number {
    return 0.000000;
  }
}

export const nullAIProvider = new NullAIProvider();

