import { createClient } from "@supabase/supabase-js";
import { createOpenAITextResponse } from "./lib/openai.js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://cobtsgkwcftvexaarwmo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_f_7xF86CT0DFwT7YupNh_Q_TzmemHNf";

const ENGINE_COUNTRY_FLAG = {
  AI_SEARCH: "ai_search_enabled",
  PRODUCT_DISCOVERY: "product_discovery_enabled",
  TREND_ANALYSIS: "trend_analysis_enabled",
  PRODUCT_CURATION: "product_curation_enabled",
  COUNTRY_INTELLIGENCE: "country_intelligence_enabled",
  RADAR_INTELLIGENCE: "radar_intelligence_enabled",
  RELEASE_INTELLIGENCE: "release_intelligence_enabled",
};

function safeJson(text) {
  const cleaned = String(text || "").trim().replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/, "").trim();
  return JSON.parse(cleaned);
}

function profileForModel(model) {
  if (model?.includes("sol")) return "reasoning";
  if (model?.includes("luna")) return "fast";
  return "balanced";
}

function instructionsFor(engine, operation) {
  const common = "You are the Collectibles 2026 AI engine. Never invent inventory, price, stock, release dates, retailer availability, shipping, customs or product facts. Treat supplied catalog/context data as authoritative. Reply in Spanish unless the user explicitly requests another language.";
  if (engine === "AI_SEARCH") {
    return common + " For AI Search, understand collector intent and improve the answer using only supplied products and context. Return ONLY valid JSON with keys headline (string), summary (string), breakdown (array of strings), nextHighlight (string or null), relatedQuestions (array of up to 4 strings).";
  }
  return common + ` Operation: ${operation}. Return concise useful output grounded only in supplied data.`;
}

async function insertTelemetry(client, table, row) {
  try { await client.from(table).insert(row); } catch (_) {}
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, status: "METHOD_NOT_ALLOWED" });
  }

  const auth = req.headers.authorization || "";
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: auth ? { Authorization: auth } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { engine, country, operation = "execute", payload = {}, context = {} } = req.body || {};
  if (!engine || !ENGINE_COUNTRY_FLAG[engine]) {
    return res.status(400).json({ success: false, status: "INVALID_ENGINE" });
  }

  const started = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const { data: system } = await client.from("ai_system_config").select("*").order("created_at").limit(1).maybeSingle();
    if (!system?.global_enabled) return res.status(200).json({ success:false,status:"AI_DISABLED",provider:null,model:null });
    if (system.circuit_breaker_enabled && system.circuit_breaker_state === "OPEN") return res.status(200).json({ success:false,status:"CIRCUIT_OPEN",provider:null,model:null });

    const { data: engineConfig } = await client.from("ai_engine_config").select("*").eq("engine_key", engine).maybeSingle();
    if (!engineConfig?.enabled) return res.status(200).json({ success:false,status:"ENGINE_DISABLED",provider:null,model:null });
    const provider = engineConfig.provider || system.provider;
    if (provider !== "OPENAI") return res.status(200).json({ success:false,status:"PROVIDER_NOT_CONFIGURED",provider:null,model:null });

    if (country) {
      const { data: countryConfig } = await client.from("ai_country_config").select("*").eq("country_code", country).maybeSingle();
      const flag = ENGINE_COUNTRY_FLAG[engine];
      if (!countryConfig?.ai_enabled || countryConfig.status !== "ACTIVE" || !countryConfig?.[flag]) {
        return res.status(200).json({ success:false,status:"COUNTRY_DISABLED",provider:null,model:null });
      }
    }

    const today = new Date().toISOString().slice(0,10);
    const month = today.slice(0,7);
    const { data: usageToday } = await client.from("ai_usage_events").select("estimated_cost_usd").eq("engine",engine).gte("created_at", today + "T00:00:00Z");
    const { data: usageMonth } = await client.from("ai_usage_events").select("estimated_cost_usd").eq("engine",engine).gte("created_at", month + "-01T00:00:00Z");
    const dailyCost = (usageToday || []).reduce((s,r)=>s+Number(r.estimated_cost_usd||0),0);
    const monthlyCost = (usageMonth || []).reduce((s,r)=>s+Number(r.estimated_cost_usd||0),0);
    if ((engineConfig.daily_request_limit > 0 && (usageToday || []).length >= engineConfig.daily_request_limit) ||
        (Number(engineConfig.daily_budget_usd) > 0 && dailyCost >= Number(engineConfig.daily_budget_usd)) ||
        (Number(engineConfig.monthly_budget_usd) > 0 && monthlyCost >= Number(engineConfig.monthly_budget_usd))) {
      return res.status(200).json({ success:false,status:"BUDGET_EXCEEDED",provider:"OPENAI",model:engineConfig.model });
    }

    const result = await createOpenAITextResponse({
      model: engineConfig.model,
      profile: profileForModel(engineConfig.model),
      input: JSON.stringify({ payload, context }),
      instructions: instructionsFor(engine, operation),
      maxOutputTokens: engineConfig.max_output_tokens,
      metadata: { app:"collectibles", engine, operation, country: country || "GLOBAL" },
    });

    const inputTokens = Number(result.usage?.input_tokens || 0);
    const outputTokens = Number(result.usage?.output_tokens || 0);
    const totalTokens = Number(result.usage?.total_tokens || inputTokens + outputTokens);
    const latency = Date.now() - started;

    let data = result.text;
    if (engine === "AI_SEARCH") {
      try { data = safeJson(result.text); } catch (_) {
        throw Object.assign(new Error("AI Search returned invalid structured output"), { code:"INVALID_AI_OUTPUT", status:502 });
      }
    }

    await insertTelemetry(client, "ai_usage_events", {
      engine, country_code: country || "GLOBAL", provider:"OPENAI", model:result.model,
      request_id: result.requestId || requestId, input_tokens:inputTokens, output_tokens:outputTokens,
      total_tokens:totalTokens, estimated_cost_usd:0, latency_ms:latency, status:"SUCCESS",
      fallback_used:false, metadata:{ operation, response_id:result.responseId || null }
    });

    return res.status(200).json({ success:true,status:"SUCCESS",provider:"OPENAI",model:result.model,data,latency_ms:latency,usage:result.usage || null });
  } catch (error) {
    const latency = Date.now() - started;
    await insertTelemetry(client, "ai_error_events", {
      engine: engine || "UNKNOWN", country_code:country || "GLOBAL", provider:"OPENAI", model:"UNKNOWN",
      error_type:"OPENAI_ERROR", error_code:error?.code || null, safe_message:error?.message || "AI request failed",
      latency_ms:latency, request_id:error?.requestId || requestId, metadata:{ operation }
    });
    const status = error?.code === "OPENAI_TIMEOUT" ? "TIMEOUT" : error?.status === 429 ? "RATE_LIMITED" : "AI_DISABLED";
    return res.status(200).json({ success:false,status,provider:"OPENAI",model:null,error:"AI service unavailable",latency_ms:latency });
  }
}
