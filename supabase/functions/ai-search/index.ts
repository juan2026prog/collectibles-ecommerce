import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const allowedOrigins = new Set(["https://collectibles.com.uy", "https://www.collectibles.com.uy", "https://collectibles-ecommerce.vercel.app"]);
function headersFor(req: Request) { return {
  "Access-Control-Allow-Origin": allowedOrigins.has(req.headers.get("Origin") || "") ? req.headers.get("Origin")! : "",
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
}; }

function handleOptions(req: Request) {
  const origin = req.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return new Response(null, {status: 403});
  const corsHeaders = headersFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  const corsHeaders = headersFor(req);
  const options = handleOptions(req);
  if (options) return options;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ai-search\/?/, "");

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const isMock = !OPENAI_API_KEY || OPENAI_API_KEY.includes("mock");

    // 1. ROUTE: /parse-intent
    if (req.method === "POST" && (path === "parse-intent" || path === "")) {
      const body = await req.json();
      const rawQuery = (body.query || "").toString().slice(0, 500).trim();

      if (!rawQuery) {
        return new Response(JSON.stringify({ error: "Missing query" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (isMock) {
        return new Response(JSON.stringify({
          success: true,
          mode: "mock",
          parsed: {
            intent: "product_search",
            filters: { keywords: [rawQuery] },
            ai_level: 2
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const systemPrompt = `You are a search query interpreter for a collectibles and action figures ecommerce store.
Convert the query into flat JSON format with this exact structure:
{
  "intent": "product_search" | "recommendation" | "comparison_request" | "collection_building" | "availability_question",
  "filters": {
    "brand": string | null,
    "license": string | null,
    "theme": string | null,
    "character": string | null,
    "scale": string | null,
    "height_cm": { "min": number, "max": number } | null,
    "price_max_usd": number | null,
    "price_min_usd": number | null,
    "availability": "available" | "preorder" | null,
    "exclude_brand": string[] | null,
    "exclude_terms": string[] | null,
    "keywords": string[]
  }
}
Do not invent anything. Return JSON only.`;

      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: rawQuery }
          ],
          temperature: 0.1
        })
      });

      if (!aiRes.ok) {
        throw new Error(`OpenAI API error HTTP ${aiRes.status}`);
      }

      const aiJson = await aiRes.json();
      const parsed = JSON.parse(aiJson.choices[0].message.content);

      return new Response(JSON.stringify({
        success: true,
        mode: "live",
        parsed: {
          ...parsed,
          ai_level: 3
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. ROUTE: /generate-embedding
    if (req.method === "POST" && path === "generate-embedding") {
      const body = await req.json();
      const text = (body.text || "").toString().slice(0, 4000).trim();

      if (!text) {
        return new Response(JSON.stringify({ error: "Missing text" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (isMock) {
        const mockVec = new Array(1536).fill(0).map((_, i) => (i < 10 ? 0.05 : 0));
        return new Response(JSON.stringify({
          success: true,
          mode: "mock",
          embedding: mockVec
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const embRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text
        })
      });

      if (!embRes.ok) {
        throw new Error(`OpenAI Embedding error HTTP ${embRes.status}`);
      }

      const embJson = await embRes.json();
      return new Response(JSON.stringify({
        success: true,
        mode: "live",
        embedding: embJson.data[0].embedding
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. ROUTE: /ask-collectibles
    if (req.method === "POST" && path === "ask-collectibles") {
      const body = await req.json();
      const query = (body.query || "").toString().slice(0, 500).trim();

      if (!query) {
        return new Response(JSON.stringify({ error: "Missing query" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Fetch up to 10 active products as authoritative catalog candidates
      const { data: catalogProducts, error: catError } = await supabase
        .from("products")
        .select(`
          id, title, slug, base_price,
          brand:brands!products_brand_id_fkey(name),
          license:licenses!products_license_id_fkey(name),
          images:product_images!product_images_product_id_fkey(url)
        `)
        .eq("status", "published")
        .eq("is_active", true)
        .limit(10);

      if (catError) {
        console.error("Error fetching catalog candidates:", catError);
      }

      const candidates = catalogProducts || [];

      if (isMock) {
        const answer = `¡Excelente elección para comenzar tu colección sobre "${query}"! Te recomendamos enfocar tu búsqueda en piezas de escala estándar (como figuras de 7 pulgadas o 1:12), ya que permiten gran articulación y fidelidad de detalle.\n\nAquí tienes productos reales destacados de nuestro catálogo:`;
        return new Response(JSON.stringify({
          success: true,
          mode: "mock",
          conversational_answer: answer,
          recommended_products: candidates.slice(0, 4)
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const promptContext = candidates.map(p => 
        `ID: ${p.id} | Titulo: ${p.title} | Precio: $${p.base_price} | Marca: ${(p.brand as any)?.name || 'N/A'}`
      ).join("\n");

      const systemPrompt = `You are "Collectibles Advisor", a passionate collector and curator of action figures and pop culture merchandise.
Answer the user's question in friendly, expert Spanish.
CRITICAL RULES:
1. SEPARATE your response into:
   - EXPLANATION / GUIDANCE (helpful collector tips, scale advice, rarity insights).
   - RECOMMENDATIONS: You may only recommend products from the provided catalog list below.
2. NEVER invent products not on this list.
3. Return strict JSON:
{
  "explanation": "Markdown text with advice in Spanish...",
  "recommended_ids": ["id1", "id2"]
}`;

      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Pregunta: ${query}\n\nCatálogo disponible:\n${promptContext}` }
          ],
          temperature: 0.3
        })
      });

      if (!aiRes.ok) throw new Error(`OpenAI API error HTTP ${aiRes.status}`);

      const aiJson = await aiRes.json();
      const parsed = JSON.parse(aiJson.choices[0].message.content);
      const recIds: string[] = parsed.recommended_ids || [];

      const recommendedProducts = candidates.filter(p => recIds.includes(p.id));
      const finalProducts = recommendedProducts.length > 0 ? recommendedProducts : candidates.slice(0, 4);

      return new Response(JSON.stringify({
        success: true,
        mode: "live",
        conversational_answer: parsed.explanation || "",
        recommended_products: finalProducts
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Endpoint not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("ai-search edge function error:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || "Internal server error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
