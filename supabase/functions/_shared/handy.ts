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

export function mapHandyPaymentStatus(status: string | number | undefined) {
  const normalized = String(status ?? "").trim().toUpperCase();
  // Handy Botón de Pago v2.0 Official Status Enum:
  // 0 = Pago iniciado / In process
  // 1 = Pago exitoso / Approved
  // 2 = Pago fallido / Rejected
  // 3 = Pendiente de pago / Pending
  if (normalized === "1" || ["APPROVED", "AUTHORIZED", "PAID", "SUCCESS", "COMPLETED", "FINALIZADO", "FINALIZED", "COMPLETADO"].includes(normalized)) {
    return "approved";
  }
  if (normalized === "2" || ["REJECTED", "DECLINED", "DENIED", "FAILED"].includes(normalized)) {
    return "rejected";
  }
  if (normalized === "3" || normalized === "0" || ["PENDING", "CREATED", "IN_PROCESS", "PROCESSING", "INITIATED"].includes(normalized)) {
    return "pending";
  }
  if (["CANCELLED", "CANCELED", "VOIDED", "ABANDONED", "4"].includes(normalized)) {
    return "cancelled";
  }
  if (["REFUNDED", "REVERSED", "5"].includes(normalized)) {
    return "refunded";
  }
  return "failed";
}

export function extractHandyWebhookData(payload: Record<string, any>) {
  const transactionExternalId = String(getFirstValue(payload, [
    "TransactionExternalId",
    "transactionExternalId",
    "Cart.TransactionExternalId",
    "cart.transactionExternalId",
    "PurchaseData.TransactionExternalId",
    "purchaseData.transactionExternalId",
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
    "PurchaseData.Id",
    "purchaseData.id",
    "PurchaseData.TransactionId",
    "purchaseData.transactionId",
    "Data.TransactionId",
    "data.transactionId",
  ]) || "");

  // Note: Check for refund payload (Section 6.1.2) where Success=true and Message contains refund
  const isRefundNotification = Boolean(
    payload.Success === true &&
    typeof payload.Message === "string" &&
    payload.Message.toLowerCase().includes("devoluci")
  );

  const rawStatus = isRefundNotification
    ? "REFUNDED"
    : getFirstValue(payload, [
        "PurchaseData.Status",
        "purchaseData.status",
        "Status",
        "status",
        "PaymentStatus",
        "paymentStatus",
        "Data.Status",
        "data.status",
      ]);

  const statusStr = String(rawStatus ?? "");

  const purchaseData = payload.PurchaseData || payload.purchaseData || null;
  const instrumentData = payload.InstrumentData || payload.instrumentData || null;

  const totalAmount = Number(getFirstValue(payload, [
    "PurchaseData.TotalAmount",
    "purchaseData.totalAmount",
    "PurchaseData.Amount",
    "purchaseData.amount",
    "TotalAmount",
    "totalAmount",
    "Amount",
    "amount",
  ]) || 0);

  const currency = Number(getFirstValue(payload, [
    "PurchaseData.Currency",
    "purchaseData.currency",
    "Currency",
    "currency",
  ]) || 858);

  const created = String(getFirstValue(payload, [
    "PurchaseData.Created",
    "purchaseData.created",
    "Created",
    "created",
  ]) || "");

  return {
    transactionExternalId,
    providerTransactionId,
    status: statusStr,
    rawStatus: statusStr,
    mappedStatus: mapHandyPaymentStatus(rawStatus),
    totalAmount,
    currency,
    created,
    purchaseData,
    instrumentData,
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
