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
    expectedWebInputTokensMin: 6500,
    expectedWebInputTokensMax: 9000,
    expectedWebInputTokens: 7800,
    timeoutMs: 35000,
    webSearchToolCostUsd: 0.005,
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
    expectedWebInputTokensMin: 12000,
    expectedWebInputTokensMax: 18000,
    expectedWebInputTokens: 15000,
    timeoutMs: 45000,
    webSearchToolCostUsd: 0.008,
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
    expectedWebInputTokensMin: 20000,
    expectedWebInputTokensMax: 35000,
    expectedWebInputTokens: 28000,
    timeoutMs: 60000,
    webSearchToolCostUsd: 0.015,
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
export function generateResearchCacheKey(query, scope = 'GLOBAL', depth = 'ECONOMICO') {
  const normQuery = normalizeQuery(query);
  const normDepth = (depth || 'ECONOMICO').toUpperCase();
  const rawKey = `${normQuery}|${scope}|${normDepth}`;
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

  // Validate manual model override
  const modelValidation = validateRequestedModel(requestedModel, {
    engine: 'RESEARCH_INTELLIGENCE',
    requiresWebSearch: isWebSearch
  });

  const isManualOverride = !modelValidation.isAuto && modelValidation.valid;
  const targetModel = isManualOverride ? modelValidation.model : mode.model;

  // Web search tool brings extra document tokens depending on research depth
  const minWebTokens = isWebSearch ? (mode.expectedWebInputTokensMin || mode.expectedWebInputTokens) : 0;
  const maxWebTokens = isWebSearch ? (mode.expectedWebInputTokensMax || mode.expectedWebInputTokens) : 0;
  const avgWebTokens = isWebSearch ? mode.expectedWebInputTokens : 0;

  const estimatedInputTokensMin = basePromptTokens + minWebTokens;
  const estimatedInputTokensMax = basePromptTokens + maxWebTokens;
  const estimatedInputTokensAvg = basePromptTokens + avgWebTokens;

  const maxOutputTokens = mode.maxOutputTokens;
  const expectedMinOutputTokens = Math.max(150, Math.floor(maxOutputTokens * 0.45));
  const expectedAvgOutputTokens = Math.floor(maxOutputTokens * 0.8);

  const rates = getModelPricingRates(targetModel);
  const inputRate = rates?.inputPer1M || 0.15;
  const outputRate = rates?.outputPer1M || 0.60;

  // Base token costs
  const minInputCostUsd = (estimatedInputTokensMin / 1_000_000) * inputRate;
  const maxInputCostUsd = (estimatedInputTokensMax / 1_000_000) * inputRate;
  const avgInputCostUsd = (estimatedInputTokensAvg / 1_000_000) * inputRate;

  const minOutputCostUsd = (expectedMinOutputTokens / 1_000_000) * outputRate;
  const maxOutputCostUsd = (maxOutputTokens / 1_000_000) * outputRate;
  const avgOutputCostUsd = (expectedAvgOutputTokens / 1_000_000) * outputRate;

  // Total ranges
  const minTotalUsd = Number((minInputCostUsd + minOutputCostUsd).toFixed(5));
  const maxTotalUsd = Number((maxInputCostUsd + maxOutputCostUsd).toFixed(5));
  const avgTotalUsd = Number((avgInputCostUsd + avgOutputCostUsd).toFixed(5));

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
    estimated_input_tokens: estimatedInputTokensAvg,
    estimated_input_tokens_min: estimatedInputTokensMin,
    estimated_input_tokens_max: estimatedInputTokensMax,
    max_output_tokens: maxOutputTokens,
    estimated_input_cost_usd: Number(avgInputCostUsd.toFixed(6)),
    estimated_output_cost_usd: Number(avgOutputCostUsd.toFixed(6)),
    estimated_total_min_usd: isCacheHit ? 0 : minTotalUsd,
    estimated_total_max_usd: isCacheHit ? 0 : maxTotalUsd,
    estimated_total_avg_usd: isCacheHit ? 0 : avgTotalUsd,
    web_search_planned: isWebSearch,
    cache: cacheInfo || { status: 'MISS', age_seconds: null },
    requires_confirmation: requiresConfirmation,
    hard_limit_exceeded: isHardLimit,
    warning_threshold_usd: COST_THRESHOLDS.CONFIRMATION_WARNING_USD,
    cheaper_alternative: cheaperAlternative,
    pricing_source: rates?.source || 'CENTRAL_REGISTRY',
    openai_calls_used: 0
  };
}
