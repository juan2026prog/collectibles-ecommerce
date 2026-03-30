import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const metaCapiSchema = z.object({
  eventName: z.string().min(2),
  eventId: z.string().min(5), // Useful for deduplication
  eventData: z.record(z.any()).optional(),
  userData: z.object({
    em: z.string().optional(), // hashed email
    ph: z.string().optional(), // hashed phone
    client_ip_address: z.string().optional(),
    client_user_agent: z.string().optional()
  }).optional()
});

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const body = await req.json();
    const payload = metaCapiSchema.parse(body);
    
    // In a production app, fetch from Supabase Vault or ENV
    const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') || 'mock';
    const PIXEL_ID = Deno.env.get('META_PIXEL_ID') || 'mock';
    
    const fbPayload = {
      data: [{
        event_name: payload.eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_id: payload.eventId,
        user_data: payload.userData || {},
        custom_data: payload.eventData || {}
      }]
    };

    if (META_ACCESS_TOKEN === 'mock' || PIXEL_ID === 'mock') {
        console.log("Meta CAPI [MOCK MODE] Event captured:", fbPayload);
        return new Response(JSON.stringify({ success: true, mock: true, payload: fbPayload }), {
           headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    const response = await fetch(`https://graph.facebook.com/v17.0/${PIXEL_ID}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...fbPayload,
        access_token: META_ACCESS_TOKEN
      })
    });

    const result = await response.json();

    return new Response(JSON.stringify({ success: true, metaResponse: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error: any) {
    const isZodError = error instanceof z.ZodError;
    console.error(`Meta CAPI Error:`, isZodError ? error.errors : error.message);
    
    return new Response(
      JSON.stringify({ error: isZodError ? "Payload Invalido" : error.message }), {
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
