// ============================================================
// COLLECTIBLES 2026 — OPENAI PRICING CALCULATOR (SERVER-SIDE)
// Single source of truth for token pricing and cost accounting.
// Avoids false $0.00 reporting when pricing is unknown.
// ============================================================

/**
 * Standard pricing matrix per 1 Million tokens (USD).
 * Can be overridden via environment variables:
 * OPENAI_PRICE_<CLEAN_MODEL>_INPUT_PER_1M
 * OPENAI_PRICE_<CLEAN_MODEL>_OUTPUT_PER_1M
 */
const PRICING_SNAPSHOT_DATE = '2026-09-28';
const PRICING_MAX_AGE_DAYS = Math.max(1, parseInt(process.env.OPENAI_PRICING_MAX_AGE_DAYS || '7', 10));

const DEFAULT_MODEL_PRICING = {
  // Flagship / Frontier models
  'gpt-5.6-terra': {
    inputPer1M: 2.00,
    outputPer1M: 12.00
  },
  'gpt-5.6-sol': {
    inputPer1M: 4.00,
    outputPer1M: 20.00
  },
  'gpt-5.6-luna': {
    inputPer1M: 0.20,
    outputPer1M: 1.20
  },
  'gpt-4o': {
    inputPer1M: 2.50,
    outputPer1M: 10.00
  },
  'gpt-4o-mini': {
    inputPer1M: 0.15,
    outputPer1M: 0.60
  },
  'gpt-4.5-preview': {
    inputPer1M: 75.00,
    outputPer1M: 150.00
  },
  'gpt-4-turbo': {
    inputPer1M: 10.00,
    outputPer1M: 30.00
  },
  'gpt-3.5-turbo': {
    inputPer1M: 0.50,
    outputPer1M: 1.50
  }
};

/**
 * Normalizes model name into env variable suffix
 * e.g. "gpt-5.6-terra" -> "GPT_5_6_TERRA"
 */
function getEnvModelKey(model) {
  if (!model || typeof model !== 'string') return '';
  return model.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/**
 * Resolves rates for a specific model from environment or default table
 */
export function getModelPricingRates(model) {
  if (!model || typeof model !== 'string') {
    return null;
  }

  const cleanKey = getEnvModelKey(model);
  const envInput = process.env[`OPENAI_PRICE_${cleanKey}_INPUT_PER_1M`];
  const envOutput = process.env[`OPENAI_PRICE_${cleanKey}_OUTPUT_PER_1M`];

  if (envInput !== undefined && envOutput !== undefined) {
    const inputRate = parseFloat(envInput);
    const outputRate = parseFloat(envOutput);
    if (!isNaN(inputRate) && !isNaN(outputRate) && inputRate >= 0 && outputRate >= 0) {
      return {
        inputPer1M: inputRate,
        outputPer1M: outputRate,
        source: 'ENVIRONMENT'
      };
    }
  }

  const defaultRates = DEFAULT_MODEL_PRICING[model.toLowerCase()];
  if (defaultRates) {
    const snapshotMs = Date.parse(PRICING_SNAPSHOT_DATE + 'T00:00:00Z');
    const ageDays = Math.floor((Date.now() - snapshotMs) / 86400000);
    if (ageDays > PRICING_MAX_AGE_DAYS) return null; // fail closed: stale price must never look current
    return { ...defaultRates, source: 'OPENAI_OFFICIAL_SNAPSHOT', snapshotDate: PRICING_SNAPSHOT_DATE, ageDays };
  }

  return null;
}

/**
 * Calculates token cost in USD
 * Returns detailed breakdown or explicit UNKNOWN_PRICING status.
 */
export function calculateOpenAICost(model, inputTokens = 0, outputTokens = 0) {
  const rates = getModelPricingRates(model);

  const safeInputTokens = Math.max(0, parseInt(inputTokens, 10) || 0);
  const safeOutputTokens = Math.max(0, parseInt(outputTokens, 10) || 0);
  const totalTokens = safeInputTokens + safeOutputTokens;

  if (!rates) {
    return {
      model: model || 'UNKNOWN',
      input_tokens: safeInputTokens,
      output_tokens: safeOutputTokens,
      total_tokens: totalTokens,
      input_cost_usd: null,
      output_cost_usd: null,
      estimated_cost_usd: null,
      pricing_status: 'UNKNOWN_PRICING',
      pricing_source: 'STALE_OR_UNKNOWN'
    };
  }

  const inputCost = (safeInputTokens / 1_000_000) * rates.inputPer1M;
  const outputCost = (safeOutputTokens / 1_000_000) * rates.outputPer1M;
  const totalCost = inputCost + outputCost;

  return {
    model,
    input_tokens: safeInputTokens,
    output_tokens: safeOutputTokens,
    total_tokens: totalTokens,
    input_cost_usd: parseFloat(inputCost.toFixed(8)),
    output_cost_usd: parseFloat(outputCost.toFixed(8)),
    estimated_cost_usd: parseFloat(totalCost.toFixed(6)),
    pricing_status: 'PRICED',
    pricing_source: rates.source
  };
}
