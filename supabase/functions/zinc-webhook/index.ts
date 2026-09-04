// supabase/functions/zinc-webhook/index.ts
// Official Zinc API V2 Webhook Receiver
// Custom Auth: Zinc HMAC-SHA256 signature verification over raw request body

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { 
  verifyWebhookSignature, 
  computeSha256Hex, 
  mapZincEventToInternalStatus 
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

  try {
    // 1. Extract raw request body BEFORE any parsing
    const rawBody = await req.text();
    if (!rawBody || rawBody.trim().length === 0) {
      return json({ error: "Empty request body" }, 400);
    }

    // 2. Extract verification headers
    const signature = req.headers.get("x-webhook-signature") || req.headers.get("X-Webhook-Signature");
    const eventHeader = req.headers.get("x-webhook-event") || req.headers.get("X-Webhook-Event");

    if (!signature) {
      return json({ error: "Missing required X-Webhook-Signature header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(supabaseUrl, serviceRoleKey);

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

    const environment = isProd ? "production" : "sandbox";

    // 5. Deduplication by SHA-256 of raw body
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
        processed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      // Check if duplicate key violation (UNIQUE on environment, payload_sha256)
      if (insertError.code === "23505" || insertError.message?.includes("duplicate key")) {
        // Fast ACK 200 for duplicated deliveries without reprocessing
        return json({
          ok: true,
          already_received: true,
          environment,
          event: eventType,
          message: "Duplicate webhook event delivery ignored",
        }, 200);
      }
      console.error("[zinc-webhook] Insert error:", insertError.message);
      // Even on db error, if signature was valid, return 500 so Zinc retries
      return json({ error: "Failed to persist webhook event" }, 500);
    }

    // 7. Internal order and tracking status update
    if (zincOrderId) {
      try {
        const mapped = mapZincEventToInternalStatus(eventType, status);
        const updates: Record<string, unknown> = {
          purchase_status: mapped.purchase_status,
          zinc_response_payload: payload,
          last_zinc_status_check_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (eventType === "order.failed" || eventType === "order.cancelled") {
          updates.review_reason_code = "ZINC_WEBHOOK_FAILED";
          updates.zinc_error_message = payload.data?.error || payload.data?.reason || `Zinc order transitioned to ${eventType}`;
        }

        // Extract tracking info if provided in webhook data
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
          if (firstTrack.delivered_at || eventType === "order.delivered") {
            updates.purchase_status = "delivered_to_courier";
            updates.delivered_to_courier_at = firstTrack.delivered_at || new Date().toISOString();
          }
        }

        const { data: updatedItem } = await service
          .from("international_order_items")
          .update(updates)
          .eq("zinc_order_id", zincOrderId)
          .select("order_item_id")
          .maybeSingle();

        // If parent order needs manual review on cancellation/failure
        if (mapped.order_status === "manual_review" && updatedItem?.order_item_id) {
          const { data: itemRec } = await service
            .from("order_items")
            .select("order_id")
            .eq("id", updatedItem.order_item_id)
            .maybeSingle();
          if (itemRec?.order_id) {
            await service.from("orders").update({ status: "manual_review" }).eq("id", itemRec.order_id);
          }
        }
      } catch (err) {
        console.error("[zinc-webhook] Error updating internal order:", err);
      }
    }

    // 8. Fast ACK 200 to Zinc
    return json({
      ok: true,
      received: true,
      event: eventType,
      environment,
      event_id: insertedEvent?.id,
    }, 200);

  } catch (err) {
    console.error("[zinc-webhook] Unhandled error:", err instanceof Error ? err.message : String(err));
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
