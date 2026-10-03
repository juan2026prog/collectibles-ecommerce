// ============================================================
// COLLECTIBLES 2026 — OPENAI RESPONSES API CLIENT (SERVER-SIDE)
// Dedicated server-side module for executing calls to OpenAI.
// OPENAI_API_KEY is NEVER exposed to the frontend or public logs.
// ============================================================

import { calculateOpenAICost } from './openaiPricing.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1200;
const HARD_MAX_OUTPUT_TOKENS = 4000;
const DEFAULT_MAX_INPUT_CHARS = 50000;
const HARD_MAX_INPUT_CHARS = 200000;

function envInt(name, fallback, hardMax) {
  const raw = parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(raw, hardMax);
}

export const OPENAI_MODELS = Object.freeze({
  fast: process.env.OPENAI_MODEL_FAST || 'gpt-5.6-sol',
  balanced: process.env.OPENAI_MODEL_BALANCED || 'gpt-5.6-terra',
  reasoning: process.env.OPENAI_MODEL_REASONING || 'gpt-5.6-sol'
});

export function getOpenAIConfig() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== ''),
    models: OPENAI_MODELS,
    timeoutMs: envInt('OPENAI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 60000),
    maxOutputTokens: envInt('OPENAI_MAX_OUTPUT_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS, HARD_MAX_OUTPUT_TOKENS),
    maxInputChars: envInt('OPENAI_MAX_INPUT_CHARS', DEFAULT_MAX_INPUT_CHARS, HARD_MAX_INPUT_CHARS)
  };
}

export class OpenAIError extends Error {
  constructor(message, errorType = 'OPENAI_ERROR', statusCode = 500, details = {}) {
    super(message);
    this.name = 'OpenAIError';
    this.errorType = errorType;
    this.code = errorType;
    this.status = statusCode;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Extracts output text from Responses API payload
 */
function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (
        (content?.type === 'output_text' || content?.type === 'text') &&
        typeof content?.text === 'string'
      ) {
        parts.push(content.text);
      }
    }
  }

  if (parts.length > 0) {
    return parts.join('\n').trim();
  }

  if (data?.choices && data.choices[0]?.message?.content) {
    return data.choices[0].message.content.trim();
  }

  return '';
}

function extractSources(data) {
  const sources = [];
  const seenUrls = new Set();

  for (const item of data?.output || []) {
    // Check annotations in text content
    for (const content of item?.content || []) {
      if (Array.isArray(content?.annotations)) {
        for (const ann of content.annotations) {
          if (ann?.type === 'url_citation') {
            // Responses API citations may expose URL metadata either directly
            // on the annotation or nested under url_citation. Support both.
            const citation = ann.url_citation && typeof ann.url_citation === 'object'
              ? ann.url_citation
              : ann;
            const url = citation?.url || ann?.url || null;
            const title = citation?.title || ann?.title || ann?.text || url;

            if (url && !seenUrls.has(url)) {
              seenUrls.add(url);
              sources.push({
                url,
                title,
                domain: (() => {
                  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'web'; }
                })(),
                cited_text: ann.text || citation?.text || '',
                startIndex: ann.start_index ?? citation?.start_index,
                endIndex: ann.end_index ?? citation?.end_index
              });
            }
          }
        }
      }
    }
    // Check direct tool call outputs
    if (item?.type === 'web_search_call' || item?.type === 'web_search' || item?.type === 'tool_call') {
      const toolAction = item.web_search_call || item.action || item;
      const resultsList = Array.isArray(toolAction.results) ? toolAction.results : (Array.isArray(item.results) ? item.results : []);
      for (const res of resultsList) {
        const resUrl = res.url || res.link;
        if (resUrl && typeof resUrl === 'string' && !seenUrls.has(resUrl)) {
          seenUrls.add(resUrl);
          sources.push({
            url: resUrl,
            title: res.title || res.name || resUrl,
            domain: (() => {
              try { return new URL(resUrl).hostname.replace(/^www\./, ''); } catch { return 'web'; }
            })(),
            snippet: res.snippet || res.content || res.summary || ''
          });
        }
      }
    }
  }

  return sources;
}

/**
 * Executes a call to OpenAI Responses API with telemetry & pricing calculation.
 * 
 * @param {Object} options
 * @param {string} [options.model] - Model identifier e.g. 'gpt-5.6-terra'
 * @param {string} [options.profile] - 'fast' | 'balanced' | 'reasoning'
 * @param {string|Array} options.input - Text or messages input
 * @param {number} [options.temperature=0.2]
 * @param {number} [options.maxTokens]
 * @param {number} [options.timeoutMs=25000]
 * @param {string} [options.systemPrompt]
 * @param {string} [options.instructions]
 * @param {Array} [options.tools] - e.g. [{ type: "web_search" }]
 * @param {string|Object} [options.toolChoice] - e.g. "required" | "auto"
 * @param {Object} [options.metadata]
 * @returns {Promise<Object>} Execution result with data, usage, telemetry, and pricing
 */
