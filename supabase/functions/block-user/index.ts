// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
// @ts-ignore
import { corsHeaders, handleOptions, getCorsHeaders } from "../_shared/cors.ts";
// @ts-ignore
import { verifyAdmin } from "../_shared/auth.ts";

declare const Deno: any;


serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    // SEC-MED-02: Use shared verifyAdmin for consistent server-side role checking
    await verifyAdmin(req);

    const { userId } = await req.json();
    if (!userId) throw new Error("Falta el ID del usuario");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Ban user in auth
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: '8760h' // 1 year ban
    });

    if (banError) throw banError;

    // Additionally mark them as blocked in the DB if the column exists
    // We ignore errors here in case the column doesn't exist yet
    await supabaseAdmin.from('profiles').update({ is_blocked: true }).eq('id', userId).catch(() => {});

    const dynHeaders = getCorsHeaders(req);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...dynHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    const dynHeaders = getCorsHeaders(req);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...dynHeaders, "Content-Type": "application/json" }
    });
  }
});
