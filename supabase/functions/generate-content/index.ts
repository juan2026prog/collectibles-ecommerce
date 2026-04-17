import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, prompt, currentText } = await req.json();

    // Determine the system instruction based on action
    let instruction = "Eres un redactor experto en ecommerce para una tienda de coleccionables y figuras de acción llamada 'Collectibles'.";
    
    if (action === 'improve') {
      instruction += "\nTu tarea es mejorar la siguiente descripción de producto, haciéndola más atractiva, profesional y optimizada para SEO. Mantén el tono informativo pero emocionante.";
    } else {
      instruction += "\nTu tarea es generar una descripción premium para un producto basado en el siguiente nombre o detalles. Debe ser estructurada, emocionante y profesional.";
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("AI API Key not configured.");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${instruction}\n\nTexto base: ${currentText || ''}\nPrompt adicional: ${prompt || ''}` }]
        }]
      })
    });

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar el contenido.";

    // Log token usage
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
      const usageMeta = data.usageMetadata;
      const tokensUsed = (usageMeta?.promptTokenCount || 0) + (usageMeta?.candidatesTokenCount || 0);
      const estimatedCost = ((usageMeta?.promptTokenCount || 0) * 0.0000001) + ((usageMeta?.candidatesTokenCount || 0) * 0.0000004);
      const toolKey = action === 'improve' ? 'ai_description_improver' : 'ai_catalog_generator';
      await supabase.from('ai_usage_log').insert({ tool_key: toolKey, tokens_used: tokensUsed, estimated_cost: estimatedCost });
    } catch (_e) { /* logging is non-fatal */ }

    return new Response(JSON.stringify({ success: true, text: generatedText }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200 
    });
  }
});
