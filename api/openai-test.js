import {
  createOpenAITextResponse,
  getOpenAIConfig,
} from "./lib/openai.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const config = getOpenAIConfig();

    return res.status(config.configured ? 200 : 500).json({
      ok: config.configured,
      configured: config.configured,
      models: config.models,
      liveTestEnabled:
        process.env.VERCEL_ENV !== "production" ||
        process.env.OPENAI_TEST_ENABLED === "true",
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  const liveTestEnabled =
    process.env.VERCEL_ENV !== "production" ||
    process.env.OPENAI_TEST_ENABLED === "true";

  if (!liveTestEnabled) {
    return res.status(404).json({
      ok: false,
      error: "Live OpenAI test is disabled in production",
    });
  }

  try {
    const result = await createOpenAITextResponse({
      profile: "balanced",
      input: "Respond only with: OPENAI_COLLECTIBLES_OK",
      maxOutputTokens: 32,
      metadata: {
        feature: "connectivity_test",
        app: "collectibles",
      },
    });

    return res.status(200).json({
      ok: result.text === "OPENAI_COLLECTIBLES_OK",
      response: result.text,
      model: result.model,
      usage: result.usage,
      requestId: result.requestId,
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      ok: false,
      error: error?.message || "OpenAI test failed",
      code: error?.code || "OPENAI_TEST_FAILED",
      requestId: error?.requestId || null,
    });
  }
}
