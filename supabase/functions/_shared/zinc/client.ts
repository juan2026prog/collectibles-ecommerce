// supabase/functions/_shared/zinc/client.ts
// Official Zinc API V2 Client

import { ZincEnvironment, ZincTestProduct, ZincTestProductsResponse } from "./types.ts";
import { getZincAuthHeaders, validKeyForEnv } from "./auth.ts";

export const ZINC_BASE_URL = "https://api.zinc.com";

/**
 * Fetches dynamic sandbox test products from Zinc API.
 */
export async function fetchSandboxTestProducts(apiKey: string): Promise<ZincTestProduct[]> {
  const url = `${ZINC_BASE_URL}/orders/test-products`;
  const res = await fetch(url, {
    method: "GET",
    headers: getZincAuthHeaders(apiKey),
  });

  if (!res.ok) {
    throw new Error(`Zinc test-products responded HTTP ${res.status}`);
  }

  const data = (await res.json()) as ZincTestProductsResponse;
  if (data && Array.isArray(data.products)) {
    return data.products;
  }
  return [];
}

/**
 * Executes a non-destructive connection test against the appropriate authenticated endpoint.
 * - Sandbox: GET /orders/test-products (authenticated read-only)
 * - Production: GET /orders?limit=1 (authenticated read-only, non-destructive)
 */
export async function testZincConnection(apiKey: string, env: ZincEnvironment): Promise<{
  ok: boolean;
  status: number;
  message: string;
  elapsed_ms: number;
  test_products_count?: number;
}> {
  if (!validKeyForEnv(apiKey, env)) {
    return {
      ok: false,
      status: 400,
      message: `Credencial no válida para el entorno ${env}`,
      elapsed_ms: 0,
    };
  }

  const endpoint = env === "sandbox"
    ? `${ZINC_BASE_URL}/orders/test-products`
    : `${ZINC_BASE_URL}/orders?limit=1`;

  const started = Date.now();
  const res = await fetch(endpoint, {
    method: "GET",
    headers: getZincAuthHeaders(apiKey),
  });
  const elapsed_ms = Date.now() - started;

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  let test_products_count: number | undefined = undefined;
  if (env === "sandbox") {
    if (payload && Array.isArray(payload.products)) {
      test_products_count = payload.products.length;
    }
  }

  const message = res.ok
    ? `Conexión correcta (${res.status})`
    : `Zinc respondió ${res.status}: ${payload?.message || payload?.error || "Error de autenticación"}`;

  return {
    ok: res.ok,
    status: res.status,
    message,
    elapsed_ms,
    test_products_count,
  };
}

/**
 * Resolves the active Zinc API key from Supabase Vault (checking production first, then sandbox)
 * or falls back to environment variable ZINC_API_KEY.
 */
export async function resolveActiveZincApiKey(supabaseClient: any): Promise<string> {
  try {
    const { data: prodKey } = await supabaseClient.rpc("get_zinc_vault_secret", {
      p_environment: "production",
      p_secret_type: "api_key",
    });
    if (prodKey && typeof prodKey === "string" && prodKey.startsWith("zn_live_")) {
      return prodKey;
    }

    const { data: sandKey } = await supabaseClient.rpc("get_zinc_vault_secret", {
      p_environment: "sandbox",
      p_secret_type: "api_key",
    });
    if (sandKey && typeof sandKey === "string" && sandKey.startsWith("zn_test_")) {
      return sandKey;
    }
  } catch {
    // Fallback to env
  }

  const envKey = Deno.env.get("ZINC_API_KEY");
  if (envKey && typeof envKey === "string" && envKey.trim().startsWith("zn_")) {
    return envKey.trim();
  }

  throw new Error("No hay credencial de Zinc configurada en Vault ni en variables de entorno.");
}

