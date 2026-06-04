import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

async function hashSHA256(value: string | undefined): Promise<string | undefined> {
  if (!value) return undefined;
  
  // Clean value according to Meta's best practices before hashing
  const cleanValue = value.trim().toLowerCase();
  if (!cleanValue) return undefined;
  
  const msgBuffer = new TextEncoder().encode(cleanValue);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const payload = await req.json();

    const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN');
    const PIXEL_ID = Deno.env.get('META_PIXEL_ID');
    const TEST_EVENT_CODE = Deno.env.get('META_TEST_EVENT_CODE');

    if (!META_ACCESS_TOKEN || !PIXEL_ID) {
      console.error("[Meta CAPI] Error: Missing Meta configuration in env vars.");
      return new Response(
        JSON.stringify({ error: "Configuration Error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawUserData = payload.user_data || {};
    
    // Hash sensitive user data fields
    const hashedUserData: Record<string, string | undefined> = {
      em: await hashSHA256(rawUserData.email),
      ph: await hashSHA256(rawUserData.phone),
      fn: await hashSHA256(rawUserData.first_name),
      ln: await hashSHA256(rawUserData.last_name),
      external_id: await hashSHA256(rawUserData.external_id),
      client_ip_address: rawUserData.client_ip_address || req.headers.get('x-forwarded-for') || undefined,
      client_user_agent: rawUserData.client_user_agent || req.headers.get('user-agent') || undefined,
      fbc: rawUserData.fbc,
      fbp: rawUserData.fbp
    };

    // Remove undefined fields
    Object.keys(hashedUserData).forEach(key => 
      hashedUserData[key] === undefined && delete hashedUserData[key]
    );

    const fbPayload: any = {
      data: [{
        event_name: payload.event_name,
        event_time: payload.event_time || Math.floor(Date.now() / 1000),
        action_source: payload.action_source || "website",
        event_id: payload.event_id,
        event_source_url: payload.event_source_url,
        user_data: hashedUserData,
        custom_data: payload.custom_data || {}
      }]
    };

    if (TEST_EVENT_CODE) {
      fbPayload.test_event_code = TEST_EVENT_CODE;
    }

    console.log(`[Meta CAPI] Sending event: ${payload.event_name} (ID: ${payload.event_id})`);
    
    const response = await fetch(`https://graph.facebook.com/v17.0/${PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fbPayload) // Do not log META_ACCESS_TOKEN
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error("[Meta CAPI] Error response from Meta:", result);
      return new Response(
        JSON.stringify({ error: "Meta API Error", details: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Meta CAPI] Success:`, JSON.stringify(result));
    return new Response(
      JSON.stringify({ success: true, metaResponse: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error(`[Meta CAPI] Function Error:`, error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
