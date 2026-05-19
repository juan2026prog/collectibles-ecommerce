import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ══════════════════════════════════════════════════════════════════
// SEC-CRIT-02: create-test-user PERMANENTLY DISABLED
// 
// This function previously created a GOD-MODE super admin user
// with all roles enabled. It has been permanently disabled as
// part of the security hardening initiative.
//
// To create admin users, use:
// 1. Supabase Dashboard → Authentication → Users
// 2. The secure `create-user` Edge Function (requires admin JWT)
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // Allow preflight for backwards compat (prevents CORS errors if old clients call this)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "https://collectibles-ecommerce.vercel.app",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  // ALWAYS return 403 — this function is permanently disabled
  console.warn("🚨 SEC-CRIT-02: Blocked call to disabled create-test-user function");

  return new Response(
    JSON.stringify({
      error: "This function has been permanently disabled for security reasons. Use the Supabase Dashboard or the secure create-user Edge Function instead.",
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://collectibles-ecommerce.vercel.app",
      },
    }
  );
});
