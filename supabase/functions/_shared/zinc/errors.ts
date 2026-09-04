// supabase/functions/_shared/zinc/errors.ts
// Error normalization and retry classification for Zinc API V2

export interface ParsedZincError {
  code: string;
  message: string;
  isRetryable: boolean;
  isAlreadyExists: boolean;
  fieldErrors?: Array<{ field: string; message: string }>;
  details?: Record<string, unknown>;
}

export function parseZincError(status: number, data: any): ParsedZincError {
  const code = String(data?.code || data?.error?.code || data?.error_type || "unknown_error");
  const message = String(data?.message || data?.error?.message || data?.error || `Zinc error HTTP ${status}`);
  const isAlreadyExists = code === "already_exists" || status === 409 || message.toLowerCase().includes("already exists");

  // Non-retryable deterministic errors
  const deterministicCodes = [
    "unauthorized",
    "forbidden",
    "invalid_token",
    "token_expired",
    "validation_error",
    "bad_request",
    "invalid_shipping_address",
    "insufficient_funds",
    "url_unreachable",
    "invalid_variant",
    "out_of_stock",
    "shipping_unavailable",
    "non_us_retailer",
    "order_not_cancellable",
  ];

  const isDeterministic = deterministicCodes.includes(code.toLowerCase());
  const isServerOrNetwork = status >= 500 || status === 429;
  const isRetryable = isServerOrNetwork && !isDeterministic && !isAlreadyExists;

  return {
    code,
    message,
    isRetryable,
    isAlreadyExists,
    fieldErrors: data?.field_errors || data?.error?.field_errors,
    details: data?.details || data?.error?.details,
  };
}
