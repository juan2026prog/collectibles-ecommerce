import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    // 1. Verify the requester is an admin.
    await verifyAdmin(req);

    // 2. Parse request body
    const body = await req.json();
    const { email, password, roles, firstName, lastName } = body;

    if (!email || !password) {
      throw new Error("Se requiere correo y contraseña para crear un usuario");
    }

    // 3. Admin client to bypass normal auth restrictions
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Create User in Auth system
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the user when created by admin
      user_metadata: {
        first_name: firstName || '',
        last_name: lastName || ''
      }
    });

    if (authError || !newUser?.user) {
      throw new Error(authError?.message || "No se pudo crear el usuario en el sistema Auth");
    }

    // 5. Update their roles in the profiles table
    if (roles) {
      const updatePayload: Record<string, boolean> = {
        is_admin: roles.includes('admin'),
        is_vendor: roles.includes('vendor'),
        is_artist: roles.includes('artist'),
        is_affiliate: roles.includes('affiliate')
      };

      if (firstName) updatePayload.first_name = firstName;
      if (lastName) updatePayload.last_name = lastName;

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(updatePayload)
        .eq('id', newUser.user.id);
        
      if (profileError) {
        throw new Error("Usuario creado, pero hubo un error actualizando los roles: " + profileError.message);
      }
    }

    return new Response(JSON.stringify({ success: true, user: newUser.user }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("create-user error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400, // Return standard 400 for errors so the frontend can catch it easily
    });
  }
});
