// ============================================================
// COLLECTIBLES 2026 — RESEARCH COST OPTIMIZER & PRICING ENGINE
// Central server-side logic for cheap-first model routing,
// token estimation, pre-flight analysis, and multi-tier cache.
// ZERO PAID OPENAI REQUESTS are executed in this module.
// ============================================================

import crypto from 'crypto';
import { getModelPricingRates, calculateOpenAICost, validateRequestedModel } from './openaiPricing.js';

export const RESEARCH_MODES = Object.freeze({
  ECONOMICO: {
    key: 'ECONOMICO',
    label: '⚡ Económico',
    model: 'gpt-4o-mini',
    fallbackModel: 'gpt-5.6-luna',
    maxCandidates: 5,
    maxOutputTokens: 600,
    searchDepth: 'QUICK',
    expectedWebInputTokensMin: 16500,
    expectedWebInputTokensMax: 26000,
    expectedWebInputTokens: 21000,
    expectedWebOutputTokensMin: 250,
    expectedWebOutputTokensMax: 600,
    expectedWebOutputTokens: 450,
    noWebInputTokensMin: 300,
    noWebInputTokensMax: 1500,
    noWebInputTokens: 600,
    noWebOutputTokensMin: 200,
    noWebOutputTokensMax: 600,
    noWebOutputTokens: 350,
    timeoutMs: 35000,
    webSearchToolCostUsd: 0,
    targetCostMaxUsd: 0.01
  },
  ESTANDAR: {
    key: 'ESTANDAR',
    label: '🔎 Estándar',
    model: 'gpt-5.6-terra',
    fallbackModel: 'gpt-4o',
    maxCandidates: 8,
    maxOutputTokens: 750,
    searchDepth: 'STANDARD',
    expectedWebInputTokensMin: 22000,
    expectedWebInputTokensMax: 36000,
    expectedWebInputTokens: 28000,
    expectedWebOutputTokensMin: 350,
    expectedWebOutputTokensMax: 750,
    expectedWebOutputTokens: 600,
    noWebInputTokensMin: 500,
    noWebInputTokensMax: 2500,
    noWebInputTokens: 1000,
    noWebOutputTokensMin: 300,
    noWebOutputTokensMax: 750,
    noWebOutputTokens: 500,
    timeoutMs: 45000,
    webSearchToolCostUsd: 0,
    targetCostMaxUsd: 0.05
  },
  PROFUNDO: {
    key: 'PROFUNDO',
    label: '🧠 Profundo',
    model: 'gpt-5.6-terra',
    fallbackModel: 'gpt-5.6-sol',
    maxCandidates: 15,
    maxOutputTokens: 1200,
    searchDepth: 'DEEP',
    expectedWebInputTokensMin: 30000,
    expectedWebInputTokensMax: 58000,
    expectedWebInputTokens: 42000,
    expectedWebOutputTokensMin: 500,
    expectedWebOutputTokensMax: 1200,
    expectedWebOutputTokens: 900,
    noWebInputTokensMin: 800,
    noWebInputTokensMax: 4000,
    noWebInputTokens: 1800,
    noWebOutputTokensMin: 400,
    noWebOutputTokensMax: 1200,
    noWebOutputTokens: 800,
    timeoutMs: 60000,
    webSearchToolCostUsd: 0,
    targetCostMaxUsd: 0.10
  }
});

export const COST_THRESHOLDS = Object.freeze({
  LOW_MAX_USD: 0.01,
  NORMAL_MAX_USD: 0.02,
  CONFIRMATION_WARNING_USD: 0.02,
  HARD_LIMIT_USD: 0.15
});

/**
 * Deterministic Query Complexity Analyzer (Zero OpenAI calls)
 * Evaluates multi-entity keywords, scope modifiers, and length to adjust token ranges accurately.
 */
