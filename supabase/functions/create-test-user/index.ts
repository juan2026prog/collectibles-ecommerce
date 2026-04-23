import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    // ══════════════════════════════════════════════════════════
    // SECURITY: This function creates a GOD-MODE super admin.
    // It MUST be disabled in production environments.
    // ══════════════════════════════════════════════════════════
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const isProduction = !supabaseUrl.includes('localhost') && !supabaseUrl.includes('127.0.0.1');
    
    // Check for an explicit opt-in env var to allow this in deployed environments
    const allowTestUser = Deno.env.get("ALLOW_TEST_USER_CREATION") === "true";
    
    if (isProduction && !allowTestUser) {
      console.error("🚨 BLOCKED: create-test-user called in production without ALLOW_TEST_USER_CREATION=true");
      return new Response(
        JSON.stringify({ error: "This function is disabled in production. Set ALLOW_TEST_USER_CREATION=true in Edge Function secrets to enable." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "email and password required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: any) => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      if (!existingUser.email_confirmed_at) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          email_confirm: true,
        });
      }
    } else {
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createErr || !newUser?.user) {
        return new Response(
          JSON.stringify({ error: createErr?.message || "Failed to create user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = newUser.user.id;
    }

    // Upsert profile with ALL roles
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      first_name: "Super",
      last_name: "Admin",
      is_admin: true,
      is_vendor: true,
      is_artist: true,
      is_affiliate: true,
    });

    // Create vendor record
    await supabaseAdmin.from("vendors").upsert({
      id: userId,
      store_name: "God Store",
      slug: "god-store",
      status: "active",
      description: "Test vendor store for development",
    });

    // Create artist record
    await supabaseAdmin.from("artists").upsert({
      id: userId,
      display_name: "Test Artist",
      slug: "test-artist",
      bio: "Development test artist",
    });

    // Create star2fan creator record
    await supabaseAdmin.from("star2fan_creators").upsert({
      id: userId,
      email,
      stage_name: "God Creator",
      slug: "god-creator",
      category: "testing",
      short_bio: "Development test creator",
      standard_price: 50,
      premium_price: 150,
      rush_delivery_price: 250,
      status: "active",
    });

    // Create affiliate record
    await supabaseAdmin.from("affiliates").upsert({
      id: userId,
      code: "GOD_MODE_2026",
      status: "active",
    });

    // Seed default site_settings if empty
    const { count } = await supabaseAdmin.from("site_settings").select("*", { count: "exact", head: true });
    if (!count || count === 0) {
      await supabaseAdmin.from("site_settings").upsert([
        { key: "store_name", value: "Collectibles" },
        { key: "store_tagline", value: "Premium Collectibles Store" },
        { key: "currency", value: "UYU" },
        { key: "currency_symbol", value: "$" },
        { key: "free_shipping_threshold", value: "4000" },
        { key: "default_shipping_rate", value: "250" },
        { key: "appearance_announcement_text", value: "🚚 Envío gratis en compras mayores a $4000 · 🔒 Pago seguro con dLocal Go · ⭐ Productos originales garantizados" },
        { key: "appearance_announcement_bg", value: "#000000" },
        { key: "appearance_announcement_color", value: "#ffffff" },
        { key: "appearance_announcement_marquee", value: "true" },
        { key: "appearance_announcement_speed", value: "20" },
        { key: "appearance_favicon", value: "" },
        { key: "appearance_head_code", value: "" },
        { key: "appearance_footer_text", value: "© 2026 Collectibles. Todos los derechos reservados." },
        { key: "appearance_footer_html", value: "" },
        { key: "appearance_menu_json", value: JSON.stringify([
          { label: "Inicio", url: "/", subItems: [] },
          { label: "Tienda", url: "/shop", subItems: [
            { label: "Novedades", url: "/shop?sort=newest" },
            { label: "Ofertas", url: "/shop?filter=sale" }
          ]},
          { label: "Contacto", url: "/page/contacto", subItems: [] }
        ])},
        { key: "appearance_footer_menu_json", value: JSON.stringify([
          { label: "Términos y Condiciones", url: "/page/terminos", subItems: [] },
          { label: "Política de Privacidad", url: "/page/privacidad", subItems: [] },
          { label: "Preguntas Frecuentes", url: "/page/faq", subItems: [] },
          { label: "Devoluciones", url: "/page/devoluciones", subItems: [] }
        ])}
      ], { onConflict: "key" });
    }

    // Seed default feature_toggles if empty
    const { count: tCount } = await supabaseAdmin.from("feature_toggles").select("*", { count: "exact", head: true });
    if (!tCount || tCount === 0) {
      await supabaseAdmin.from("feature_toggles").insert([
        { name: "Marketplace (Vendors)", description: "Habilita el portal de vendedores multi-tienda", module_key: "marketplace", is_enabled: true },
        { name: "Artistas y Comisiones", description: "Portal para artistas con sistema de comisiones personalizadas", module_key: "artists", is_enabled: true },
        { name: "Star2Fan (Video Saludos)", description: "Saludos personalizados de celebridades e influencers", module_key: "star2fan", is_enabled: true },
        { name: "Afiliados e Influencers", description: "Sistema de referidos con tracking de links y comisiones", module_key: "affiliates", is_enabled: true },
        { name: "Mercado Libre Sync", description: "Sincronización bidireccional con Mercado Libre", module_key: "mercadolibre", is_enabled: false },
        { name: "Meta Pixel y CAPI", description: "Tracking de conversiones con Meta Pixel + Conversion API", module_key: "meta", is_enabled: false },
        { name: "Google Analytics", description: "Integración con Google Analytics 4", module_key: "google_analytics", is_enabled: false },
        { name: "CRM Avanzado", description: "Segmentación de clientes, grupos y badges", module_key: "crm", is_enabled: true },
        { name: "Mailing Automatizado", description: "Campañas de email marketing con segmentación", module_key: "mailing", is_enabled: false }
      ]);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userId, 
        message: "God mode fully activated. All roles, settings & modules seeded." 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
