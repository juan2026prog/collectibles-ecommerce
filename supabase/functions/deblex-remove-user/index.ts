import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Método no permitido" });
  try {
    const token = req.headers.get("Authorization");
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !url || !anon || !service) return reply(401, { error: "Sesión o configuración no disponible" });

    const callerClient = createClient(url, anon, { global: { headers: { Authorization: token } } });
    const { data: { user }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !user) return reply(401, { error: "Sesión inválida" });
    const admin = createClient(url, service);
    const { data: caller } = await admin.from("deblex_portal_users")
      .select("id").eq("user_id", user.id).eq("role", "deblex_admin")
      .eq("is_active", true).eq("status", "ACTIVE").maybeSingle();
    if (!caller) return reply(403, { error: "Solo un administrador activo de Deblex puede eliminar accesos" });

    const body = await req.json();
    const targetId = typeof body?.portal_user_id === "string" ? body.portal_user_id : "";
    const expectedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[0-9a-f-]{36}$/i.test(targetId) || !expectedEmail) return reply(400, { error: "Usuario inválido" });

    const { data: target, error: targetError } = await admin.from("deblex_portal_users")
      .select("id,user_id,email,role,is_active,status").eq("id", targetId).maybeSingle();
    if (targetError || !target) return reply(404, { error: "Usuario Deblex no encontrado" });
    if (target.email.toLowerCase() !== expectedEmail) return reply(409, { error: "Los datos del usuario cambiaron; recargá la lista" });
    if (target.user_id === user.id) return reply(400, { error: "No podés eliminar tu propio acceso" });

    if (target.role === "deblex_admin" && target.is_active && target.status === "ACTIVE") {
      const { count, error: countError } = await admin.from("deblex_portal_users")
        .select("id", { count: "exact", head: true }).eq("role", "deblex_admin")
        .eq("is_active", true).eq("status", "ACTIVE");
      if (countError || (count ?? 0) <= 1) return reply(409, { error: "Debe permanecer al menos un administrador activo" });
    }

    // Remove only the Deblex portal membership, not the global Supabase Auth identity:
    // the same account can have other roles across Collectibles.
    const { error: delErr } = await admin.from("deblex_portal_users")
      .delete().eq("id", target.id).eq("email", target.email);
    if (delErr) return reply(409, { error: "No se pudo eliminar el acceso. Verificá dependencias del registro." });
    return reply(200, { success: true, message: "Acceso Deblex eliminado. La cuenta general de Collectibles se conservó." });
  } catch (_err) {
    return reply(500, { error: "No se pudo completar la operación" });
  }
});
