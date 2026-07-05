import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, handleOptions, getCorsHeaders } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";

declare const Deno: any;

serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    // 1. Verify the requester is an admin.
    await verifyAdmin(req);

    // 2. Parse request body
    const { userId } = await req.json();
    if (!userId) throw new Error("Falta el ID del usuario");

    // 3. Admin client to bypass normal auth restrictions
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 4. Delete user in auth (will cascade to profiles table)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

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
