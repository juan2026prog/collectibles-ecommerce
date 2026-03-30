import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    await verifyAuth(req); // Only authenticated users can generate AI text

    const { productId, rawText, vendorTone } = await req.json();
    
    if (!rawText) throw new Error("Missing 'rawText' input to generate catalog content.");

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    let generatedTitle = "";
    let generatedDescription = "";
    let keywords = [];

    if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('mock')) {
       // Mock Mode
       console.log("Generando sin llave OpenAI válida (Mock).");
       generatedTitle = `[MOCK AI] ${rawText.substring(0, 30)}...`;
       generatedDescription = `Este es un texto auto-generado mock porque no se detectó una llave OpenAI productiva.\n\n### Aspectos Destacados\n- Característica 1 detectada de: ${rawText.substring(0, 10)}\n- Calidad Premium garantizada.`;
       keywords = ["mock", "test", "ai"];
    } else {
       // Producción
       const systemPrompt = `You are an expert eCommerce copywriter for a premium collectibles store.
       Tone: ${vendorTone || 'Professional and persuasive, focusing on FOMO and rarity'}. 
       Task: Convert the following raw product notes into:
       1. A highly converting SEO Title (max 60 chars)
       2. A structured Markdown description (including Hook, Body, and Bullet Points)
       3. An array of 5 exact-match SEO keywords.
       Never invent features not mentioned in the notes.
       Respond strictly in flat JSON format, don't use markdown code blocks. Example:
       { "title": "...", "description": "...", "keywords": ["..."] }`;

       const response = await fetch("https://api.openai.com/v1/chat/completions", {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
           "Authorization": `Bearer ${OPENAI_API_KEY}`
         },
         body: JSON.stringify({
           model: "gpt-4-turbo-preview",
           response_format: { type: "json_object" },
           messages: [
             { role: "system", content: systemPrompt },
             { role: "user", content: `Raw product notes:\n${rawText}` }
           ],
           temperature: 0.3
         })
       });

       const aiData = await response.json();
       if (!response.ok) throw new Error(aiData.error?.message || "OpenAI API Error");

       let contentString = aiData.choices[0].message.content;
       const result = JSON.parse(contentString);

       generatedTitle = result.title;
       generatedDescription = result.description;
       keywords = result.keywords || [];
    }

    if (productId) {
      await supabase.from('products').update({ 
         title: generatedTitle, 
         description: generatedDescription 
      }).eq('id', productId);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      optimizedContent: {
         title: generatedTitle,
         description: generatedDescription,
         keywords: keywords
      } 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("AI Catalog Generator Error", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
