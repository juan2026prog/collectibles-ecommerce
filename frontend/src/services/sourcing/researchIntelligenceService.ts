// ============================================================
// COLLECTIBLES 2026 — RESEARCH INTELLIGENCE SERVICE
// Motor central de investigación, cruce de señales y descubrimiento.
// 
// Flujo:
// 1. Consulta natural / Discovery Trigger
// 2. AI Gateway (/api/ai-execute) -> Plan & Extracción de señales
// 3. Normalización & Verificación con fuentes reales
// 4. Trend Engine (Score determinístico)
// 5. Opportunity Engine (7 componentes determinísticos)
// 6. Candidatos estructurados listos para Sourcing & Importación
// ============================================================

import { aiGateway } from '../ai/aiGateway';
import { TrendEngine } from './trendEngine';
import { manualCandidates } from './canonicalCandidateValidation';
import { calculateInternationalPricing } from '../../lib/internationalPricing';
import { checkTiendamiaByAsin } from './tiendamiaMatchingService';
import { resolveZincProductsForCandidates } from './zincProductResolver';
import { enrichCandidatesCommercialData } from './candidateCommercialEnrichment';
import { multiSourceDiscoveryService } from './multiSourceDiscoveryService';
import { deduplicateCanonicalCandidates } from '../../../../shared/sourcingCandidateValidation.js';
import type {
  SourcingResearchQueryRequest,
  SourcingResearchResponse,
  SourcingTrendCard,
  SourcingProductCandidate,
  SourcingSignal,
  SourcingCandidateStatus
} from '../../types/sourcingIntelligence';

export class ResearchIntelligenceService {
  private static instance: ResearchIntelligenceService;

  public static getInstance(): ResearchIntelligenceService {
    if (!ResearchIntelligenceService.instance) {
      ResearchIntelligenceService.instance = new ResearchIntelligenceService();
    }
    return ResearchIntelligenceService.instance;
  }

