// supabase/functions/_shared/paypal-config.ts
// Unified, fail-closed PayPal runtime configuration resolver for create-payment,
// confirm-payment, and paypal-webhook.
//
// Security guarantees:
// 1. Staging (csnudufkpfzveoonjumy) and any non-Production Supabase URL are
//    STRICTLY LOCKED to PayPal Sandbox (https://api-m.sandbox.paypal.com).
// 2. Missing, empty, or Live-mode configuration in Staging fails closed
//    (never silently falls back to https://api-m.paypal.com).
// 3. Prefers Supabase Edge Function Secrets (Deno.env) over site_settings.
// 4. Never embeds credential values in error messages.

export const PROD_SUPABASE_PROJECT_REF = "cobtsgkwcftvexaarwmo";
export const STAGING_SUPABASE_PROJECT_REF = "csnudufkpfzveoonjumy";

export const PAYPAL_SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
export const PAYPAL_LIVE_API_BASE = "https://api-m.paypal.com";

export interface PayPalRuntimeConfig {
  isSandbox: boolean;
  environment: "sandbox" | "live";
  apiBase: string;
  clientId: string;
  clientSecret: string;
  webhookId: string | null;
  merchantId: string | null;
  credentialSource: "env" | "site_settings" | "mixed";
}

export interface ResolvePayPalConfigInput {
  supabaseUrl: string;
  env?: Record<string, string | undefined>;
  siteSettings?: Record<string, string | undefined>;
  requireWebhookId?: boolean;
}

export class PayPalConfigError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "PayPalConfigError";
    this.code = code;
  }
}

function readClean(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolvePayPalRuntimeConfig(input: ResolvePayPalConfigInput): PayPalRuntimeConfig {
  const supabaseUrl = readClean(input.supabaseUrl).toLowerCase();
  const env = input.env || {};
  const settings = input.siteSettings || {};
  const requireWebhookId = input.requireWebhookId === true;

  if (!supabaseUrl) {
    throw new PayPalConfigError(
      "PAYPAL_SUPABASE_URL_MISSING",
      "SUPABASE_URL no configurada; imposible determinar entorno PayPal seguro."
    );
  }

  const isProductionProject = supabaseUrl.includes(PROD_SUPABASE_PROJECT_REF);
  const envSandboxRaw = readClean(env.PAYPAL_SANDBOX).toLowerCase();
  const settingsSandboxRaw = readClean(settings.payments_paypal_sandbox).toLowerCase();

  let isSandbox: boolean;

  if (!isProductionProject) {
    // Non-Production / Staging: EXCLUSIVELY SANDBOX, fail-closed
    if (envSandboxRaw === "false" || settingsSandboxRaw === "false") {
      throw new PayPalConfigError(
        "PAYPAL_LIVE_FORBIDDEN_IN_STAGING",
        "PayPal Live está estrictamente prohibido en Staging/entornos no productivos."
      );
    }
    if (envSandboxRaw !== "true" && settingsSandboxRaw !== "true") {
      throw new PayPalConfigError(
        "PAYPAL_SANDBOX_MODE_REQUIRED_IN_STAGING",
        "Staging requiere PAYPAL_SANDBOX=true (o payments_paypal_sandbox='true') explícito."
      );
    }
    isSandbox = true;
  } else {
    // Production: explicit mode required (never silent default on ambiguous values)
    const effectiveMode = envSandboxRaw || settingsSandboxRaw;
    if (effectiveMode === "true") {
      isSandbox = true;
    } else if (effectiveMode === "false") {
      isSandbox = false;
    } else {
      throw new PayPalConfigError(
        "PAYPAL_MODE_AMBIGUOUS",
        "El modo PayPal (sandbox/live) no está definido explícitamente en Producción."
      );
    }
  }

  // Prefer Edge Function Secrets over site_settings
  const envClientId = readClean(isSandbox ? (env.PAYPAL_SANDBOX_CLIENT_ID || env.PAYPAL_CLIENT_ID) : env.PAYPAL_CLIENT_ID);
  const envClientSecret = readClean(isSandbox ? (env.PAYPAL_SANDBOX_CLIENT_SECRET || env.PAYPAL_CLIENT_SECRET) : env.PAYPAL_CLIENT_SECRET);
  const envWebhookId = readClean(isSandbox ? (env.PAYPAL_SANDBOX_WEBHOOK_ID || env.PAYPAL_WEBHOOK_ID) : env.PAYPAL_WEBHOOK_ID);
  const envMerchantId = readClean(isSandbox ? (env.PAYPAL_SANDBOX_MERCHANT_ID || env.PAYPAL_MERCHANT_ID) : env.PAYPAL_MERCHANT_ID);

  const settingsClientId = readClean(settings.payments_paypal_client_id);
  const settingsClientSecret = readClean(settings.payments_paypal_client_secret || settings.payments_paypal_secret_key);
  const settingsWebhookId = readClean(settings.payments_paypal_webhook_id);
  const settingsMerchantId = readClean(settings.payments_paypal_merchant_id);

  const clientId = envClientId || settingsClientId;
  const clientSecret = envClientSecret || settingsClientSecret;
  const webhookId = (envWebhookId || settingsWebhookId) || null;
  const merchantId = (envMerchantId || settingsMerchantId) || null;

  if (!clientId || !clientSecret) {
    throw new PayPalConfigError(
      "PAYPAL_CREDENTIALS_MISSING",
      `Credenciales PayPal (${isSandbox ? "sandbox" : "live"}) no configuradas.`
    );
  }

  if (requireWebhookId && !webhookId) {
    throw new PayPalConfigError(
      "PAYPAL_WEBHOOK_ID_MISSING",
      `PAYPAL_WEBHOOK_ID (${isSandbox ? "sandbox" : "live"}) requerido para verificación de firma.`
    );
  }

  const usedEnv = Boolean(envClientId || envClientSecret);
  const usedSettings = Boolean((!envClientId && settingsClientId) || (!envClientSecret && settingsClientSecret));
  const credentialSource = usedEnv && usedSettings ? "mixed" : usedEnv ? "env" : "site_settings";

  return {
    isSandbox,
    environment: isSandbox ? "sandbox" : "live",
    apiBase: isSandbox ? PAYPAL_SANDBOX_API_BASE : PAYPAL_LIVE_API_BASE,
    clientId,
    clientSecret,
    webhookId,
    merchantId,
    credentialSource,
  };
}
