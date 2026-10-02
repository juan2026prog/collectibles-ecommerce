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
    maxCandidates: 15,
    maxOutputTokens: 1200,
    searchDepth: 'QUICK',
    expectedWebInputTokensMin: 16500,
    expectedWebInputTokensMax: 26000,
    expectedWebInputTokens: 21000,
    expectedWebOutputTokensMin: 400,
    expectedWebOutputTokensMax: 1200,
    expectedWebOutputTokens: 800,
    noWebInputTokensMin: 300,
    noWebInputTokensMax: 1500,
    noWebInputTokens: 600,
    noWebOutputTokensMin: 200,
    noWebOutputTokensMax: 800,
    noWebOutputTokens: 450,
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

export const COLLECTIBLES_PRODUCT_FAMILIES = Object.freeze([
  { id: 'ALL', label: 'Todos' },
  { id: 'FIGURES', label: 'Figuras' },
  { id: 'STATUES_BUSTS', label: 'Estatuas y Bustos' },
  { id: 'PLUSH', label: 'Peluches' },
  { id: 'COMICS_MANGA', label: 'Cómics y Manga' },
  { id: 'TCG_CARDS', label: 'TCG y Cartas' },
  { id: 'APPAREL_ACCESSORIES', label: 'Ropa y Accesorios' },
  { id: 'BUILDING_SETS', label: 'Building Sets / LEGO' },
  { id: 'BOARD_GAMES', label: 'Board Games' },
  { id: 'PUZZLES', label: 'Puzzles' },
  { id: 'REPLICAS_PROPS', label: 'Réplicas y Props' },
  { id: 'VEHICLES', label: 'Vehículos' },
  { id: 'OTHER_COLLECTIBLES', label: 'Otros Coleccionables' }
]);

export function normalizeProductFamily(family) {
  if (!family || typeof family !== 'string') return 'ALL';
  const clean = family.trim().toUpperCase();
  const matched = COLLECTIBLES_PRODUCT_FAMILIES.find(f => f.id === clean || f.label.toUpperCase() === clean);
  return matched ? matched.id : 'ALL';
}

/**
 * Generates deterministic cache key for research queries
 * Global research cache is reusable across countries!
 */
export function normalizeResultLimit(limitInput) {
  if (limitInput === undefined || limitInput === null || limitInput === '' || limitInput === 'AUTO') {
    return 'AUTO';
  }
  const n = parseInt(String(limitInput), 10);
  if (n === 10) return 10;
  if (n === 25) return 25;
  if (n === 50) return 50;
  if (n === 100) return 100;
  return 'AUTO';
}

export function planResearchBatches(resultLimit, modeConfig = RESEARCH_MODES.ECONOMICO) {
  const normLimit = normalizeResultLimit(resultLimit);
  if (normLimit === 'AUTO') {
    // Default safe limit: 15 products in 1 batch for ECONOMICO, 8 for ESTANDAR, 15 for PROFUNDO
    const limitNum = modeConfig.maxCandidates || 15;
    return {
      resultLimit: 'AUTO',
      targetCount: limitNum,
      batchCount: 1,
      batchSize: limitNum,
      batches: [{ batchIndex: 1, targetCount: limitNum, maxOutputTokens: modeConfig.maxOutputTokens || 1200 }]
    };
  }

  const targetCount = Number(normLimit);
  // Batch sizing: For 10 -> 1 batch of 10
  // For 25 -> 2 batches (15, 10) or 2 batches of 15
  // For 50 -> 3 batches (20, 20, 15)
  // For 100 -> 5 batches (20, 20, 20, 20, 20)
  let batchCount = 1;
  let batches = [];

  if (targetCount === 10) {
    batchCount = 1;
    batches = [{ batchIndex: 1, targetCount: 10, maxOutputTokens: 900 }];
  } else if (targetCount === 25) {
    batchCount = 2;
    batches = [
      { batchIndex: 1, targetCount: 15, maxOutputTokens: 1200 },
      { batchIndex: 2, targetCount: 10, maxOutputTokens: 900 }
    ];
  } else if (targetCount === 50) {
    batchCount = 3;
    batches = [
      { batchIndex: 1, targetCount: 20, maxOutputTokens: 1500 },
      { batchIndex: 2, targetCount: 20, maxOutputTokens: 1500 },
      { batchIndex: 3, targetCount: 15, maxOutputTokens: 1200 }
    ];
  } else if (targetCount === 100) {
    batchCount = 5;
    batches = [
      { batchIndex: 1, targetCount: 20, maxOutputTokens: 1500 },
      { batchIndex: 2, targetCount: 20, maxOutputTokens: 1500 },
      { batchIndex: 3, targetCount: 20, maxOutputTokens: 1500 },
      { batchIndex: 4, targetCount: 20, maxOutputTokens: 1500 },
      { batchIndex: 5, targetCount: 20, maxOutputTokens: 1500 }
    ];
  } else {
    batchCount = 1;
    batches = [{ batchIndex: 1, targetCount: targetCount, maxOutputTokens: 1200 }];
  }

  return {
    resultLimit: normLimit,
    targetCount,
    batchCount,
    batchSize: batches[0]?.targetCount || 15,
    batches
  };
}

