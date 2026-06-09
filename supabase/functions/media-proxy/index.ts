import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const url = new URL(req.url);
    const targetUrlRaw = url.searchParams.get('url');

    if (!targetUrlRaw) {
      return new Response("Missing 'url' parameter", { status: 400 });
    }

    // Decode URL
    let targetUrl;
    try {
      targetUrl = decodeURIComponent(targetUrlRaw);
    } catch (e) {
      return new Response("Invalid 'url' encoding", { status: 400 });
    }

    // Security check: Only allow Amazon images or specific domains
    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl);
    } catch (e) {
      return new Response("Invalid URL format", { status: 400 });
    }

    if (!parsedTarget.hostname.endsWith('amazon.com') && parsedTarget.hostname !== 'via.placeholder.com') {
      return new Response("Domain not allowed for proxy", { status: 403 });
    }

    const imageRes = await fetch(targetUrl);

    if (!imageRes.ok) {
      return new Response("Failed to fetch image", { status: imageRes.status });
    }

    // Cache the image for a long time (1 year)
    const headers = new Headers(imageRes.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(imageRes.body, {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error("media-proxy error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
