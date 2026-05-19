export const HANDY_PROVIDER_KEY = "handy";
export const HANDY_TESTING_BASE_URL = "https://api.payments.arriba.uy/api/v2";
export const HANDY_PRODUCTION_BASE_URL = "https://api.payments.handy.uy/api/v2";

function readPath(payload: Record<string, any>, path: string) {
  return path.split(".").reduce<any>((current, part) => {
    if (current == null) return undefined;
    return current[part];
  }, payload);
}

export function getFirstValue(payload: Record<string, any>, paths: string[]) {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

export function mapHandyPaymentStatus(status: string | undefined) {
  const normalized = (status || "").trim().toUpperCase();
  if (["APPROVED", "AUTHORIZED", "PAID", "SUCCESS", "COMPLETED"].includes(normalized)) return "approved";
  if (["REJECTED", "DECLINED", "DENIED"].includes(normalized)) return "rejected";
  if (["CANCELLED", "CANCELED", "VOIDED", "ABANDONED"].includes(normalized)) return "cancelled";
  if (["REFUNDED", "REVERSED"].includes(normalized)) return "refunded";
  if (["PENDING", "CREATED", "IN_PROCESS", "PROCESSING"].includes(normalized)) return "pending";
  return "failed";
}

export function extractHandyWebhookData(payload: Record<string, any>) {
  const transactionExternalId = String(getFirstValue(payload, [
    "TransactionExternalId",
    "transactionExternalId",
    "Cart.TransactionExternalId",
    "cart.transactionExternalId",
    "Data.TransactionExternalId",
    "data.transactionExternalId",
  ]) || "");

  const providerTransactionId = String(getFirstValue(payload, [
    "TransactionId",
    "transactionId",
    "PaymentId",
    "paymentId",
    "Id",
    "id",
    "Data.TransactionId",
    "data.transactionId",
  ]) || "");

  const status = String(getFirstValue(payload, [
    "Status",
    "status",
    "PaymentStatus",
    "paymentStatus",
    "Data.Status",
    "data.status",
  ]) || "");

  return {
    transactionExternalId,
    providerTransactionId,
    status,
    mappedStatus: mapHandyPaymentStatus(status),
  };
}

export async function getHandyProviderConfig(supabaseAdmin: any) {
  const { data: provider, error } = await supabaseAdmin
    .from("payment_providers")
    .select("*")
    .eq("provider_key", HANDY_PROVIDER_KEY)
    .single();

  if (error || !provider) {
    throw new Error("La configuracion de Handy no existe en payment_providers.");
  }

  const config = provider.config || {};
  const environment = provider.environment === "production" ? "production" : "testing";
  const baseUrl = environment === "production"
    ? String(config.production_base_url || HANDY_PRODUCTION_BASE_URL)
    : String(config.testing_base_url || HANDY_TESTING_BASE_URL);

  const merchantSecretKey = (Deno.env.get("HANDY_MERCHANT_SECRET_KEY") || config.merchant_secret_key || "").trim();
  const callbackUrl = String(
    config.callback_url || `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/handy-webhook`,
  ).trim();

  return {
    provider,
    config,
    environment,
    baseUrl,
    merchantSecretKey,
    callbackUrl,
    commerceName: String(config.commerce_name || "Collectibles"),
    siteUrl: String(config.site_url || ""),
    currency: Number(config.currency || 858),
    responseType: String(config.response_type || "Json"),
    defaultImageUrl: String(config.default_image_url || ""),
    checkoutText: String(config.checkout_text || "Pagar con Handy"),
  };
}
