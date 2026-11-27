import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

// ══════════════════════════════════════════════════════════════════
// SEC-CRIT-02: create-test-user PERMANENTLY DISABLED
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  console.warn("🚨 SEC-CRIT-02: Blocked call to disabled create-test-user function");

  return new Response(
    JSON.stringify({
      error: "This function has been permanently disabled for security reasons. Use the Supabase Dashboard or the secure create-user Edge Function instead.",
    }),
    {
      status: 403,
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json",
      },
    },
  );
});