export function analyzeQueryComplexity(query) {
  if (!query || typeof query !== 'string') {
    return {
      factor: 1.0,
      confidence: 'HIGH',
      confidence_label: 'Alta precisión (calibrada con telemetría web)',
      reasons: []
    };
  }

  const norm = query.toLowerCase().trim();
  let factor = 1.0;
  const reasons = [];

  // Multi-entity separators & comparative intent
  if (/\b(vs|contra|y|o|,|\/)\b/i.test(norm)) {
    factor += 0.05;
    reasons.push('múltiples entidades o comparativas');
  }

  // Broad / aggregation terms
  if (/\b(todas?|todos|linea completa|completa|coleccion|resumen|catalogo|mejores|tendencias|mercado|diferencias)\b/i.test(norm)) {
    factor += 0.05;
    reasons.push('alcance de búsqueda amplio');
  }

  // Query length / detailed description
  const wordCount = norm.split(/\s+/).filter(Boolean).length;
  if (norm.length > 80 || wordCount > 10) {
    factor += 0.05;
    reasons.push('longitud de consulta detallada');
  }

  // Cap complexity factor between 1.0 and 1.25
  const finalFactor = Number(Math.min(1.25, Math.max(1.0, factor)).toFixed(2));

  let confidence = 'HIGH';
  let confidence_label = 'Alta precisión (calibrada con telemetría web)';
  if (finalFactor >= 1.15) {
    confidence = 'MEDIUM';
    confidence_label = 'Precisión moderada (consulta compleja / multi-entidad)';
  }

  return {
    factor: finalFactor,
    confidence,
    confidence_label,
    reasons
  };
}

/**
 * Normalizes query string for caching and deduplication
 */