  /**
   * Ejecuta una investigación estructurada a partir de una consulta en lenguaje natural o trigger.
   */
  public async research(request: SourcingResearchQueryRequest): Promise<SourcingResearchResponse> {
    const startTime = performance.now();
    const { 
      query, 
      country = 'UY', 
      product_family,
      category, 
      period = '7d',
      research_depth = 'ECONOMICO',
      requested_model = 'AUTO',
      result_limit,
      resultLimit,
      force_refresh = false
    } = request;

    const effectiveResultLimit = result_limit || resultLimit || 'AUTO';
    const effectiveFamily = product_family || category || 'ALL';

    // 1. Ejecución vía AI Gateway Central
    let aiResult: any = null;
    let providerName = 'OPENAI';
    let modelName = requested_model && requested_model !== 'AUTO' 
      ? requested_model 
      : (research_depth === 'ECONOMICO' ? 'gpt-4o-mini' : 'gpt-5.6-terra');
    let latencyMs = 0;
    let costUsd: number | null = null;
    let isCached = false;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let totalTokens: number | null = null;
    let gatewayResponse: any = null;

    try {
      gatewayResponse = await aiGateway.execute({
        engine: 'RESEARCH_INTELLIGENCE',
        country: (country as any) || 'UY',
        operation: 'sourcing_market_research',
        prompt: query,
        resultLimit: effectiveResultLimit,
        payload: {
          query,
          country,
          product_family: effectiveFamily,
          productFamily: effectiveFamily,
          category: effectiveFamily,
          period,
          time_scope: period === 'all' ? 'ALL_TIME' : period,
          research_depth,
          requested_model,
          result_limit: effectiveResultLimit,
          resultLimit: effectiveResultLimit,
          evidence: {
            search_query: query,
            target_country: country,
            product_family: effectiveFamily,
            observed_at: new Date().toISOString()
          }
        },
        context: {
          product_family: effectiveFamily,
          productFamily: effectiveFamily,
          category: effectiveFamily,
          research_depth,
          requested_model,
          result_limit: effectiveResultLimit,
          resultLimit: effectiveResultLimit,
          force_refresh
        }
      });

      if (!gatewayResponse.success) {
        throw new Error(gatewayResponse.error || `Error en Gateway (${gatewayResponse.status || 'AI_ERROR'})`);
      }

      aiResult = gatewayResponse.data;
      if ((!aiResult || typeof aiResult === 'string') && gatewayResponse.text) {
        try {
          aiResult = JSON.parse(gatewayResponse.text);
        } catch {
          const match = gatewayResponse.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
          if (match && match[1]) {
            try { aiResult = JSON.parse(match[1].trim()); } catch {}
          }
        }
      }
      providerName = gatewayResponse.provider || 'OPENAI';
      modelName = gatewayResponse.model || modelName;
      latencyMs = gatewayResponse.latency_ms || Math.round(performance.now() - startTime);
      costUsd = gatewayResponse.pricing?.estimated_cost_usd ?? null;
      isCached = Boolean(gatewayResponse.cached || (gatewayResponse.usage && gatewayResponse.usage.totalTokens === 0 && gatewayResponse.status === 'SUCCESS'));
      inputTokens = gatewayResponse.usage?.inputTokens ?? gatewayResponse.usage?.input_tokens ?? null;
      outputTokens = gatewayResponse.usage?.outputTokens ?? gatewayResponse.usage?.output_tokens ?? null;
      totalTokens = gatewayResponse.usage?.totalTokens ?? gatewayResponse.usage?.total_tokens ?? null;
    } catch (err: any) {
      console.error('[ResearchIntelligence] Error en Gateway:', err);
      throw err;
    }

    // 2. Incorporar fuentes reales de Web Search devueltas por el Gateway
    const signals: SourcingSignal[] = [];

    if (Array.isArray(gatewayResponse?.sources) && gatewayResponse.sources.length > 0) {
      gatewayResponse.sources.forEach((src: any, i: number) => {

        signals.push({
          id: `sig-web-${i + 1}-${Date.now()}`,
          source: src.title || src.domain || 'Web Search Source',
          source_type: src.source_type || 'WEB_EDITORIAL',
          country: 'GLOBAL',
          signal_name: `Fuente Web: ${src.title || src.url}`,
          confidence: 90,
          observed_at: src.observed_at || new Date().toISOString(),
          metadata: { url: src.url, domain: src.domain, snippet: src.snippet }
        });
      });
    }

    // Señal base de la consulta del usuario
    signals.push({
      id: `sig-query-${Date.now()}`,
      source: `Investigación ${country}`,
      source_type: 'INTERNAL_DATA',
      country,
      signal_name: `Consulta activa: "${query}"`,
      confidence: 95,
      observed_at: new Date().toISOString()
    });


    // 3. Evaluar Tendencia con el TrendEngine determinístico
    const trendEval = TrendEngine.evaluateTrend({
      topic: query,
      category: category || 'Coleccionismo General',
      country,
      signals,
      internalSearchesCount: 0,
      internalWishlistCount: 0,
      isPreorder: false,
      isNewRelease: false
    });

    const mainTrendCard: SourcingTrendCard = {
      id: `trend-${Date.now()}`,
      topic: query,
      category: category || 'Coleccionables & Figuras',
      status: trendEval.status,
      direction: trendEval.direction,
      market_trend_score: trendEval.market_trend_score,
      collectibles_trend_score: trendEval.collectibles_trend_score,
      composite_trend_score: trendEval.composite_trend_score,
      confidence: trendEval.confidence,
      drivers: trendEval.drivers,
      subtrends: aiResult?.subtrends || ['Líneas principales', 'Exclusivos', 'Preorders'],
      country,
      evidence_count: signals.length,
      observed_signals: signals,
      why_summary: trendEval.why_summary,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 4. Construir Productos Candidatos con Pricing y Opportunity Score determinístico
    let rawItems: any[] = [];
    if (aiResult && typeof aiResult === 'object') {
      if (Array.isArray(aiResult.items)) {
        rawItems = aiResult.items;
      } else if (Array.isArray(aiResult.products)) {
        rawItems = aiResult.products;
      } else if (Array.isArray(aiResult.candidates)) {
        rawItems = aiResult.candidates;
      } else if (Array.isArray(aiResult.results)) {
        rawItems = aiResult.results;
      } else if (Array.isArray(aiResult.discoveries)) {
        rawItems = aiResult.discoveries;
      }
    } else if (Array.isArray(aiResult)) {
      rawItems = aiResult;
    }

    console.log('[FRONTEND_RESEARCH_TRACE]', {
      step: 'SERVICE_INPUT_ITEMS',
      rawItemsCount: rawItems.length,
      gatewaySuccess: gatewayResponse?.success,
      aiResultType: typeof aiResult,
      isAiResultArray: Array.isArray(aiResult)
    });

    let candidates: SourcingProductCandidate[] = Array.isArray(aiResult?.canonical_candidates)
      ? aiResult.canonical_candidates
      : manualCandidates(rawItems, country);

    // 4b. Descubrimiento Multi-Fuente en Vivo (Amazon, eBay, Best Buy) para enriquecer candidatos
    try {
      const multiSourceRes = await multiSourceDiscoveryService.discoverAllSources(query, { maxAmazon: 5, maxEbay: 5 });
      const candidatesBeforeDedupe = candidates.length + multiSourceRes.candidates.length;

      if (multiSourceRes.candidates.length > 0) {
        const additionalRaw = multiSourceRes.candidates.map(c => ({
          title: c.title,
          brand: c.brand,
          url: c.url,
          retailer: c.retailer,
          source_retailer: c.source_retailer || c.retailer,
          origin_price_usd: c.origin_price_usd,
          image_url: c.image_url,
          asin: c.asin,
          discovered_from: c.discovered_from || 'RETAILER_DISCOVERY'
        }));
        const additionalCandidates = manualCandidates(additionalRaw, country);
        candidates = deduplicateCanonicalCandidates([...candidates, ...additionalCandidates]);
      }

      const multiSourceTelemetry = {
        ...multiSourceRes.telemetry,
        web: {
          status: 'AVAILABLE' as const,
          candidates_created: Array.isArray(aiResult?.canonical_candidates) ? aiResult.canonical_candidates.length : rawItems.length
        },
        official: {
          candidates_created: 0
        },
        candidates_before_dedupe: candidatesBeforeDedupe,
        candidates_after_dedupe: candidates.length
      };

      console.log('[MULTI_SOURCE_DISCOVERY_SOURCE_STATUS]', multiSourceTelemetry);

      console.log('[FRONTEND_RESEARCH_TRACE]', {
        step: 'MULTI_SOURCE_DISCOVERY_COMPLETED',
        additionalCandidatesCount: multiSourceRes.candidates.length,
        totalCombinedCandidates: candidates.length,
        sourceStatus: multiSourceRes.sourceStatus,
        telemetry: multiSourceTelemetry
      });
    } catch (multiSourceErr: any) {
      console.warn('[FRONTEND_RESEARCH_WARN] MULTI_SOURCE_DISCOVERY_ERROR', multiSourceErr.message);
    }

    // 5. Enriquecimiento Visual y Comercial Canónico vía Zinc Product Resolver
    // Reutiliza la misma capacidad de búsqueda e imágenes de "Productos para Importar"
    try {
      if (candidates.length > 0) {
        const { resolvedCandidates, telemetry } = await resolveZincProductsForCandidates(candidates);
        candidates = resolvedCandidates;
        console.log('[FRONTEND_RESEARCH_TRACE]', {
          step: 'ZINC_RESOLUTION_COMPLETED',
          candidatesCount: candidates.length,
          telemetry
        });

        // 6. Enriquecimiento Comercial Post-Zinc Canónico
        // Landed Cost, TiendaMía, Mercado Libre UY, Margen y Opportunity Score
        try {
          candidates = await enrichCandidatesCommercialData(candidates, country);
          console.log('[FRONTEND_RESEARCH_TRACE]', {
            step: 'COMMERCIAL_ENRICHMENT_COMPLETED',
            candidatesCount: candidates.length
          });
        } catch (commErr: any) {
          console.warn('[FRONTEND_RESEARCH_WARN] COMMERCIAL_ENRICHMENT_ERROR', commErr.message);
        }
      }
    } catch (zincErr: any) {
      console.warn('[FRONTEND_RESEARCH_WARN] ZINC_RESOLUTION_ERROR', zincErr.message);
    }

    // Query/citation counts do not establish product demand or momentum.
    mainTrendCard.market_trend_score = candidates.length ? Math.max(...candidates.map(c => c.trend_score)) : 0;
    mainTrendCard.collectibles_trend_score = 0;
    mainTrendCard.composite_trend_score = mainTrendCard.market_trend_score;
    mainTrendCard.confidence = 'LOW';
    mainTrendCard.drivers = ['Evaluación por evidencia de cada candidato; demanda interna no verificada'];
    mainTrendCard.why_summary = mainTrendCard.drivers[0];

    console.log('[FRONTEND_RESEARCH_TRACE]', {
      step: 'SERVICE_OUTPUT_ITEMS',
      candidatesCount: candidates.length
    });

    let zeroResultReason: string | undefined = undefined;
    if (candidates.length === 0) {
      if (gatewayResponse?.status === 'UNAUTHORIZED' || gatewayResponse?.status === 'FORBIDDEN') {
        zeroResultReason = 'La investigación fue bloqueada por autenticación o permisos insuficientes.';
      } else if (gatewayResponse?.status === 'OPENAI_ERROR') {
        zeroResultReason = `Error en ejecución de búsqueda web: ${gatewayResponse?.error || 'No se pudo conectar con el proveedor de IA.'}`;
      } else if (gatewayResponse?.fallback_executed) {
        zeroResultReason = `Sin resultados remotos disponibles para "${query}" en el alcance actual.`;
      } else {
        zeroResultReason = `No se encontraron productos oficiales o preventas verificables en la web para "${query}".`;
      }
    }

    return {
      success: true,
      query,
      country,
      product_family: effectiveFamily,
      trends: [mainTrendCard],
      candidates,
      summary: aiResult?.summary || `Investigación completada para "${query}" en ${country}. ${candidates.length} candidatos detectados; consultar WHY para revisar evidencia y datos pendientes.`,
      evidence_count: signals.length,
      latency_ms: latencyMs,
      cost_usd: costUsd,
      provider: providerName,
      model: modelName,
      requested_model: gatewayResponse?.requested_model || requested_model || 'AUTO',
      actual_model: gatewayResponse?.actual_model || modelName,
      automatic_or_manual: gatewayResponse?.automatic_or_manual || (requested_model && requested_model !== 'AUTO' ? 'MANUAL' : 'AUTO'),
      cached: isCached,
      research_depth,
      result_limit: effectiveResultLimit,
      batch_telemetry: gatewayResponse?.batch_telemetry || undefined,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      zero_result_reason: zeroResultReason
    };
  }

  private generateLocalResearchFallback(query: string, country: string): any {
    return {
      summary: `Sin registros remotos directos para "${query}" en ${country}. Mostrando estado real vacío.`,
      confidence: 0.50,
      subtrends: [],
      items: []
    };
  }
}

export const researchIntelligenceService = ResearchIntelligenceService.getInstance();

