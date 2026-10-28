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
  // Handy Boton de Pago v2: PurchaseData.Status 0=iniciado, 1=exitoso,
  // 2=fallido, 3=pendiente. Never treat status 2 as approved.
  const normalized = String(status ?? "").trim().toUpperCase();
  if (["1", "APPROVED", "AUTHORIZED", "PAID", "SUCCESS", "COMPLETED", "FINALIZADO", "FINALIZED", "COMPLETADO"].includes(normalized)) return "approved";
  if (["2", "FAILED", "FAILURE", "ERROR"].includes(normalized)) return "failed";
  if (["0", "3", "PENDING", "CREATED", "INITIATED", "IN_PROCESS", "PROCESSING"].includes(normalized)) return "pending";
  if (["REJECTED", "DECLINED", "DENIED"].includes(normalized)) return "rejected";
  if (["CANCELLED", "CANCELED", "VOIDED", "ABANDONED", "4"].includes(normalized)) return "cancelled";
  if (["REFUNDED", "REVERSED", "5"].includes(normalized)) return "refunded";
  return "unknown"; // Unknown provider state must never trigger order confirmation.
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
    "PurchaseData.Status",
    "purchaseData.status",
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