/**
 * Generates deterministic cache key for research queries
 * Global research cache is reusable across countries!
 */
export function generateResearchCacheKey(query, scope = 'GLOBAL', depth = 'ECONOMICO', model = 'AUTO', timeScope = 'ALL_TIME', productFamily = 'ALL', resultLimit = 'AUTO') {
  const normQuery = normalizeQuery(query);
  const normDepth = (depth || 'ECONOMICO').toUpperCase();
  const normModel = (model && model !== 'AUTO') ? String(model).toLowerCase().trim() : 'AUTO';
  const normTime = (timeScope || 'ALL_TIME').toUpperCase();
  const normFamily = normalizeProductFamily(productFamily);
  const normLimit = normalizeResultLimit(resultLimit);
  const rawKey = `${normQuery}|${scope}|${normDepth}|${normModel}|${normTime}|${normFamily}|${normLimit}`;
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
export function buildOptimizedResearchPrompt(query, country = 'UY', modeConfig = RESEARCH_MODES.ECONOMICO, timeScope = 'ALL_TIME', productFamily = 'ALL', resultLimit = 'AUTO', batchContext = null) {
  const currentYear = new Date().getFullYear();
  const batchPlan = planResearchBatches(resultLimit, modeConfig);
  const maxItems = batchContext?.targetCount || (resultLimit && resultLimit !== 'AUTO' ? Number(resultLimit) : modeConfig.maxCandidates);
  const normFamily = normalizeProductFamily(productFamily);
  const familyObj = COLLECTIBLES_PRODUCT_FAMILIES.find(f => f.id === normFamily);
  const familyLabel = familyObj ? familyObj.label : 'Todos';

  const timeLabel = timeScope === '24h' 
    ? 'Últimas 24 horas'
    : timeScope === '7d' 
    ? 'Últimos 7 días'
    : timeScope === '30d' 
      ? 'Últimos 30 días'
      : timeScope === '90d' 
        ? 'Últimos 90 días' 
        : 'Sin límite temporal (todo catálogo y lanzamientos activos)';

  const targetCountryLabel = (!country || country === 'ALL' || country === 'GLOBAL') 
    ? 'GLOBAL (Oportunidades internacionales sin restricción de país único)' 
    : country;

  const familyInstruction = normFamily !== 'ALL'
    ? `\nRestricción de familia de producto: Restringir resultados estrictamente a la familia ${familyLabel} (${normFamily}). Si la consulta busca una franquicia o personaje, listar coleccionables que pertenezcan a esta categoría.`
    : '';

  const batchInstruction = batchContext?.excludeTitles && batchContext.excludeTitles.length > 0
    ? `\nLote actual: ${batchContext.batchIndex} de ${batchContext.totalBatches}. EXCLUIR los siguientes productos ya descubiertos en lotes anteriores para garantizar diversidad: ${batchContext.excludeTitles.slice(0, 15).join('; ')}.`
    : '';

  return `INVESTIGACIÓN COMERCIAL SOURCING (MODO: ${modeConfig.key}):
Consulta: "${query}"
Año actual: ${currentYear}
Mercado objetivo comercial: ${targetCountryLabel}
Alcance de descubrimiento: GLOBAL (fabricantes oficiales, retailers internacionales y tiendas globales)
Ventana temporal: ${timeLabel}
Familia de producto: ${familyLabel}${familyInstruction}${batchInstruction}

Instrucciones:
1. Resuelve alias multilingües si la consulta está en español (ej. "ositos cariñosos" -> "Care Bears", "caballeros del zodiaco" -> "Saint Seiya", "tortugas ninja" -> "TMNT / Teenage Mutant Ninja Turtles", etc.) para descubrir productos oficiales existentes en el mercado global.
2. Identifica hasta ${maxItems} productos oficiales reales y relevantes, priorizando diversidad de productos y fuentes (fabricantes oficiales, retailers, marketplaces y anuncios de lanzamientos). Si hay menos productos verificables con evidencia suficiente, incluye únicamente los confirmados.
3. Si la consulta menciona preventas o novedades ("nuevos", "lanzamientos", "preventa"), prioriza lanzamientos recientes; de lo contrario, incluye los coleccionables oficiales más demandados del catálogo.
4. NUNCA inventes precios, costos ni stock. NUNCA inventes productos no verificados. Si un dato no es verificable, devuelve null.
5. Devuelve ÚNICAMENTE un JSON compacto con la siguiente estructura:
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
  timeScope = 'ALL_TIME',
  productFamily = 'ALL',
  product_family,
  resultLimit = 'AUTO',
  cacheInfo = null
}) {
  const effectiveFamily = productFamily !== 'ALL' ? productFamily : (product_family || 'ALL');
  const mode = resolveResearchMode(researchDepth);
  const normLimit = normalizeResultLimit(resultLimit);
  const batchPlan = planResearchBatches(normLimit, mode);

  const prompt = buildOptimizedResearchPrompt(query, country, mode, timeScope, effectiveFamily, normLimit);
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
  const rawInputMinPerBatch = isWebSearch ? mode.expectedWebInputTokensMin : (mode.noWebInputTokensMin || 300);
  const rawInputExpectedPerBatch = isWebSearch ? mode.expectedWebInputTokens : (mode.noWebInputTokens || 600);
  const rawInputMaxPerBatch = isWebSearch ? mode.expectedWebInputTokensMax : (mode.noWebInputTokensMax || 1500);

  // Output tokens per batch
  const defaultBatchMax = isWebSearch ? (batchPlan.batches[0]?.maxOutputTokens || mode.maxOutputTokens) : (mode.noWebOutputTokensMax || 750);
  const singleBatchMaxOutput = defaultBatchMax;
  const rawOutputMinPerBatch = isWebSearch ? mode.expectedWebOutputTokensMin : (mode.noWebOutputTokensMin || 200);
  const rawOutputExpectedPerBatch = Math.round(singleBatchMaxOutput * 0.65);
  const rawOutputMaxPerBatch = singleBatchMaxOutput;

  // Single batch token calculations
  const singleBatchInputMin = Math.round(basePromptTokens + rawInputMinPerBatch);
  const singleBatchInputExpected = Math.round((basePromptTokens + rawInputExpectedPerBatch) * complexity.factor);
  const singleBatchInputMax = Math.round((basePromptTokens + rawInputMaxPerBatch) * complexity.factor);

  const singleBatchOutputMin = rawOutputMinPerBatch;
  const singleBatchOutputExpected = Math.round(rawOutputExpectedPerBatch * (complexity.factor > 1.1 ? 1.08 : 1.0));
  const singleBatchOutputMax = rawOutputMaxPerBatch;

  // TOTAL across all planned batches
  const numBatches = batchPlan.batchCount;
  const estimatedInputTokensMin = singleBatchInputMin * numBatches;
  const estimatedInputTokensExpected = singleBatchInputExpected * numBatches;
  const estimatedInputTokensMax = singleBatchInputMax * numBatches;

  const estimatedOutputTokensMin = singleBatchOutputMin * numBatches;
  const estimatedOutputTokensExpected = singleBatchOutputExpected * numBatches;
  const maxOutputTokens = singleBatchOutputMax * numBatches;

  const rates = getModelPricingRates(targetModel);
  const inputRate = rates?.inputPer1M || 0.15;
  const outputRate = rates?.outputPer1M || 0.60;

  // Base token costs across ALL batches
  const minInputCostUsd = (estimatedInputTokensMin / 1_000_000) * inputRate;
  const expectedInputCostUsd = (estimatedInputTokensExpected / 1_000_000) * inputRate;
  const maxInputCostUsd = (estimatedInputTokensMax / 1_000_000) * inputRate;

  const minOutputCostUsd = (estimatedOutputTokensMin / 1_000_000) * outputRate;
  const expectedOutputCostUsd = (estimatedOutputTokensExpected / 1_000_000) * outputRate;
  const maxOutputCostUsd = (maxOutputTokens / 1_000_000) * outputRate;

  // Total ranges across all batches
  const minTotalUsd = Number((minInputCostUsd + minOutputCostUsd).toFixed(5));
  const expectedTotalUsd = Number((expectedInputCostUsd + expectedOutputCostUsd).toFixed(5));
  const maxTotalUsd = Number((maxInputCostUsd + maxOutputCostUsd).toFixed(5));

  const isCacheHit = Boolean(cacheInfo && (cacheInfo.status === 'HIT' || cacheInfo.status === 'HIT_DISCOVERIES'));
  const isBudgetWarning = !isCacheHit && (maxTotalUsd > (COST_THRESHOLDS.CONFIRMATION_WARNING_USD * numBatches) || (isManualOverride && maxTotalUsd > 0.015));
  const isHardLimit = !isCacheHit && maxTotalUsd > (COST_THRESHOLDS.HARD_LIMIT_USD * Math.max(1, numBatches * 0.7));

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

  const normFamily = normalizeProductFamily(effectiveFamily);
  const familyObj = COLLECTIBLES_PRODUCT_FAMILIES.find(f => f.id === normFamily);

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
    product_family: normFamily,
    product_family_label: familyObj ? familyObj.label : 'Todos',
    result_limit: normLimit,
    requested_result_limit: normLimit,
    max_candidates: batchPlan.targetCount,
    batches_planned: batchPlan.batchCount,
    batch_plan: batchPlan,
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
    search_scope: 'GLOBAL',
    target_country: country,
    time_scope: timeScope,
    query_complexity: complexity,
    confidence: complexity.confidence,
    confidence_label: complexity.confidence_label,
    cache: cacheInfo || { status: 'MISS', age_seconds: null },
    requires_confirmation: isBudgetWarning,
    hard_limit_exceeded: isHardLimit,
    warning_threshold_usd: COST_THRESHOLDS.CONFIRMATION_WARNING_USD * numBatches,
    cheaper_alternative: cheaperAlternative,
    pricing_source: rates?.source || 'CENTRAL_REGISTRY',
    openai_calls_used: 0
  };
}

/**
 * Normalizes title for deduplication without losing legitimate variants
 * e.g., "Care Bears Cheer Bear 14 inch Plush" vs "Care Bears Grumpy Bear 14 inch Plush" are DISTINCT.
 */
export function normalizeTitleForDedupe(title) {
  if (!title || typeof title !== 'string') return '';
  const cleaned = title
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(inch|inches)\b/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Sort distinct word tokens to catch minor title rearrangements across retailers
  return cleaned.split(' ').filter(Boolean).sort().join(' ');
}

/**
 * Global Deduplicator for Sourcing Candidates across batches
 * Deduplicates by exact ASIN/SKU, exact normalized title, or brand+character+scale combination.
 * Attaches multi-source evidence array when duplicates are merged!
 */
export function deduplicateResearchCandidates(existingList = [], incomingList = []) {
  const merged = [...existingList];
  const seenAsins = new Set();
  const seenTitles = new Set();
  const seenKeys = new Set();

  // Populate seen sets with existing items
  for (const item of merged) {
    if (item.asin && typeof item.asin === 'string') {
      seenAsins.add(item.asin.toUpperCase().trim());
    }
    const normT = normalizeTitleForDedupe(item.title);
    if (normT) seenTitles.add(normT);
    const key = `${(item.brand || '').toLowerCase().trim()}|${(item.franchise || '').toLowerCase().trim()}|${normT}`;
    seenKeys.add(key);
    if (!Array.isArray(item.evidence)) {
      item.evidence = [];
      if (item.evidence_snippet || item.url) {
        item.evidence.push({
          url: item.url || null,
          retailer: item.retailer || null,
          snippet: item.evidence_snippet || null,
          price_usd: item.origin_price_usd ?? null,
          observed_at: new Date().toISOString()
        });
      }
    }
  }

  for (const candidate of incomingList) {
    if (!candidate || !candidate.title) continue;
    const asin = (candidate.asin && typeof candidate.asin === 'string') ? candidate.asin.toUpperCase().trim() : null;
    const normT = normalizeTitleForDedupe(candidate.title);
    const key = `${(candidate.brand || '').toLowerCase().trim()}|${(candidate.franchise || '').toLowerCase().trim()}|${normT}`;

    let duplicateIndex = -1;
    if (asin && seenAsins.has(asin)) {
      duplicateIndex = merged.findIndex(m => m.asin && m.asin.toUpperCase().trim() === asin);
    } else if (seenTitles.has(normT)) {
      duplicateIndex = merged.findIndex(m => normalizeTitleForDedupe(m.title) === normT);
    } else if (seenKeys.has(key)) {
      duplicateIndex = merged.findIndex(m => `${(m.brand || '').toLowerCase().trim()}|${(m.franchise || '').toLowerCase().trim()}|${normalizeTitleForDedupe(m.title)}` === key);
    }

    if (duplicateIndex >= 0) {
      // Merge evidence into existing candidate without replacing authoritative fields if already set
      const existing = merged[duplicateIndex];
      if (!Array.isArray(existing.evidence)) {
        existing.evidence = [];
      }
      // Merge candidate evidence array if already present
      if (Array.isArray(candidate.evidence)) {
        for (const ev of candidate.evidence) {
          if (!existing.evidence.some(e => e.url && ev.url && e.url === ev.url)) {
            existing.evidence.push(ev);
          }
        }
      }
      if (candidate.url || candidate.evidence_snippet) {
        const alreadyHasSource = existing.evidence.some(e => e.url && candidate.url && e.url === candidate.url);
        if (!alreadyHasSource) {
          existing.evidence.push({
            url: candidate.url || null,
            retailer: candidate.retailer || null,
            snippet: candidate.evidence_snippet || null,
            price_usd: candidate.origin_price_usd ?? null,
            observed_at: new Date().toISOString()
          });
        }
      }
      // Fill missing fields if existing didn't have them
      if (!existing.origin_price_usd && candidate.origin_price_usd) {
        existing.origin_price_usd = candidate.origin_price_usd;
      }
      if (!existing.asin && candidate.asin) {
        existing.asin = candidate.asin;
      }
      if (!existing.url && candidate.url) {
        existing.url = candidate.url;
      }
    } else {
      // New unique candidate!
      if (asin) seenAsins.add(asin);
      if (normT) seenTitles.add(normT);
      seenKeys.add(key);

      const normalizedCandidate = { ...candidate };
      if (!Array.isArray(normalizedCandidate.evidence)) {
        normalizedCandidate.evidence = [];
        if (candidate.evidence_snippet || candidate.url) {
          normalizedCandidate.evidence.push({
            url: candidate.url || null,
            retailer: candidate.retailer || null,
            snippet: candidate.evidence_snippet || null,
            price_usd: candidate.origin_price_usd ?? null,
            observed_at: new Date().toISOString()
          });
        }
      }
      merged.push(normalizedCandidate);
    }
  }

  return merged;
}

