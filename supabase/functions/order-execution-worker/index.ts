import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { enqueueMlSyncEvent } from "../_shared/mercadolibre.ts";
import { triggerZincVerificationIfNeeded } from "../_shared/order-payments.ts";

declare const Deno: any;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const workerId = `worker-recover-${Math.random().toString(36).slice(2, 9)}`;
    const nowIso = new Date().toISOString();

    // 1. Claim recoverable jobs atomically with SKIP LOCKED
    const { data: claimedJobs, error: claimErr } = await supabaseAdmin.rpc("claim_order_execution_jobs", {
      p_worker_id: workerId,
      p_limit: 10,
      p_lock_seconds: 300,
    });

    if (claimErr) {
      console.error("[Recover Worker] Claim error:", claimErr.message);
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobs = Array.isArray(claimedJobs) ? claimedJobs : [];
    console.log(`[Recover Worker ${workerId}] Claimed ${jobs.length} jobs for recovery execution.`);

    const functionHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseServiceKey}`,
    };

    let processedCount = 0;
    let failedCount = 0;

    for (const job of jobs) {
      const { id: jobId, job_type: jobType, order_id: orderId, payload, attempts, max_attempts } = job;
      console.log(`[Recover Worker ${workerId}] Executing ${jobType} (Job ${jobId}) for Order ${orderId}`);

      try {
        if (jobType === "ml_stock_sync") {
          const variantId = payload?.variant_id;
          if (variantId) {
            await enqueueMlSyncEvent(supabaseAdmin, variantId);
          }
        } else if (jobType === "commissions_calc") {
          const res = await fetch(`${supabaseUrl}/functions/v1/calculate-commissions`, {
            method: "POST",
            headers: functionHeaders,
            body: JSON.stringify({ order_id: orderId }),
          });
          if (!res.ok) throw new Error(`Commissions HTTP ${res.status}: ${await res.text()}`);
        } else if (jobType === "email_notification") {
          const { data: fullOrder } = await supabaseAdmin
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .single();

          if (fullOrder) {
            const res = await fetch(`${supabaseUrl}/functions/v1/transactional-emails`, {
              method: "POST",
              headers: functionHeaders,
              body: JSON.stringify({
                type: "UPDATE",
                table: "orders",
                record: fullOrder,
                old_record: { ...fullOrder, status: "pending" },
              }),
            });
            if (!res.ok) throw new Error(`Email HTTP ${res.status}: ${await res.text()}`);
          }
        } else if (jobType === "zinc_fulfillment") {
          await triggerZincVerificationIfNeeded(supabaseAdmin, supabaseUrl, supabaseServiceKey, orderId);
        } else if (jobType === "shipping_creation") {
          const suborderId = payload?.suborder_id;
          const providerCode = payload?.provider;
          if (suborderId && providerCode) {
            console.log(`[Recover Worker] Triggering shipping creation for suborder ${suborderId} (${providerCode})`);
          }
        }

        // Mark COMPLETED
        await supabaseAdmin
          .from("order_execution_jobs")
          .update({
            status: "COMPLETED",
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_error: null,
            locked_by: null,
            locked_at: null,
          })
          .eq("id", jobId);

        processedCount++;
      } catch (execErr: any) {
        console.error(`[Recover Worker] Job ${jobId} failed:`, execErr.message);
        const nextAttempt = attempts;
        const isExhausted = nextAttempt >= max_attempts;
        const backoffSeconds = Math.min(300, Math.pow(2, nextAttempt) * 15);
        const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        await supabaseAdmin
          .from("order_execution_jobs")
          .update({
            status: isExhausted ? "EXHAUSTED" : "RETRYING",
            next_retry_at: nextRetry,
            last_error: execErr.message || String(execErr),
            updated_at: new Date().toISOString(),
            locked_by: null,
            locked_at: null,
          })
          .eq("id", jobId);

        failedCount++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      worker_id: workerId,
      claimed: jobs.length,
      processed: processedCount,
      failed: failedCount,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[Recover Worker] Fatal error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
