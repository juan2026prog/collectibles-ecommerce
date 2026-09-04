// supabase/functions/zinc-webhook/index.ts
// Official Zinc API V2 Webhook Receiver
// Custom Auth: Zinc HMAC-SHA256 signature verification over raw request body
// Security: verify_jwt = false (external Zinc webhooks authenticated via HMAC)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { 
  verifyWebhookSignature, 
  computeSha256Hex, 
  mapZincEventToInternalStatus,
  shouldTransitionPurchaseStatus
} from "../_shared/zinc/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-event",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(supabaseUrl, serviceRoleKey);

  let currentEventId: string | null = null;
  let currentAttempts = 0;

  try {
    // 1. Extract raw request body BEFORE any JSON parsing
    const rawBody = await req.text();
    if (!rawBody || rawBody.trim().length === 0) {
      return json({ error: "Empty request body" }, 400);
    }

    // 2. Extract verification headers (strictly X-Webhook-Signature and X-Webhook-Event)
    const signature = req.headers.get("x-webhook-signature") || req.headers.get("X-Webhook-Signature");
    const eventHeader = req.headers.get("x-webhook-event") || req.headers.get("X-Webhook-Event");

    if (!signature) {
      return json({ error: "Missing required X-Webhook-Signature header" }, 401);
    }

    // 3. Retrieve Webhook secrets for Sandbox and Production from Supabase Vault
    const [{ data: sandboxSecret }, { data: prodSecret }] = await Promise.all([
      service.rpc("get_zinc_vault_secret", { p_environment: "sandbox", p_secret_type: "webhook_secret" }),
      service.rpc("get_zinc_vault_secret", { p_environment: "production", p_secret_type: "webhook_secret" }),
    ]);

    // 4. Timing-safe signature verification against both environments
    const isSandbox = sandboxSecret ? await verifyWebhookSignature(rawBody, signature, sandboxSecret) : false;
    const isProd = prodSecret ? await verifyWebhookSignature(rawBody, signature, prodSecret) : false;

    if (!isSandbox && !isProd) {
      return json({ error: "Invalid webhook signature" }, 401);
    }

    // Ambiguous secret match defense: if both match (e.g. reused secret), reject for security
    if (isSandbox && isProd) {
      return json({ error: "Ambiguous secret match: webhook signature matched multiple environments" }, 401);
    }

    const environment: "sandbox" | "production" = isProd ? "production" : "sandbox";

    // 5. Deduplication key by SHA-256 of raw body
    const payloadSha256 = await computeSha256Hex(rawBody);

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: "Malformed JSON payload" }, 400);
    }

    const eventType = String(payload.event || eventHeader || "unknown");
    const zincOrderId = payload.order_id ? String(payload.order_id) : null;
    const returnId = payload.return_id ? String(payload.return_id) : null;
    const status = payload.status ? String(payload.status) : null;
    const eventTimestamp = payload.timestamp ? new Date(payload.timestamp).toISOString() : new Date().toISOString();

    // 6. Durable event persistence into public.zinc_webhook_events
    // Initially inserted with processed_at = NULL and processing_status = 'received'
    const { data: insertedEvent, error: insertError } = await service
      .from("zinc_webhook_events")
      .insert({
        environment,
        event_type: eventType,
        zinc_order_id: zincOrderId,
        return_id: returnId,
        status,
        event_timestamp: eventTimestamp,
        payload_sha256: payloadSha256,
        event_payload: payload,
        received_at: new Date().toISOString(),
        processed_at: null,
        processing_status: "received",
        processing_attempts: 0,
      })
      .select("id, processing_attempts")
      .single();

    if (insertError) {
      // Handle duplicate delivery constraint (UNIQUE on environment, payload_sha256)
      if (insertError.code === "23505" || insertError.message?.includes("duplicate key")) {
        const { data: existingEvent } = await service
          .from("zinc_webhook_events")
          .select("id, processing_status, processing_attempts")
          .eq("environment", environment)
          .eq("payload_sha256", payloadSha256)
          .maybeSingle();

        if (existingEvent && ["processed", "unhandled", "unmatched", "unhandled_return"].includes(existingEvent.processing_status)) {
          return json({
            ok: true,
            already_received: true,
            environment,
            event: eventType,
            processing_status: existingEvent.processing_status,
            message: "Duplicate webhook delivery already processed",
          }, 200);
        }

        // If previously failed or received, allow safe reprocessing attempt
        if (existingEvent) {
          currentEventId = existingEvent.id;
          currentAttempts = existingEvent.processing_attempts || 0;
        } else {
          return json({ ok: true, already_received: true }, 200);
        }
      } else {
        console.error("[zinc-webhook] Durable insert error:", insertError.message);
        return json({ error: "Failed to persist webhook event" }, 500);
      }
    } else if (insertedEvent) {
      currentEventId = insertedEvent.id;
      currentAttempts = insertedEvent.processing_attempts || 0;
    }

    // Mark as processing
    if (currentEventId) {
      await service
        .from("zinc_webhook_events")
        .update({
          processing_status: "processing",
          last_processing_at: new Date().toISOString(),
        })
        .eq("id", currentEventId);
    }

    // 7. Event classification & idempotent processing
    const mapped = mapZincEventToInternalStatus(eventType, status);

    // 7A. Unknown Event: persist without altering order state
    if (mapped.is_unknown) {
      if (currentEventId) {
        await service
          .from("zinc_webhook_events")
          .update({
            processing_status: "unhandled",
            processed_at: new Date().toISOString(),
            last_processing_at: new Date().toISOString(),
          })
          .eq("id", currentEventId);
      }
      return json({ ok: true, unhandled: true, event: eventType }, 200);
    }

    // 7B. Return Event: persist durable event without corrupting purchase_status
    if (mapped.is_return_event) {
      if (currentEventId) {
        await service
          .from("zinc_webhook_events")
          .update({
            processing_status: "unhandled_return",
            processed_at: new Date().toISOString(),
            last_processing_at: new Date().toISOString(),
          })
          .eq("id", currentEventId);
      }
      return json({ ok: true, return_event: true, event: eventType, return_id: returnId }, 200);
    }

    // 7C. Order Events: requires matching internal order item
    if (!zincOrderId) {
      if (currentEventId) {
        await service
          .from("zinc_webhook_events")
          .update({
            processing_status: "unmatched",
            processed_at: new Date().toISOString(),
            last_processing_at: new Date().toISOString(),
          })
          .eq("id", currentEventId);
      }
      return json({ ok: true, unmatched: true, reason: "No order_id in webhook" }, 200);
    }

    const { data: currentItem, error: fetchItemErr } = await service
      .from("international_order_items")
      .select("*")
      .eq("zinc_order_id", zincOrderId)
      .maybeSingle();

    if (fetchItemErr) {
      throw fetchItemErr;
    }

    if (!currentItem) {
      // Order ID not found in internal system (e.g. manual test or external purchase)
      if (currentEventId) {
        await service
          .from("zinc_webhook_events")
          .update({
            processing_status: "unmatched",
            processed_at: new Date().toISOString(),
            last_processing_at: new Date().toISOString(),
          })
          .eq("id", currentEventId);
      }
      return json({ ok: true, unmatched: true, zinc_order_id: zincOrderId }, 200);
    }

    // 7D. Monotonic order status progression
    const updates: Record<string, unknown> = {
      zinc_response_payload: payload,
      last_zinc_status_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (mapped.purchase_status && shouldTransitionPurchaseStatus(currentItem.purchase_status, mapped.purchase_status)) {
      updates.purchase_status = mapped.purchase_status;
    }

    if (eventType === "order.failed" || eventType === "order.cancelled") {
      updates.review_reason_code = "ZINC_WEBHOOK_FAILED";
      updates.zinc_error_message = payload.data?.error || payload.data?.reason || `Zinc order transitioned to ${eventType}`;
    }

    // Multi-package tracking numbers parser
    const trackingList = payload.data?.tracking_numbers;
    if (Array.isArray(trackingList) && trackingList.length > 0) {
      const firstTrack = trackingList[0];
      if (firstTrack.tracking_number) {
        updates.tracking_number = firstTrack.tracking_number;
      }
      if (firstTrack.carrier) {
        updates.carrier = firstTrack.carrier;
      }
      if (firstTrack.url) {
        updates.tracking_url = firstTrack.url;
      }

      const anyDelivered = trackingList.find((t: any) => t.delivered_at);
      if (anyDelivered || eventType === "order.delivered") {
        updates.purchase_status = "delivered_to_courier";
        updates.delivered_to_courier_at = anyDelivered?.delivered_at || new Date().toISOString();
      }
    } else if (eventType === "order.delivered") {
      updates.purchase_status = "delivered_to_courier";
      updates.delivered_to_courier_at = new Date().toISOString();
    }

    const { error: updateItemErr } = await service
      .from("international_order_items")
      .update(updates)
      .eq("id", currentItem.id);

    if (updateItemErr) {
      throw updateItemErr;
    }

    // If order transitioned to failure, flag parent order for manual review
    if (mapped.order_status === "manual_review" && currentItem.order_item_id) {
      const { data: itemRec, error: itemRecErr } = await service
        .from("order_items")
        .select("order_id")
        .eq("id", currentItem.order_item_id)
        .maybeSingle();

      if (!itemRecErr && itemRec?.order_id) {
        const { error: orderUpdErr } = await service
          .from("orders")
          .update({ status: "manual_review" })
          .eq("id", itemRec.order_id);
        if (orderUpdErr) {
          console.error("[zinc-webhook] Parent order update error:", orderUpdErr.message);
        }
      }
    }

    // 8. Processing succeeded: mark processed_at = NOW() and processing_status = 'processed'
    if (currentEventId) {
      await service
        .from("zinc_webhook_events")
        .update({
          processing_status: "processed",
          processed_at: new Date().toISOString(),
          last_processing_at: new Date().toISOString(),
          processing_error: null,
        })
        .eq("id", currentEventId);
    }

    return json({
      ok: true,
      processed: true,
      event: eventType,
      environment,
      event_id: currentEventId,
    }, 200);

  } catch (err: any) {
    const errorMsg = String(err?.message || err).slice(0, 1000);
    console.error("[zinc-webhook] Processing failure:", errorMsg);

    // Durable failure tracking: keep processed_at = NULL, increment attempts, return 500 for Zinc retry
    if (currentEventId) {
      try {
        await service
          .from("zinc_webhook_events")
          .update({
            processing_status: "failed",
            processed_at: null,
            processing_error: errorMsg,
            processing_attempts: currentAttempts + 1,
            last_processing_at: new Date().toISOString(),
          })
          .eq("id", currentEventId);
      } catch (logErr) {
        console.error("[zinc-webhook] Failed to record processing error:", logErr);
      }
    }

    return json({ error: "Failed to process webhook event" }, 500);
  }
});
