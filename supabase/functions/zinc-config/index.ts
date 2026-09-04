import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { 
  validKeyForEnv, 
  validWebhookSecret, 
  testZincConnection, 
  ZincEnvironment 
} from "../_shared/zinc/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");
    if (adminErr || isAdmin !== true) return json({ error: "Forbidden: Se requieren permisos de administrador" }, 403);

    const service = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");

    if (action === "status") {
      const { data, error } = await service
        .from("zinc_integration_settings")
        .select("environment,is_configured,key_prefix,key_last4,is_enabled,last_tested_at,last_test_status,last_test_message,webhook_url,webhook_secret_prefix,webhook_secret_last4,updated_at")
        .order("environment");
      if (error) throw error;
      return json({ ok: true, settings: data || [] });
    }

    if (action === "save_key") {
      const environment = body.environment as ZincEnvironment;
      const apiKey = String(body.api_key || "").trim();
      if (!["sandbox", "production"].includes(environment)) {
        return json({ error: "Invalid environment" }, 400);
      }
      if (!validKeyForEnv(apiKey, environment)) {
        return json({ 
          error: environment === "sandbox" 
            ? "La API Key de Sandbox debe comenzar con 'zn_test_'" 
            : "La API Key de Producción debe comenzar con 'zn_live_'" 
        }, 400);
      }

      const { data, error } = await userClient.rpc("set_zinc_vault_secret", {
        p_environment: environment,
        p_secret: apiKey,
        p_secret_type: "api_key",
      });
      if (error) throw error;
      return json({ ok: true, result: data });
    }

    if (action === "save_webhook_secret") {
      const environment = body.environment as ZincEnvironment;
      const webhookSecret = String(body.webhook_secret || "").trim();
      if (!["sandbox", "production"].includes(environment)) {
        return json({ error: "Invalid environment" }, 400);
      }
      if (!validWebhookSecret(webhookSecret)) {
        return json({ error: "El secreto del webhook debe comenzar con 'zn_whsec_'" }, 400);
      }

      const { data, error } = await userClient.rpc("set_zinc_vault_secret", {
        p_environment: environment,
        p_secret: webhookSecret,
        p_secret_type: "webhook_secret",
      });
      if (error) throw error;
      return json({ ok: true, result: data });
    }

    if (action === "test_connection") {
      const environment = body.environment as ZincEnvironment;
      if (!["sandbox", "production"].includes(environment)) {
        return json({ error: "Invalid environment" }, 400);
      }

      const { data: apiKey, error: keyErr } = await service.rpc("get_zinc_vault_secret", {
        p_environment: environment,
        p_secret_type: "api_key",
      });
      if (keyErr) throw keyErr;
      if (!apiKey || !validKeyForEnv(apiKey, environment)) {
        return json({ error: "Credencial no configurada o inválida para este entorno" }, 400);
      }

      const testResult = await testZincConnection(apiKey, environment);

      await service.from("zinc_integration_settings").update({
        last_tested_at: new Date().toISOString(),
        last_test_status: testResult.ok ? "pass" : "fail",
        last_test_message: testResult.message,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }).eq("environment", environment);

      return json({
        ok: testResult.ok,
        status: testResult.ok ? "pass" : "fail",
        http_status: testResult.status,
        message: testResult.message,
        elapsed_ms: testResult.elapsed_ms,
        test_products_count: testResult.test_products_count,
      }, testResult.ok ? 200 : 400);
    }

    if (action === "set_production_enabled") {
      const enabled = body.enabled === true;
      if (enabled) {
        return json({ error: "La habilitación de compras reales permanece estrictamente bloqueada por seguridad" }, 400);
      }
      const { error } = await service
        .from("zinc_integration_settings")
        .update({ is_enabled: false, updated_at: new Date().toISOString(), updated_by: user.id })
        .eq("environment", "production");
      if (error) throw error;
      return json({ ok: true, production_enabled: false });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[zinc-config]", err instanceof Error ? err.message : String(err));
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
