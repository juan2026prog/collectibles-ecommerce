import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ══════════════════════════════════════════════════════════════════
// SEC-CRIT-04: seed-paypal PERMANENTLY DISABLED
// 
// This function previously contained HARDCODED PayPal Client ID
// and Client Secret in plaintext. Those credentials have been
// removed and this function is permanently disabled.
//
// ⚠️  ACTION REQUIRED: Rotate your PayPal credentials immediately
//     at https://developer.paypal.com/dashboard/applications
//
// To configure PayPal, use Admin > Settings > Payments in the UI.
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (_req: Request) => {
  console.warn("🚨 SEC-CRIT-04: Blocked call to disabled seed-paypal function");
  
  return new Response(
    JSON.stringify({
      error: "This function has been permanently disabled. PayPal credentials must never be hardcoded. Use Admin > Settings > Payments.",
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }
  );
});
