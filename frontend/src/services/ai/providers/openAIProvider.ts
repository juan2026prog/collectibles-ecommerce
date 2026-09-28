import type { AIProviderAdapter } from './baseProvider';
import type { AIEngineKey, AIExecuteResponse } from '../types';
import { supabase } from '../../../lib/supabase';

export class OpenAIProvider implements AIProviderAdapter {
  public readonly providerKey = 'OPENAI';

  async execute<T = any>(
    engine: AIEngineKey,
    operation: string,
    payload?: any,
    context?: Record<string, any>
  ): Promise<AIExecuteResponse<T>> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const response = await fetch('/api/ai-execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        engine,
        operation,
        payload,
        context,
        country: context?.country
      })
    });

    if (!response.ok) throw new Error(`AI backend failed (${response.status})`);
    return await response.json() as AIExecuteResponse<T>;
  }

  async healthCheck() {
    try {
      const response = await fetch('/api/openai-test');
      const data = await response.json();
      return { healthy: Boolean(data?.configured), message: data?.configured ? 'OpenAI configured server-side.' : 'OpenAI not configured.' };
    } catch {
      return { healthy: false, message: 'OpenAI health check unavailable.' };
    }
  }

  estimateCost() { return 0; }
}

export const openAIProvider = new OpenAIProvider();
