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
 * Resolves the explicit Zinc API key for a specified environment from Supabase Vault
 * or environment-specific variables (ZINC_SANDBOX_API_KEY, ZINC_PRODUCTION_API_KEY).
 * 
 * Strict Isolation:
 * - Sandbox never returns a zn_live_ key.
 * - Production never returns a zn_test_ key.
 * - Generic ZINC_API_KEY fallback is permanently eliminated.
 */
export async function resolveZincApiKey(
  supabaseClient: any,
  env: ZincEnvironment
): Promise<string> {
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`Entorno Zinc inválido: '${env}'. Debe ser 'sandbox' o 'production'.`);
  }

  // 1. Resolve from Supabase Vault with explicit environment
  try {
    const { data: key, error } = await supabaseClient.rpc("get_zinc_vault_secret", {
      p_environment: env,
      p_secret_type: "api_key",
    });

    if (!error && key && typeof key === "string") {
      const trimmed = key.trim();
      if (env === "sandbox") {
        if (trimmed.startsWith("zn_live_")) {
          throw new Error("[SECURITY FATAL] Clave de producción (zn_live_) configurada en entorno sandbox.");
        }
        if (trimmed.startsWith("zn_test_")) {
          return trimmed;
        }
      } else if (env === "production") {
        if (trimmed.startsWith("zn_test_")) {
          throw new Error("[SECURITY FATAL] Clave de test (zn_test_) configurada en entorno producción.");
        }
        if (trimmed.startsWith("zn_live_")) {
          return trimmed;
        }
      }
    }
  } catch (e: any) {
    if (e.message?.includes("[SECURITY FATAL]")) throw e;
  }

  // 2. Fallback strictly to environment-specific variables (NO generic ZINC_API_KEY fallback)
  const envVarName = env === "sandbox" ? "ZINC_SANDBOX_API_KEY" : "ZINC_PRODUCTION_API_KEY";
  const getEnv = (name: string): string | undefined => {
    try {
      if (typeof Deno !== "undefined" && Deno.env) return Deno.env.get(name);
      if (typeof process !== "undefined" && process.env) return process.env[name];
    } catch {
      return undefined;
    }
    return undefined;
  };

  const envKey = getEnv(envVarName);
  if (envKey && typeof envKey === "string") {
    const trimmed = envKey.trim();
    if (env === "sandbox" && trimmed.startsWith("zn_test_")) {
      return trimmed;
    }
    if (env === "production" && trimmed.startsWith("zn_live_")) {
      return trimmed;
    }
  }

  throw new Error(`No hay credencial Zinc válida configurada para el entorno '${env}'.`);
}

/**
 * Searches products on Zinc API conforming to OpenAPI 3.1.0 GET /products/search.
 * Parameters:
 * - query (required string)
 * - retailer (required string, default 'amazon')
 * - page (optional integer)
 * - free_shipping (optional boolean)
 */
export async function searchZincProducts(
  apiKey: string,
  params: {
    query: string;
    retailer?: string;
    page?: number | null;
    free_shipping?: boolean;
  }
): Promise<any> {
  const url = new URL(`${ZINC_BASE_URL}/products/search`);
  url.searchParams.set("query", params.query);
  url.searchParams.set("retailer", params.retailer || "amazon");

  if (params.page !== undefined && params.page !== null) {
    url.searchParams.set("page", String(params.page));
  }
  if (params.free_shipping !== undefined && params.free_shipping !== null) {
    url.searchParams.set("free_shipping", String(params.free_shipping));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: getZincAuthHeaders(apiKey),
  });

  if (!res.ok) {
    let errBody: any = null;
    try {
      errBody = await res.json();
    } catch {
      errBody = null;
    }
    const message = errBody?.message || errBody?.error || res.statusText;
    throw new Error(`Zinc search responded HTTP ${res.status}: ${message}`);
  }

  return await res.json();
}

