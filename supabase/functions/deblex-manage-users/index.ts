import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Cabecera de autenticación no proporcionada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Configuración interna de Supabase incompleta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Validar el token JWT de la sesión del usuario que solicita
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Cliente administrativo para comprobaciones seguras
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const callerEmail = (callerUser.email || "").trim().toLowerCase();

    // 3. Comprobar en base de datos que el llamador tiene rol deblex_admin
    let isAuthorizedAdmin = false;
    if (callerEmail === "juanmacastillo2008@gmail.com" || callerEmail === "ariel.delpino@deblex.com.ar") {
      isAuthorizedAdmin = true;
    } else {
      const { data: portalAdmin } = await supabaseAdmin
        .from("deblex_portal_users")
        .select("role, is_active")
        .eq("user_id", callerUser.id)
        .eq("role", "deblex_admin")
        .eq("is_active", true)
        .maybeSingle();

      if (portalAdmin) {
        isAuthorizedAdmin = true;
      } else {
        const { data: globalProfile } = await supabaseAdmin
          .from("profiles")
          .select("is_admin")
          .eq("id", callerUser.id)
          .maybeSingle();

        if (globalProfile?.is_admin) {
          isAuthorizedAdmin = true;
        }
      }
    }

    if (!isAuthorizedAdmin) {
      return new Response(
        JSON.stringify({ error: "Acceso denegado: Se requieren permisos de administrador Deblex" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Parsear body de la solicitud
    const body = await req.json();
    const { email } = body;

    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Correo electrónico inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Reservar cupo de operador mediante RPC transaccional segura
    const { data: reservationData, error: quotaError } = await supabaseUserClient.rpc(
      "reserve_deblex_operator_quota",
      { p_email: cleanEmail }
    );

    if (quotaError) {
      return new Response(
        JSON.stringify({ error: quotaError.message || "No se pudo reservar el cupo para el operador" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Invitar al usuario a través del API administrativo oficial de Supabase Auth
    // No se reciben contraseñas en texto plano: el usuario recibe invitación segura por email
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
      data: {
        portal: "deblex",
        role: "deblex_operator",
        invited_by: callerUser.id,
      },
    });

    if (inviteError) {
      // Compensar en caso de fallo: marcar status como FAILED para no retener el cupo permanentemente
      await supabaseAdmin
        .from("deblex_portal_users")
        .update({ status: "FAILED", is_active: false, updated_at: new Date().toISOString() })
        .eq("email", cleanEmail);

      await supabaseAdmin.from("deblex_user_invitations").insert({
        email: cleanEmail,
        role: "deblex_operator",
        invited_by: callerUser.id,
        status: "FAILED",
        error_message: inviteError.message,
      });

      return new Response(
        JSON.stringify({ error: `Fallo al enviar invitación segura de Auth: ${inviteError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Asociar user_id generado por Auth en deblex_portal_users
    if (inviteData?.user?.id) {
      await supabaseAdmin
        .from("deblex_portal_users")
        .update({
          user_id: inviteData.user.id,
          status: "PENDING_INVITE",
          updated_at: new Date().toISOString(),
        })
        .eq("email", cleanEmail);
    }

    // 8. Registrar en auditoría de invitaciones
    await supabaseAdmin.from("deblex_user_invitations").insert({
      email: cleanEmail,
      role: "deblex_operator",
      invited_by: callerUser.id,
      status: "PENDING",
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitación oficial enviada a ${cleanEmail}. El usuario activará su cuenta mediante enlace seguro.`,
        data: {
          email: cleanEmail,
          role: "deblex_operator",
          status: "PENDING_INVITE",
          quota_allocated: reservationData?.allocated_count,
          max_allowed: reservationData?.max_allowed,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