export function normalizeQuery(query) {
  if (!query || typeof query !== 'string') return '';
  return query
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates deterministic cache key for research queries
 * Global research cache is reusable across countries!
 */
export function generateResearchCacheKey(query, scope = 'GLOBAL', depth = 'ECONOMICO', model = 'AUTO') {
  const normQuery = normalizeQuery(query);
  const normDepth = (depth || 'ECONOMICO').toUpperCase();
  const normModel = (model && model !== 'AUTO') ? String(model).toLowerCase().trim() : 'AUTO';
  const rawKey = `${normQuery}|${scope}|${normDepth}|${normModel}`;
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Resolves research mode configuration with safe fallback to ECONOMICO
 */
export function resolveResearchMode(modeInput) {
  if (!modeInput) return RESEARCH_MODES.ECONOMICO;
  const upper = String(modeInput).toUpperCase().trim();
  if (upper === 'ECONOMICO' || upper === 'QUICK' || upper === 'FAST') {
    return RESEARCH_MODES.ECONOMICO;
  }
  if (upper === 'ESTANDAR' || upper === 'STANDARD' || upper === 'BALANCED') {
    return RESEARCH_MODES.ESTANDAR;
  }
  if (upper === 'PROFUNDO' || upper === 'DEEP' || upper === 'REASONING') {
    return RESEARCH_MODES.PROFUNDO;
  }
  return RESEARCH_MODES.ECONOMICO;
}

/**
 * Local conservative token estimation (1 token ≈ 4 characters for Spanish/English + JSON overhead)
 * ZERO OpenAI calls.
 */
export function estimateTokensLocally(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(str.length / 3.8);
}

/**
 * Generates compact targeted prompt instructions for web research based on mode
 */
export function buildOptimizedResearchPrompt(query, country = 'UY', modeConfig = RESEARCH_MODES.ECONOMICO) {
  const currentYear = new Date().getFullYear();
  const maxItems = modeConfig.maxCandidates;

  return `INVESTIGACIÓN COMERCIAL SOURCING (MODO: ${modeConfig.key}):
Consulta: "${query}"
Año actual: ${currentYear}
Mercado objetivo: ${country} (Buscar lanzamientos GLOBALES y evaluar disponibilidad).
Instrucciones:
1. Identifica hasta ${maxItems} productos oficiales reales, preventas o lanzamientos recientes relevantes.
2. NUNCA inventes precios, costos ni stock.
3. Devuelve ÚNICAMENTE un JSON compacto con la siguiente estructura:
{"summary":string,"confidence":number_0_to_1,"subtrends":string[],"items":[{"title":string,"brand":string,"franchise":string,"category":string,"origin_price_usd":number_or_null,"asin":string_or_null,"url":string_or_null,"retailer":string,"is_preorder":boolean,"is_new":boolean,"release_date":string_or_null,"evidence_snippet":string}]}`;
}

/**
 * Pre-Flight Cost & Token Estimator
 * Computes exact ranges locally without executing any paid OpenAI call.
 */
export function calculatePreFlightEstimate({
  query,
  country = 'UY',
  researchDepth = 'ECONOMICO',
  requestedModel = 'AUTO',
  isWebSearch = true,
  cacheInfo = null
}) {
  const mode = resolveResearchMode(researchDepth);
  const prompt = buildOptimizedResearchPrompt(query, country, mode);
  const basePromptTokens = estimateTokensLocally(prompt);
  const complexity = analyzeQueryComplexity(query);

  // Validate manual model override
  const modelValidation = validateRequestedModel(requestedModel, {
    engine: 'RESEARCH_INTELLIGENCE',
    requiresWebSearch: isWebSearch
  });

  const isManualOverride = !modelValidation.isAuto && modelValidation.valid;
  const targetModel = isManualOverride ? modelValidation.model : mode.model;

  // Web search tool brings extra document tokens depending on research depth
  const rawInputMin = isWebSearch ? mode.expectedWebInputTokensMin : (mode.noWebInputTokensMin || 300);
  const rawInputExpected = isWebSearch ? mode.expectedWebInputTokens : (mode.noWebInputTokens || 600);
  const rawInputMax = isWebSearch ? mode.expectedWebInputTokensMax : (mode.noWebInputTokensMax || 1500);

  const rawOutputMin = isWebSearch ? mode.expectedWebOutputTokensMin : (mode.noWebOutputTokensMin || 200);
  const rawOutputExpected = isWebSearch ? mode.expectedWebOutputTokens : (mode.noWebOutputTokens || 350);
  const rawOutputMax = isWebSearch ? (mode.expectedWebOutputTokensMax || mode.maxOutputTokens) : (mode.noWebOutputTokensMax || mode.maxOutputTokens);

  // Adjust input tokens with query complexity factor (bounded 1.0 - 1.25)
  const estimatedInputTokensMin = Math.round(basePromptTokens + rawInputMin);
  const estimatedInputTokensExpected = Math.round((basePromptTokens + rawInputExpected) * complexity.factor);
  const estimatedInputTokensMax = Math.round((basePromptTokens + rawInputMax) * complexity.factor);

  const estimatedOutputTokensMin = rawOutputMin;
  const estimatedOutputTokensExpected = Math.round(rawOutputExpected * (complexity.factor > 1.1 ? 1.08 : 1.0));
  const maxOutputTokens = rawOutputMax;

  const rates = getModelPricingRates(targetModel);
  const inputRate = rates?.inputPer1M || 0.15;
  const outputRate = rates?.outputPer1M || 0.60;

  // Base token costs
  const minInputCostUsd = (estimatedInputTokensMin / 1_000_000) * inputRate;
  const expectedInputCostUsd = (estimatedInputTokensExpected / 1_000_000) * inputRate;
  const maxInputCostUsd = (estimatedInputTokensMax / 1_000_000) * inputRate;

  const minOutputCostUsd = (estimatedOutputTokensMin / 1_000_000) * outputRate;
  const expectedOutputCostUsd = (estimatedOutputTokensExpected / 1_000_000) * outputRate;
  const maxOutputCostUsd = (maxOutputTokens / 1_000_000) * outputRate;

  // Total ranges
  const minTotalUsd = Number((minInputCostUsd + minOutputCostUsd).toFixed(5));
  const expectedTotalUsd = Number((expectedInputCostUsd + expectedOutputCostUsd).toFixed(5));
  const maxTotalUsd = Number((maxInputCostUsd + maxOutputCostUsd).toFixed(5));

  const isCacheHit = Boolean(cacheInfo && (cacheInfo.status === 'HIT' || cacheInfo.status === 'HIT_DISCOVERIES'));
  const requiresConfirmation = !isCacheHit && (maxTotalUsd > COST_THRESHOLDS.CONFIRMATION_WARNING_USD || (isManualOverride && maxTotalUsd > 0.015));
  const isHardLimit = !isCacheHit && maxTotalUsd > COST_THRESHOLDS.HARD_LIMIT_USD;

  // Compute cheaper alternative comparison against AUTO / ECONOMICO
  let cheaperAlternative = null;
  if (!isCacheHit) {
    if (isManualOverride) {
      const autoRates = getModelPricingRates(mode.model);
      const autoInputCost = (estimatedInputTokensMax / 1_000_000) * (autoRates?.inputPer1M || 0.15);
      const autoOutputCost = (mode.maxOutputTokens / 1_000_000) * (autoRates?.outputPer1M || 0.60);
      const autoMaxTotal = Number((autoInputCost + autoOutputCost).toFixed(5));
      const costMultiplier = autoMaxTotal > 0 ? Number((maxTotalUsd / autoMaxTotal).toFixed(1)) : 1;
      const savingsPercent = maxTotalUsd > autoMaxTotal 
        ? Math.round(((maxTotalUsd - autoMaxTotal) / maxTotalUsd) * 100)
        : 0;

      if (savingsPercent > 10 || costMultiplier > 1.2) {
        cheaperAlternative = {
          mode: mode.key,
          model: mode.model,
          label: `🤖 Automático (${mode.model})`,
          estimated_max_cost_usd: autoMaxTotal,
          cost_multiplier: costMultiplier,
          savings_percent: savingsPercent
        };
      }
    } else if (mode.key !== 'ECONOMICO') {
      const econMode = RESEARCH_MODES.ECONOMICO;
      const econRates = getModelPricingRates(econMode.model);
      const econInputCost = (estimatedInputTokensMax / 1_000_000) * (econRates?.inputPer1M || 0.15);
      const econOutputCost = (econMode.maxOutputTokens / 1_000_000) * (econRates?.outputPer1M || 0.60);
      const econMaxTotal = Number((econInputCost + econOutputCost).toFixed(5));
      const costMultiplier = econMaxTotal > 0 ? Number((maxTotalUsd / econMaxTotal).toFixed(1)) : 1;
      const savingsPercent = maxTotalUsd > econMaxTotal 
        ? Math.round(((maxTotalUsd - econMaxTotal) / maxTotalUsd) * 100)
        : 0;

      if (savingsPercent > 10 || costMultiplier > 1.2) {
        cheaperAlternative = {
          mode: 'ECONOMICO',
          model: econMode.model,
          label: '⚡ Modo Económico (gpt-4o-mini)',
          estimated_max_cost_usd: econMaxTotal,
          cost_multiplier: costMultiplier,
          savings_percent: savingsPercent
        };
      }
    }
  }

  return {
    model: targetModel,
    display_name: modelValidation.display_name || targetModel,
    requested_model: requestedModel || 'AUTO',
    automatic_or_manual: isManualOverride ? 'MANUAL' : 'AUTO',
    is_manual_override: isManualOverride,
    model_validation: modelValidation,
    fallback_model: mode.fallbackModel,
    research_depth: mode.key,
    research_depth_label: mode.label,
    max_candidates: mode.maxCandidates,
    estimated_input_tokens: estimatedInputTokensExpected,
    estimated_input_tokens_min: estimatedInputTokensMin,
    estimated_input_tokens_expected: estimatedInputTokensExpected,
    estimated_input_tokens_max: estimatedInputTokensMax,
    estimated_output_tokens_min: estimatedOutputTokensMin,
    estimated_output_tokens_expected: estimatedOutputTokensExpected,
    max_output_tokens: maxOutputTokens,
    estimated_input_cost_usd: Number(expectedInputCostUsd.toFixed(6)),
    estimated_output_cost_usd: Number(expectedOutputCostUsd.toFixed(6)),
    estimated_cost_min_usd: isCacheHit ? 0 : minTotalUsd,
    estimated_cost_expected_usd: isCacheHit ? 0 : expectedTotalUsd,
    estimated_cost_max_usd: isCacheHit ? 0 : maxTotalUsd,
    estimated_total_min_usd: isCacheHit ? 0 : minTotalUsd,
    estimated_total_max_usd: isCacheHit ? 0 : maxTotalUsd,
    estimated_total_avg_usd: isCacheHit ? 0 : expectedTotalUsd,
    web_search_planned: isWebSearch,
    query_complexity: complexity,
    confidence: complexity.confidence,
    confidence_label: complexity.confidence_label,
    cache: cacheInfo || { status: 'MISS', age_seconds: null },
    requires_confirmation: requiresConfirmation,
    hard_limit_exceeded: isHardLimit,
    warning_threshold_usd: COST_THRESHOLDS.CONFIRMATION_WARNING_USD,
    cheaper_alternative: cheaperAlternative,
    pricing_source: rates?.source || 'CENTRAL_REGISTRY',
    openai_calls_used: 0
  };
}
