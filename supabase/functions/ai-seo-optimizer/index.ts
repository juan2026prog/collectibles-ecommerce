import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { record, type } = await req.json()

    // Solo procesar si es un producto nuevo (INSERT) y si no tiene title o description SEO aún
    if (type !== 'INSERT' && type !== 'UPDATE') {
       return new Response(JSON.stringify({ message: "Not an insert/update." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    if (!record || !record.id || !record.title) {
       return new Response(JSON.stringify({ error: "Missing record data." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    // Skip if already generated and it's an update
    if (type === 'UPDATE' && record.seo_title && record.seo_description) {
       return new Response(JSON.stringify({ message: "SEO already exists, skipping." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // Fetch AI SEO Toggle from site_settings
    const { data: aiSetting } = await supabaseClient
      .from('site_settings')
      .select('value')
      .eq('key', 'ai_seo_enabled')
      .single();

    const isAiEnabled = aiSetting?.value === 'true';

    // Call Gemini or OpenAI API ONLY if enabled globally
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    
    let seoTitle = `${record.title} - Comprar Online`;
    let seoDescription = record.short_description || `Encuentra ${record.title} al mejor precio. Compra online con envío seguro y los mejores descuentos.`;

    if (geminiKey && isAiEnabled) {
        const prompt = `Actúa como un experto en SEO para ecommerce. 
        Tengo un producto llamado "${record.title}".
        Descripción: "${record.description || record.short_description || 'Sin descripción'}".
        
        Genera un JSON válido con estas dos propiedades y nada más (sin formato Markdown, sólo texto JSON evaluable):
        1. "seo_title": Un meta title altamente optimizado para CTR (máximo 60 caracteres). Que genere deseo de compra.
        2. "seo_description": Una meta descripción persuasiva que incluya palabras clave relevantes de intención de compra (máximo 155 caracteres).`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (response.ok) {
            const result = await response.json();
            const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textResponse) {
                try {
                    // Limpiar markdown json format por si acaso
                    const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                    const aiData = JSON.parse(cleanJson);
                    if (aiData.seo_title) seoTitle = aiData.seo_title;
                    if (aiData.seo_description) seoDescription = aiData.seo_description;
                } catch(e) {
                    console.error("Failed to parse AI response as JSON", textResponse);
                }
            }
        }
    }

    // Update the record in Supabase
    const { error: updateError } = await supabaseClient
      .from('products')
      .update({ 
        seo_title: seoTitle, 
        seo_description: seoDescription 
      })
      .eq('id', record.id);

    if (updateError) {
        throw updateError;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      seo_title: seoTitle, 
      seo_description: seoDescription 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
