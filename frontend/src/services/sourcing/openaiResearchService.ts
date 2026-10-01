import { aiGateway } from '../ai/aiGateway';
import { supabase } from '../../lib/supabase';
import type { ResearchPack } from '../../types/sourcing';

// ================================================================
// OPENAI RESEARCH SERVICE — SOURCING CLIENT GATEWAY
// All OpenAI calls route strictly through AIGateway -> /api/ai-execute.
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
  country?: string;
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
 * Checks whether AI system is globally enabled in ai_system_config.
 * Does NOT expose any API key.
 */
export async function checkOpenAIStatus(): Promise<OpenAIFeatureStatus> {
  try {
    const { data: sysConfig } = await supabase
      .from('ai_system_config')
      .select('global_enabled, provider')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (sysConfig) {
      const enabled = Boolean(sysConfig.global_enabled) && sysConfig.provider !== 'NONE';
      return {
        enabled,
        reason: enabled ? 'OK' : 'FEATURE_DISABLED',
        model: 'gpt-4o'
      };
    }

    // Fallback: check site_settings for sourcing_openai_enabled
    const { data: siteSetting } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'sourcing_openai_enabled')
      .single();

    if (siteSetting) {
      const enabled = siteSetting.value === 'true' || siteSetting.value === true;
      return {
        enabled,
        reason: enabled ? 'OK' : 'FEATURE_DISABLED',
        model: 'gpt-4o'
      };
    }
  } catch {}

  return { enabled: false, reason: 'FEATURE_DISABLED' };
}


/**
 * Executes an OpenAI-powered product research query through the central AI Gateway.
 * Returns a canonical Research Pack that feeds into Sourcing pipeline.
 */
export async function executeOpenAIResearch(
  params: OpenAIResearchParams
): Promise<OpenAIResearchResult> {
  const prompt = `BÚSQUEDA SOURCING: ${params.query}\nTipo de investigación: ${params.research_type || 'MANUAL'}\nPaís objetivo: ${params.country || 'UY'}\nMáximo ${params.max_results || 20} productos. Todos deben ser originales y oficialmente licenciados.`;

  try {
    const response = await aiGateway.execute({
      engine: 'RESEARCH_INTELLIGENCE',
      country: (params.country as any) || 'UY',
      operation: 'sourcing_research',
      prompt,
      payload: {
        query: params.query,
        research_type: params.research_type || 'MANUAL',
        country: params.country || 'UY',
        evidence: {
          query: params.query,
          timestamp: new Date().toISOString()
        }
      }
    });

    if (!response.success) {
      let mappedStatus: OpenAIResearchStatus = 'FAILED';
      if (response.status === 'BUDGET_EXCEEDED') mappedStatus = 'BUDGET_EXCEEDED';
      if (response.status === 'AI_DISABLED' || response.status === 'ENGINE_DISABLED') mappedStatus = 'FEATURE_DISABLED';
      if (response.status === 'PROVIDER_NOT_CONFIGURED') mappedStatus = 'PENDING_CREDENTIAL';

      return {
        success: false,
        status: mappedStatus,
        error: response.error || 'Error al ejecutar investigación con IA.'
      };
    }

    const outputData = response.data;
    const items = Array.isArray(outputData?.items) ? outputData.items : [];

    const pack: ResearchPack = {
      schema_version: '1.0',
      pack_id: `pack_${Date.now()}`,
      title: `Investigación: ${params.query}`,
      generated_at: new Date().toISOString(),
      provider: 'openai_gateway',
      query: params.query,
      research_type: params.research_type || 'MANUAL',
      items: items.map((it: any) => ({
        url: it.url || 'https://www.amazon.com',
        retailer: it.retailer || 'amazon',
        name: it.name || it.title || params.query,
        brand: it.brand || 'Collectibles',
        license: it.license || it.franchise || '',
        manufacturer: it.manufacturer || it.brand || 'Collectibles',
        product_type: it.product_type || 'TRENDING',
        reason: it.reason || outputData?.summary || 'Detectado por Research Intelligence',
        tags: Array.isArray(it.tags) ? it.tags : [],
        price: null,
        upc: it.upc || null,
        asin: it.asin || null,
        mpn: it.mpn || null,
        release_date: it.release_date || null,
        research_notes: it.research_notes || '',
        confidence: Number(outputData?.confidence || 0.8)
      }))
    };

    return {
      success: true,
      status: 'READY',
      pack,
      usage: {
        input_tokens: response.usage?.inputTokens || 0,
        output_tokens: response.usage?.outputTokens || 0,
        total_tokens: response.usage?.totalTokens || 0,
        estimated_cost_usd: response.pricing?.estimated_cost_usd || 0
      },
      items_found: items.length,
      items_valid: items.length,
      items_invalid: 0
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'FAILED',
      error: err.message || 'Error inesperado al conectar con AI Gateway.'
    };
  }
}
