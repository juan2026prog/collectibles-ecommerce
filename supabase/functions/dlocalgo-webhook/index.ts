import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { triggerZincVerificationIfNeeded } from "../_shared/order-payments.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const reply = (body: Record<string,unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
async function signature(secret: string, login: string, date: string, raw: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(login + date + raw));
  return "V2-HMAC-SHA256, Signature: " + btoa(String.fromCharCode(...new Uint8Array(sig)));
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const raw = await req.text();
    const event = JSON.parse(raw);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) return reply({ error: "SERVER_NOT_CONFIGURED" }, 503);
    const db = createClient(url, serviceKey);
    const { data: settings, error: settingsError } = await db.from("site_settings").select("key,value");
    if (settingsError) throw settingsError;
    const cfg = Object.fromEntries((settings || []).map((x: any) => [x.key,x.value]));
    const login = String(cfg.payments_dlocal_go_x_login || "").trim();
    const secret = String(cfg.payments_dlocal_go_secret_key || "").trim();
    const date = req.headers.get("X-Date") || "";
    const auth = req.headers.get("Authorization") || "";
    if (!login || !secret) return reply({ error: "SIGNATURE_NOT_CONFIGURED" }, 503);
    if (!date || !auth) return reply({ error: "UNAUTHENTICATED" }, 401);
    // Reject stale callbacks to reduce replay surface. Reconciliation handles older events.
    const timestamp = Date.parse(date);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 300000) return reply({ error: "STALE_EVENT" }, 401);
    const expected = await signature(secret,login,date,raw);
    const a = new TextEncoder().encode(auth), b = new TextEncoder().encode(expected);
    if (a.length !== b.length || a.reduce((diff, v, i) => diff | (v ^ b[i]),0) !== 0) return reply({ error: "INVALID_SIGNATURE" }, 401);
    const orderId = String(event.order_id || "");
    const paymentId = String(event.id || "");
    if (!orderId || !paymentId) return reply({ error: "MISSING_PAYMENT_ID" }, 400);
    const { data: order, error: orderError } = await db.from("orders").select("id,status,is_international,payment_method,payment_id,total_amount,currency,payment_processed_at,payment_status").eq("id",orderId).maybeSingle();
    if (orderError || !order || order.is_international !== true || order.payment_method !== "dlocalgo" || String(order.payment_id) !== paymentId) return reply({ error: "PAYMENT_ORDER_MISMATCH" }, 409);
    // Never trust callback status/amount alone; reconcile against provider.
    const apiKey = String(cfg.payments_dlocal_go_api_key || "").trim();
    if (!apiKey) return reply({ error: "API_KEY_NOT_CONFIGURED" }, 503);
    const apiBase = cfg.payments_dlocal_go_sandbox === "true" ? "https://api-sbx.dlocalgo.com" : "https://api.dlocalgo.com";
    const providerResponse = await fetch(`${apiBase}/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${apiKey}:${secret}`, Accept: "application/json" } });
    if (!providerResponse.ok) return reply({ error: "PROVIDER_VERIFICATION_UNAVAILABLE" }, 503);
    const remote = await providerResponse.json();
    if (String(remote.id) !== paymentId || String(remote.order_id) !== orderId ||
      String(remote.currency || "").toUpperCase() !== String(order.currency || "").toUpperCase() ||
      !Number.isFinite(Number(remote.amount)) ||
      Math.abs(Number(remote.amount) - Number(order.total_amount)) > 0.01) return reply({ error: "FINANCIAL_MISMATCH" }, 409);
    const status = String(remote.status || "").toUpperCase();
    if (["PAID","APPROVED"].includes(status)) {
      const { data: confirmed, error: confirmError } = await db.rpc("confirm_payment_atomic", { p_order_id: orderId, p_payment_provider: "dlocalgo", p_payment_ref: paymentId });
      if (confirmError || !confirmed?.success) return reply({ error: "PAYMENT_RECONCILIATION_REQUIRED" }, 503);
      // A failed Zinc dispatch must be retried by reconciliation; never reverse an approved payment here.
      try { await triggerZincVerificationIfNeeded(db,url,serviceKey,orderId); }
      catch (e) { console.error("ZINC_DISPATCH_RECONCILIATION_REQUIRED",orderId,e); return reply({ error: "ZINC_DISPATCH_RECONCILIATION_REQUIRED" },503); }
      return reply({ received: true, status: "paid" });
    }
    // Refunds, disputes and declines are never automatically interpreted as proof
    // that Zinc was cancelled or shipping collaborator funds were recovered.
    // Keep financial state untouched until a dedicated reconciliation workflow verifies it.
    console.warn("DLOCAL_MANUAL_RECONCILIATION_REQUIRED",orderId,paymentId,status);
    return reply({ received: true, status, reconciliation_required: true });
  } catch (e) {
    console.error("DLOCAL_WEBHOOK_FAILURE",e);
    return reply({ error: "WEBHOOK_FAILED" },500);
  }
});
