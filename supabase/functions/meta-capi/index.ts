import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getCorsHeaders,
  getOfficialSiteUrl,
  handleOptions,
  isBlockedLegacyHostname,
  isTrustedBrowserOrigin,
} from "../_shared/cors.ts";

declare const Deno: any;

function sanitizeEventSourceUrl(rawUrl: unknown): string {
  const fallback = `${getOfficialSiteUrl()}/`;
  if (!rawUrl || typeof rawUrl !== "string") return fallback;
  try {
    const parsed = new URL(rawUrl.trim());
    if (isBlockedLegacyHostname(parsed.hostname)) {
      return `${getOfficialSiteUrl()}${parsed.pathname}${parsed.search}`;
    }
    if (isTrustedBrowserOrigin(parsed.origin)) {
      return parsed.toString();
    }
  } catch {
    // ignore malformed URL
  }
  return fallback;
}

async function hashSHA256(value: string | undefined): Promise<string | undefined> {
  if (!value) return undefined;

  const cleanValue = value.trim().toLowerCase();
  if (!cleanValue) return undefined;

  const msgBuffer = new TextEncoder().encode(cleanValue);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);
  const originHeader = req.headers.get("origin");
  if (originHeader && !isTrustedBrowserOrigin(originHeader)) {
    return new Response(
      JSON.stringify({ error: "Origin not authorized" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const payload = await req.json();

    const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
    const PIXEL_ID = Deno.env.get("META_PIXEL_ID");
    const TEST_EVENT_CODE = Deno.env.get("META_TEST_EVENT_CODE");

    if (!META_ACCESS_TOKEN || !PIXEL_ID) {
      console.error("[Meta CAPI] Error: Missing Meta configuration in env vars.");
      return new Response(
        JSON.stringify({ error: "Configuration Error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawUserData = payload.user_data || {};

    // Hash sensitive user data fields
    const hashedUserData: Record<string, string | undefined> = {
      em: await hashSHA256(rawUserData.email),
      ph: await hashSHA256(rawUserData.phone),
      fn: await hashSHA256(rawUserData.first_name),
      ln: await hashSHA256(rawUserData.last_name),
      external_id: await hashSHA256(rawUserData.external_id),
      client_ip_address: rawUserData.client_ip_address || req.headers.get("x-forwarded-for") || undefined,
      client_user_agent: rawUserData.client_user_agent || req.headers.get("user-agent") || undefined,
      fbc: rawUserData.fbc,
      fbp: rawUserData.fbp,
    };

    Object.keys(hashedUserData).forEach((key) =>
      hashedUserData[key] === undefined && delete hashedUserData[key]
    );

    const eventName = payload.event_name || "CustomEvent";
    const eventId = payload.event_id ? String(payload.event_id) : `capi_${crypto.randomUUID()}`;
    const eventSourceUrl = sanitizeEventSourceUrl(payload.event_source_url);

    const customData = payload.custom_data || {};
    if (customData.value !== undefined && customData.value !== null) {
      customData.value = Number(customData.value);
      if (isNaN(customData.value)) {
        delete customData.value;
      } else {
        customData.currency = customData.currency || "UYU";
      }
    }
    if (customData.content_ids) {
      if (!Array.isArray(customData.content_ids)) {
        customData.content_ids = [String(customData.content_ids)];
      } else {
        customData.content_ids = customData.content_ids.map(String);
      }
    }

    const fbPayload: any = {
      data: [{
        event_name: eventName,
        event_time: payload.event_time || Math.floor(Date.now() / 1000),
        action_source: payload.action_source || "website",
        event_id: eventId,
        event_source_url: eventSourceUrl,
        user_data: hashedUserData,
        custom_data: customData,
      }],
    };

    if (TEST_EVENT_CODE) {
      fbPayload.test_event_code = TEST_EVENT_CODE;
    }

    console.log(`[Meta CAPI] Sending event: ${eventName} (ID: ${eventId})`);

    const response = await fetch(`https://graph.facebook.com/v17.0/${PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fbPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[Meta CAPI] Error response from Meta:", result);
      return new Response(
        JSON.stringify({ error: "Meta API Error", details: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[Meta CAPI] Success:`, JSON.stringify(result));
    return new Response(
      JSON.stringify({ success: true, metaResponse: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error(`[Meta CAPI] Function Error:`, error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