export async function callOpenAIResponses(options = {}) {
  const {
    model: explicitModel,
    profile = 'balanced',
    input,
    temperature = 0.2,
    maxTokens,
    timeoutMs = 25000,
    systemPrompt,
    instructions,
    tools,
    toolChoice,
    metadata
  } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new OpenAIError(
      'OpenAI API key is not configured on server.',
      'NOT_CONFIGURED',
      500
    );
  }

  if (!input) {
    throw new OpenAIError(
      'Input prompt is required for OpenAI execution.',
      'INVALID_OUTPUT',
      400
    );
  }

  const selectedModel = explicitModel || OPENAI_MODELS[profile] || OPENAI_MODELS.balanced || 'gpt-5.6-terra';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    const requestBody = {
      model: selectedModel,
      input,
      store: false
    };

    // GPT-5.6 Responses models reject the temperature parameter.
    // Keep it only for model families that explicitly support it.
    if (!/^gpt-5\.6(?:-|$)/i.test(selectedModel) && typeof temperature === 'number') {
      requestBody.temperature = temperature;
    }

    if (maxTokens) {
      requestBody.max_output_tokens = maxTokens;
    }

    const resolvedInstructions = systemPrompt || instructions;
    if (resolvedInstructions) {
      requestBody.instructions = resolvedInstructions;
    }

    if (Array.isArray(tools) && tools.length > 0) {
      requestBody.tools = tools;
      if (toolChoice) {
        requestBody.tool_choice = toolChoice;
      }
    }

    if (metadata && typeof metadata === 'object') {
      const sanitizedMeta = {};
      for (const [k, v] of Object.entries(metadata)) {
        if (v !== undefined && v !== null) {
          sanitizedMeta[String(k)] = typeof v === 'string' ? v : String(v);
        }
      }
      requestBody.metadata = sanitizedMeta;
    }

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Collectibles-2026-AIGateway/2.0'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });


    const latencyMs = Date.now() - startTime;
    const xRequestId = response.headers.get('x-request-id') || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      throw new OpenAIError(
        'Failed to parse JSON response from OpenAI.',
        'INVALID_OUTPUT',
        response.status || 502,
        { latencyMs, requestId: xRequestId }
      );
    }

    if (!response.ok) {
      const status = response.status;
      const errorObj = responseData?.error || {};
      const errMsg = errorObj.message || `OpenAI request failed with status ${status}`;

      let errorType = 'OPENAI_ERROR';
      if (status === 429) {
        errorType = 'RATE_LIMITED';
      } else if (status === 401 || status === 403) {
        errorType = 'NOT_CONFIGURED';
      } else if (status === 404 || errorObj.code === 'model_not_found') {
        errorType = 'MODEL_NOT_ALLOWED';
      }

      throw new OpenAIError(
        errMsg,
        errorType,
        status,
        {
          code: errorObj.code || status,
          type: errorObj.type,
          requestId: xRequestId,
          latencyMs
        }
      );
    }

    const outputText = extractOutputText(responseData);
    const sources = extractSources(responseData);

    // Usage tokens extraction
    const usage = responseData.usage || {};
    const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
    const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || (inputTokens + outputTokens);

    // Calculate cost
    const pricing = calculateOpenAICost(responseData.model || selectedModel, inputTokens, outputTokens);

    return {
      success: true,
      status: responseData.status || 'completed',
      incompleteReason: responseData.incomplete_details?.reason || null,
      text: outputText,
      outputText,
      sources,
      model: responseData.model || selectedModel,
      responseId: responseData.id || `resp_${Date.now()}`,
      requestId: xRequestId,
      latencyMs,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens
      },
      pricing,
      raw: responseData
    };


  } catch (err) {
    const latencyMs = Date.now() - startTime;
    if (err.name === 'AbortError' || controller.signal.aborted) {
      throw new OpenAIError(
        `OpenAI request timed out after ${timeoutMs}ms.`,
        'TIMEOUT',
        504,
        { latencyMs, timeoutMs }
      );
    }

    if (err instanceof OpenAIError) {
      throw err;
    }

    throw new OpenAIError(
      err.message || 'Unknown network error calling OpenAI.',
      'OPENAI_ERROR',
      500,
      { latencyMs }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convenience alias matching createOpenAITextResponse
 */
export async function createOpenAITextResponse(options = {}) {
  return callOpenAIResponses(options);
}
