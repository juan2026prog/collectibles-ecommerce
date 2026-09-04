// supabase/functions/_shared/zinc/auth.ts
// Centralized authentication and secret validation for Zinc API V2

import { ZincEnvironment } from "./types.ts";

export function validKeyForEnv(key: string, env: ZincEnvironment): boolean {
  if (!key || typeof key !== "string") return false;
  const trimmed = key.trim();
  if (trimmed.length < 10) return false;

  if (env === "sandbox") {
    return trimmed.startsWith("zn_test_");
  }

  if (env === "production") {
    return trimmed.startsWith("zn_live_");
  }

  return false;
}

export function validWebhookSecret(secret: string): boolean {
  if (!secret || typeof secret !== "string") return false;
  const trimmed = secret.trim();
  return trimmed.length >= 10 && trimmed.startsWith("zn_whsec_");
}

export function maskSecret(prefix: string | null, last4: string | null): string {
  if (!prefix && !last4) return "No configurado";
  const p = prefix || "zn_••••";
  const l = last4 || "••••";
  return `${p}••••••••${l}`;
}

export function getZincAuthHeaders(apiKey: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${apiKey.trim()}`,
    "Content-Type": "application/json",
  };
}
