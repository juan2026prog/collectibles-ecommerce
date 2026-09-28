const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_200;
const HARD_MAX_OUTPUT_TOKENS = 4_000;
const DEFAULT_MAX_INPUT_CHARS = 50_000;
const HARD_MAX_INPUT_CHARS = 200_000;

function envInt(name, fallback, hardMax) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(raw, hardMax);
}

export const OPENAI_MODELS = Object.freeze({
  fast: process.env.OPENAI_MODEL_FAST || "gpt-5.6-luna",
  balanced: process.env.OPENAI_MODEL_BALANCED || "gpt-5.6-terra",
  reasoning: process.env.OPENAI_MODEL_REASONING || "gpt-5.6-sol",
});

export function getOpenAIConfig() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY),
    models: OPENAI_MODELS,
    timeoutMs: envInt("OPENAI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 60_000),
    maxOutputTokens: envInt(
      "OPENAI_MAX_OUTPUT_TOKENS",
      DEFAULT_MAX_OUTPUT_TOKENS,
      HARD_MAX_OUTPUT_TOKENS,
    ),
    maxInputChars: envInt(
      "OPENAI_MAX_INPUT_CHARS",
      DEFAULT_MAX_INPUT_CHARS,
      HARD_MAX_INPUT_CHARS,
    ),
  };
}

function getAllowedModels() {
  const configured = (process.env.OPENAI_ALLOWED_MODELS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(
    configured.length > 0 ? configured : Object.values(OPENAI_MODELS),
  );
}

function resolveModel(profile, explicitModel) {
  const model = explicitModel || OPENAI_MODELS[profile] || OPENAI_MODELS.balanced;

  if (!getAllowedModels().has(model)) {
    const error = new Error("Requested OpenAI model is not allowed");
    error.code = "OPENAI_MODEL_NOT_ALLOWED";
    error.status = 400;
    throw error;
  }

  return model;
}

function normalizeInput(input, maxInputChars) {
  if (typeof input === "string") {
    if (!input.trim()) {
      const error = new Error("OpenAI input cannot be empty");
      error.code = "OPENAI_EMPTY_INPUT";
      error.status = 400;
      throw error;
    }

    if (input.length > maxInputChars) {
      const error = new Error("OpenAI input exceeds configured size limit");
      error.code = "OPENAI_INPUT_TOO_LARGE";
      error.status = 413;
      throw error;
    }
  }

  return input;
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (
        (content?.type === "output_text" || content?.type === "text") &&
        typeof content?.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

export async function createOpenAITextResponse({
  input,
  instructions,
  profile = "balanced",
  model,
  maxOutputTokens,
  metadata,
} = {}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY is not configured");
    error.code = "OPENAI_NOT_CONFIGURED";
    error.status = 500;
    throw error;
  }

  const config = getOpenAIConfig();
  const selectedModel = resolveModel(profile, model);
  const safeInput = normalizeInput(input, config.maxInputChars);
  const outputLimit = Math.min(
    Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
      ? Math.floor(maxOutputTokens)
      : config.maxOutputTokens,
    HARD_MAX_OUTPUT_TOKENS,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: selectedModel,
        input: safeInput,
        ...(instructions ? { instructions } : {}),
        max_output_tokens: outputLimit,
        store: false,
        ...(metadata ? { metadata } : {}),
      }),
    });

    const requestId = response.headers.get("x-request-id");
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        data?.error?.message || `OpenAI request failed with status ${response.status}`,
      );
      error.code = data?.error?.code || data?.error?.type || "OPENAI_REQUEST_FAILED";
      error.status = response.status;
      error.requestId = requestId;
      throw error;
    }

    return {
      text: extractOutputText(data),
      model: data?.model || selectedModel,
      usage: data?.usage || null,
      requestId,
      responseId: data?.id || null,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("OpenAI request timed out");
      timeoutError.code = "OPENAI_TIMEOUT";
      timeoutError.status = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
