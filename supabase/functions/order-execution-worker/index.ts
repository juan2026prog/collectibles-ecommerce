import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { enqueueMlSyncEvent } from "../_shared/mercadolibre.ts";
import { triggerZincVerificationIfNeeded } from "../_shared/order-payments.ts";
import { verifyAdmin } from "../_shared/auth.ts";

declare const Deno: any;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ══════════════════════════════════════════════════════════
    // 1. STRICT SERVER-TO-SERVER AUTHENTICATION & AUTHORIZATION
    // Only service_role key or authenticated system admin can trigger outbox execution
    // ══════════════════════════════════════════════════════════
    const authHeader = req.headers.get("Authorization");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    let isAuthorized = false;
    if (authHeader && supabaseServiceKey) {
      const token = authHeader.replace("Bearer ", "").trim();
      if (token === supabaseServiceKey) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      // Check if caller is authenticated admin user
      try {
        await verifyAdmin(req);
        isAuthorized = true;
      } catch (authErr: any) {
        console.error("🚨 [Order Execution Worker] Unauthorized access blocked:", authErr.message);
        return new Response(JSON.stringify({ error: "Unauthorized: Service role or admin privileges required" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const workerId = `worker-recover-${Math.random().toString(36).slice(2, 9)}`;

    // ══════════════════════════════════════════════════════════
    // 2. CLAIM JOBS WITH FOR UPDATE SKIP LOCKED
    // ══════════════════════════════════════════════════════════
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

          if (!suborderId || !providerCode) {
            throw new Error(`Invalid shipping_creation payload: suborder_id or provider missing`);
          }

          // Fetch full parent order and suborder for real shipment registration
          const { data: fullOrder, error: ordErr } = await supabaseAdmin
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .single();

          if (ordErr || !fullOrder) throw new Error(`Parent order ${orderId} not found for shipping creation`);

          const { data: suborder, error: subErr } = await supabaseAdmin
            .from("order_suborders")
            .select("*")
            .eq("id", suborderId)
            .single();

          if (subErr || !suborder) throw new Error(`Suborder ${suborderId} not found for shipping creation`);

          const addr = fullOrder.shipping_address || {};
          const customerName = `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || 'Cliente';
          const customerPhone = fullOrder.customer_phone || addr.phone || '';
          const customerAddress = addr.street || '';
          const customerCity = addr.city || '';
          const customerDepartment = addr.department || '';

          let labelType = 'courier';
          if (providerCode === 'soydelivery') {
            labelType = 'flex';
          }

          // Check if shipment row already created
          const { data: existingShip } = await supabaseAdmin
            .from('shipments')
            .select('id')
            .eq('suborder_id', suborder.id)
            .maybeSingle();

          let shipmentId = existingShip?.id;
          if (!shipmentId) {
            const { data: createdShip, error: createErr } = await supabaseAdmin
              .from('shipments')
              .insert({
                order_id: orderId,
                suborder_id: suborder.id,
                provider_key: providerCode,
                tracking_code: null,
                internal_reference: `COL-${suborder.suborder_number}`,
                shipping_status: 'queued',
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_address: customerAddress,
                customer_city: customerCity,
                customer_department: customerDepartment,
                barcode_value: `COL-${suborder.suborder_number}`,
                qr_value: `COL-${suborder.suborder_number}`,
                label_type: labelType,
                label_version: 1,
                label_generated_at: new Date().toISOString()
              })
              .select('id')
              .single();

            if (createErr || !createdShip) {
              throw new Error(`Failed to create shipment row: ${createErr?.message}`);
            }
            shipmentId = createdShip.id;

            await supabaseAdmin.from('shipment_events').insert({
              shipment_id: shipmentId,
              event_type: 'queued',
              description: `Envío encolado para registro automático en ${providerCode.toUpperCase()}`,
              provider_status: 'queued'
            });
          }

          // Insert into shipping_queue if not exists
          const { data: existingQueue } = await supabaseAdmin
            .from('shipping_queue')
            .select('id')
            .eq('shipment_id', shipmentId)
            .maybeSingle();

          if (!existingQueue) {
            const { error: queueErr } = await supabaseAdmin
              .from('shipping_queue')
              .insert({
                shipment_id: shipmentId,
                provider_code: providerCode,
                action: 'create_shipment',
                priority: 0,
                attempts: 0,
                status: 'queued',
                next_attempt_at: new Date().toISOString()
              });

            if (queueErr) {
              throw new Error(`Failed to insert shipping queue item: ${queueErr.message}`);
            }
          }
          console.log(`[Recover Worker ${workerId}] Shipment ${shipmentId} verified and enqueued for ${providerCode}`);
        }

        // Mark COMPLETED with strict lease ownership check
        const { error: completeErr } = await supabaseAdmin
          .from("order_execution_jobs")
          .update({
            status: "COMPLETED",
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_error: null,
            locked_by: null,
            locked_at: null,
          })
          .eq("id", jobId)
          .eq("locked_by", workerId);

        if (completeErr) {
          console.warn(`[Recover Worker ${workerId}] Completion update note for Job ${jobId}:`, completeErr.message);
        }

        processedCount++;
      } catch (execErr: any) {
        console.error(`[Recover Worker ${workerId}] Job ${jobId} failed:`, execErr.message);
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
          .eq("id", jobId)
          .eq("locked_by", workerId);

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
