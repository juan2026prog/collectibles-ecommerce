import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * COMPATIBILITY WRAPPER: send-whatsapp-notification
 * Forwards requests to notification-dispatcher to maintain backwards compatibility
 * with existing PostgreSQL database triggers (fn_trigger_whatsapp_notification)
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const payload = await req.json();
    const authHeader = req.headers.get('Authorization') || `Bearer ${supabaseServiceKey}`;

    // Delegate execution to notification-dispatcher
    const dispatcherUrl = `${supabaseUrl}/functions/v1/notification-dispatcher`;

    const response = await fetch(dispatcherUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(payload),
    });

    const resData = await response.json();
    return new Response(JSON.stringify(resData), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("[send-whatsapp-notification Wrapper Error]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
