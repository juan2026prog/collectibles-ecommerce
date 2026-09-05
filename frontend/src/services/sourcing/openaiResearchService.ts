import { supabase } from '../../lib/supabase';
import type { ResearchPack } from '../../types/sourcing';

// ================================================================
// OPENAI RESEARCH SERVICE — CLIENT SIDE
// Communicates with the sourcing-openai-research Edge Function.
// OPENAI_API_KEY is NEVER touched here — server-side only.
// ================================================================

export type OpenAIResearchStatus =
  | 'READY'
  | 'PARTIAL'
  | 'FAILED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'PENDING_CREDENTIAL'
  | 'MODEL_UNAVAILABLE'
  | 'FEATURE_DISABLED'
  | 'FORBIDDEN';

export type OpenAIResearchType =
  | 'MANUAL'
  | 'TRENDING'
  | 'NEW_RELEASE'
  | 'PREORDER'
  | 'EVERGREEN'
  | 'RETRO'
  | 'NOSTALGIA'
  | 'CATALOG_GAP';

export interface OpenAIResearchParams {
  query: string;
  research_type?: OpenAIResearchType;
  max_results?: number;
}

export interface OpenAIResearchResult {
  success: boolean;
  status: OpenAIResearchStatus;
  pack?: ResearchPack;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
  };
  items_found?: number;
  items_valid?: number;
  items_invalid?: number;
  error?: string;
}

export interface OpenAIFeatureStatus {
  enabled: boolean;
  reason?: 'FEATURE_DISABLED' | 'PENDING_CREDENTIAL' | 'OK';
  model?: string;
}

/**
 * Checks whether sourcing_openai_enabled is true in site_settings.
 * Does NOT expose any API key.
 */
export async function checkOpenAIStatus(): Promise<OpenAIFeatureStatus> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['sourcing_openai_enabled', 'sourcing_openai_model']);

  if (error) return { enabled: false, reason: 'FEATURE_DISABLED' };

  const map: Record<string, string> = {};
  for (const row of (data ?? [])) map[row.key] = row.value;

  const enabled = map['sourcing_openai_enabled'] === 'true';
  return {
    enabled,
    reason: enabled ? 'OK' : 'FEATURE_DISABLED',
    model: map['sourcing_openai_model'] || 'gpt-4o'
  };
}

/**
 * Executes an OpenAI-powered product research query.
 * Returns a canonical Research Pack that feeds into sourcingService.processResearchPack().
 */
export async function executeOpenAIResearch(
  params: OpenAIResearchParams
): Promise<OpenAIResearchResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, status: 'FORBIDDEN', error: 'No autenticado.' };
  }

  const supabaseUrl = (supabase as any).supabaseUrl as string;
  const functionUrl = `${supabaseUrl}/functions/v1/sourcing-openai-research`;

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': (supabase as any).supabaseKey as string
      },
      body: JSON.stringify({
        query: params.query,
        research_type: params.research_type || 'MANUAL',
        max_results: params.max_results || 100
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        status: (data.status as OpenAIResearchStatus) || 'FAILED',
        error: data.error || 'Error inesperado.'
      };
    }

    return {
      success: true,
      status: data.status as OpenAIResearchStatus,
      pack: data.pack as ResearchPack,
      usage: data.usage,
      items_found: data.items_found,
      items_valid: data.items_valid,
      items_invalid: data.items_invalid
    };
  } catch (err: any) {
    return { success: false, status: 'FAILED', error: err.message };
  }
}
