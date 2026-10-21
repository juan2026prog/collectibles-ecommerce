import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { processOutboxBatch } from "../_shared/cloudflareCatalogSync.ts";

/**
 * process-catalog-outbox — Edge Function Consumidor del Outbox de Catálogo
 *
 * Responsabilidad:
 * 1. Drena lotes pendientes de `d1_catalog_outbox` hacia Cloudflare D1.
 * 2. Utiliza reserva atómica `claim_d1_outbox_batch` (FOR UPDATE SKIP LOCKED) para evitar concurrencia duplicada.
 * 3. Recupera eventos atascados (heartbeat > 5m).
 * 4. Aplica retroceso exponencial y transición a dead_letter ante 5 fallos.
 */
Deno.serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const expectedSecret = Deno.env.get('CATALOG_SYNC_SECRET') ?? '';

  // Verificación de autorización: Service Role o Bearer Token CATALOG_SYNC_SECRET
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const isServiceRole = token === supabaseServiceKey;
  const isSyncSecret = expectedSecret && token === expectedSecret;

  if (!isServiceRole && !isSyncSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Service Role or Sync Secret required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Body opcional
  }

  const batchSize = Math.max(1, Math.min(100, Number(body.batch_size || 25)));
  const workerUrl = body.worker_url || Deno.env.get('CF_CATALOG_API_URL');
  const syncSecret = body.sync_secret || expectedSecret;

  const result = await processOutboxBatch(supabaseAdmin, {
    batchSize,
    workerUrl,
    syncSecret,
  });

  return new Response(
    JSON.stringify({
      success: result.ok,
      ...result,
      timestamp: new Date().toISOString(),
    }),
    {
      status: result.ok ? 200 : 207,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
