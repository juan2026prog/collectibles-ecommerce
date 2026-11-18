import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-collectibles-cron-secret, x-webhook-secret',
};

/**
 * SECURE WRAPPER: send-whatsapp-notification
 * Forwards authenticated requests (JWT, Cron Secret, or Webhook Secret) to notification-dispatcher.
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const authHeader = req.headers.get('Authorization');
    const cronSecret = req.headers.get('x-collectibles-cron-secret');
    const webhookSecret = req.headers.get('x-webhook-secret');

    const payload = await req.json();

    if (!authHeader && !cronSecret && !webhookSecret && !payload?.webhook_secret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing credentials.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authHeader) forwardHeaders['Authorization'] = authHeader;
    if (cronSecret) forwardHeaders['x-collectibles-cron-secret'] = cronSecret;
    if (webhookSecret) forwardHeaders['x-webhook-secret'] = webhookSecret;

    const dispatcherUrl = `${supabaseUrl}/functions/v1/notification-dispatcher`;
    const response = await fetch(dispatcherUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(payload),
    });

    const resData = await response.json();
    return new Response(JSON.stringify(resData), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("[send-whatsapp-notification Error]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
