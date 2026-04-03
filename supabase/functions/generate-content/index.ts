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

    // Using Google Gemini via the system's provided URL/Key if applicable, 
    // but here we use a generic fetch to a completion API or a mock if not configured.
    // NOTE: In a real scenario, we'd use Deno.env.get("GEMINI_API_KEY")
    
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("AI API Key not configured.");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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
