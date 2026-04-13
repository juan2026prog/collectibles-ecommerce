// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
// @ts-ignore
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

declare const Deno: any;

serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { userId } = await req.json();
    if (!userId) throw new Error("Falta el ID del usuario");

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Acceso denegado");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get user from token to verify admin rights
    const userClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("No autorizado");

    const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) throw new Error("Solo administradores pueden bloquear usuarios");

    // Ban user in auth
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: '8760h' // 1 year ban
    });

    if (banError) throw banError;

    // Additionally mark them as blocked in the DB if the column exists
    // We ignore errors here in case the column doesn't exist yet
    await supabaseAdmin.from('profiles').update({ is_blocked: true }).eq('id', userId).catch(() => {});

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
