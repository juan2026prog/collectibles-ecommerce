import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// ================================================================
// SOURCING OPENAI RESEARCH — EDGE FUNCTION
// Server-side only. OPENAI_API_KEY never exposed to frontend.
// Default: sourcing_openai_enabled = false
// ================================================================

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o";

const SYSTEM_PROMPT = `You are COLLECTIBLES SOURCING RESEARCH AGENT for Collectibles.uy, a premium collectibles store in Uruguay.

MISSION: Discover commercially relevant product candidates for the Sourcing Center.

ABSOLUTE RULE: Return ONLY products that are ORIGINAL, OFFICIALLY LICENSED, from verified manufacturers (Funko, NECA, McFarlane Toys, Hasbro, Mattel, Bandai, Hot Toys, Good Smile Company, Kotobukiya, Diamond Select, Sideshow, Iron Studios, Mezco, Playmobil, LEGO, etc.).

NEVER include: Bootlegs, replicas, recasts, KO, knockoffs, unbranded, fan-made, "inspired by", third-party unlicensed products.

IMPORTANT: Even when you identify a product as official, it must be verified by the Collectibles pipeline. Your role is to DISCOVER and SUGGEST, not to certify.

OUTPUT: Respond with a JSON object matching this exact schema. No markdown, no code blocks, pure JSON:
{
  "schema_version": "1.0",
  "pack_id": "<uuid>",
  "title": "<query-based title>",
  "generated_at": "<ISO datetime>",
  "provider": "openai",
  "query": "<original user query>",
  "research_type": "<TRENDING|NEW_RELEASE|PREORDER|EVERGREEN|RETRO|NOSTALGIA|CATALOG_GAP|MANUAL>",
  "items": [
    {
      "url": "<direct product URL, not homepage>",
      "retailer": "<amazon|ebay|bestbuy|official|other>",
      "name": "<product name>",
      "brand": "<brand name>",
      "license": "<license/IP name>",
      "manufacturer": "<manufacturer>",
      "product_type": "<EVERGREEN|PREORDER|RETRO|NEW_RELEASE|TRENDING|COLLECTIBLES_PICK>",
      "reason": "<why this product is relevant>",
      "tags": [],
      "price": null,
      "upc": null,
      "asin": null,
      "mpn": null,
      "release_date": null,
      "research_notes": "<notes about sourcing>",
      "confidence": 0.0
    }
  ]
}`;

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const startedAt = Date.now();
  let adminUser: any = null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    adminUser = await verifyAdmin(req);
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized", status: "FORBIDDEN" }), {
      status: 403,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
    });
  }

  try {
    // 1. Check feature flag
    const { data: enabledRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "sourcing_openai_enabled")
      .single();

    if (!enabledRow || enabledRow.value !== "true") {
      return new Response(JSON.stringify({ error: "OpenAI Research está desactivado.", status: "FEATURE_DISABLED" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
      });
    }

    // 2. Check API key
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY no configurada en Supabase Secrets.", status: "PENDING_CREDENTIAL" }), {
        status: 503,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
      });
    }

    // 3. Load all config in one query
    const { data: settings } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", [
        "sourcing_openai_model",
        "sourcing_openai_web_search_enabled",
        "sourcing_openai_max_results",
        "sourcing_openai_daily_request_limit",
        "sourcing_openai_daily_budget_usd"
      ]);

    const cfg: Record<string, string> = {};
    for (const row of (settings ?? [])) cfg[row.key] = row.value;

    const model = cfg["sourcing_openai_model"] || DEFAULT_MODEL;
    const maxResults = parseInt(cfg["sourcing_openai_max_results"] || "100", 10);
    const dailyLimit = parseInt(cfg["sourcing_openai_daily_request_limit"] || "20", 10);
    const dailyBudget = parseFloat(cfg["sourcing_openai_daily_budget_usd"] || "10.00");
    const webSearchEnabled = cfg["sourcing_openai_web_search_enabled"] === "true";

    // 4. Check daily request limit
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const { count: dailyCount } = await supabase
      .from("sourcing_openai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("admin_user_id", adminUser.id)
      .gte("created_at", dayStart.toISOString());

    if ((dailyCount ?? 0) >= dailyLimit) {
      return new Response(JSON.stringify({
        error: `Límite diario de ${dailyLimit} búsquedas OpenAI alcanzado.`,
        status: "RATE_LIMITED"
      }), { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // 5. Check daily budget
    const { data: todayUsage } = await supabase
      .from("sourcing_openai_usage_log")
      .select("estimated_cost_usd")
      .eq("admin_user_id", adminUser.id)
      .gte("created_at", dayStart.toISOString());

    const dailySpent = (todayUsage ?? []).reduce((acc: number, r: any) => acc + Number(r.estimated_cost_usd), 0);
    if (dailySpent >= dailyBudget) {
      return new Response(JSON.stringify({
        error: `Presupuesto diario de $${dailyBudget} USD alcanzado.`,
        status: "BUDGET_EXCEEDED"
      }), { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // 6. Parse request body
    const body = await req.json();
    const { query, research_type = "MANUAL" } = body;
    if (!query?.trim()) throw new Error("El campo 'query' es requerido.");

    const userPrompt = `BÚSQUEDA: ${query}\n\nMáximo ${maxResults} productos. Todos deben ser originales y oficialmente licenciados.`;

    // 7. Build OpenAI payload (Responses API)
    const openAIPayload: any = {
      model,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      text: { format: { type: "json_object" } }
    };
    if (webSearchEnabled) {
      openAIPayload.tools = [{ type: "web_search_preview" }];
    }

    // 8. Call OpenAI with retry on 429
    let openAIResponse: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      openAIResponse = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(openAIPayload)
      });
      if (openAIResponse.status !== 429) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }

    if (!openAIResponse) throw new Error("No se pudo contactar a OpenAI.");

    const openAIData = await openAIResponse.json();

    if (!openAIResponse.ok) {
      const errMsg = openAIData.error?.message || "OpenAI API Error";
      if (errMsg.toLowerCase().includes("model")) {
        return new Response(JSON.stringify({ error: errMsg, status: "MODEL_UNAVAILABLE" }), {
          status: 503, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
        });
      }
      throw new Error(errMsg);
    }

    // 9. Extract text content from Responses API format
    const outputText = openAIData.output
      ?.find((o: any) => o.type === "message")
      ?.content
      ?.find((c: any) => c.type === "output_text")
      ?.text ?? "";

    // 10. Parse and validate Research Pack schema
    let pack: any;
    try {
      pack = JSON.parse(outputText);
    } catch {
      throw new Error("OpenAI devolvió un JSON inválido.");
    }

    const VALID_RETAILERS = ["amazon", "ebay", "bestbuy", "official", "other"];
    let itemsValid = 0;
    let itemsInvalid = 0;
    const validatedItems: any[] = [];

    for (const item of (pack.items ?? [])) {
      const hasUrl = typeof item.url === "string" && item.url.startsWith("http");
      const hasBrand = typeof item.brand === "string" && item.brand.length > 0;
      const hasName = typeof item.name === "string" && item.name.length > 0;

      if (!hasUrl || !hasBrand || !hasName) {
        validatedItems.push({ ...item, candidate_status: "INVALID_RESEARCH_ITEM", validation_error: "Missing url, brand or name" });
        itemsInvalid++;
        continue;
      }

      const guessedRetailer = item.url.includes("amazon.com") ? "amazon"
        : item.url.includes("ebay.com") ? "ebay"
        : item.url.includes("bestbuy.com") ? "bestbuy"
        : (item.retailer || "other");

      validatedItems.push({
        ...item,
        retailer: VALID_RETAILERS.includes(guessedRetailer) ? guessedRetailer : "other",
        candidate_status: "URL_UNVERIFIED"
      });
      itemsValid++;
    }

    // 11. Build canonical Research Pack (identical schema to external Research Pack)
    const researchPack = {
      schema_version: "1.0",
      pack_id: pack.pack_id || crypto.randomUUID(),
      title: pack.title || `OpenAI: ${query.substring(0, 50)}`,
      generated_at: new Date().toISOString(),
      provider: "openai",
      query,
      research_type: pack.research_type || research_type,
      items: validatedItems
    };

    // 12. Persist audit log with REAL token usage from OpenAI
    const usage = openAIData.usage ?? {};
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? (inputTokens + outputTokens);
    // GPT-4o pricing: $5/1M input, $15/1M output
    const estimatedCost = (inputTokens * 0.000005) + (outputTokens * 0.000015);

    const finalStatus = itemsInvalid > 0 && itemsValid > 0 ? "PARTIAL"
      : itemsValid === 0 ? "FAILED"
      : "READY";

    await supabase.from("sourcing_openai_usage_log").insert({
      admin_user_id: adminUser.id,
      query,
      research_type: pack.research_type || research_type,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      items_found: validatedItems.length,
      items_valid: itemsValid,
      items_invalid: itemsInvalid,
      status: finalStatus,
      duration_ms: Date.now() - startedAt
    });

    return new Response(JSON.stringify({
      success: true,
      status: finalStatus,
      pack: researchPack,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens, estimated_cost_usd: estimatedCost },
      items_found: validatedItems.length,
      items_valid: itemsValid,
      items_invalid: itemsInvalid
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("sourcing-openai-research error:", error);
    if (adminUser?.id) {
      try {
        await supabase.from("sourcing_openai_usage_log").insert({
          admin_user_id: adminUser.id,
          query: "error",
          research_type: "MANUAL",
          model: DEFAULT_MODEL,
          status: "FAILED",
          error_message: error.message,
          duration_ms: Date.now() - startedAt
        });
      } catch { /* do not propagate audit failures */ }
    }
    return new Response(JSON.stringify({ error: error.message, status: "FAILED" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
    });
  }
});