// supabase/functions/_shared/zinc/types.ts
// Official Zinc API V2 TypeScript Types based on OpenAPI 3.1.0 (2026-08-21)

export type ZincEnvironment = 'sandbox' | 'production';

export interface ZincIntegrationSetting {
  id: string;
  environment: ZincEnvironment;
  is_configured: boolean;
  key_prefix: string | null;
  key_last4: string | null;
  is_enabled: boolean;
  last_tested_at: string | null;
  last_test_status: 'pass' | 'fail' | null;
  last_test_message: string | null;
  webhook_url: string | null;
  webhook_secret_prefix: string | null;
  webhook_secret_last4: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface ZincProductVariant {
  label: string;
  value: string;
}

export interface ZincOrderProduct {
  url: string;
  quantity?: number;
  variant?: ZincProductVariant[];
  condition_in?: string[];
  condition_not_in?: string[];
}

export interface ZincAddress {
  first_name: string;
  last_name: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code: string;
  phone_number: string;
  country?: string; // Default: 'US'
}

export interface ZincOrderCreatePayload {
  products: ZincOrderProduct[];
  shipping_address: ZincAddress;
  max_price: number; // Integer in CENTS
  idempotency_key?: string | null; // UUID recommended, max 36 chars
  retailer_credentials_id?: string | null;
  metadata?: Record<string, unknown> | null;
  po_number?: string | null;
  handling_days_max?: number | null;
  is_gift?: boolean;
  gift_message?: string | null;
  payment?: Record<string, unknown> | null; // Optional: omit for prepaid-wallet billing (default)
  customer_notifications?: Record<string, unknown> | null; // Optional: customer email updates & tracking page
}

export interface ZincProductSearchParams {
  query: string;
  retailer?: string; // Default: 'amazon'
  page?: number | null;
  free_shipping?: boolean;
}

export interface ZincProductSearchResult {
  product_id: string;
  title: string;
  price: number | null;
  stars?: number | null;
  reviews_count?: number | null;
  image_url?: string | null;
  brand?: string | null;
  availability?: string | null;
  url?: string;
  raw_data?: Record<string, unknown>;
}

export interface ZincProductSearchResponse {
  results?: ZincProductSearchResult[];
  page?: number;
  next_page?: number | null;
  total_results?: number;
}

export interface ZincPriceComponents {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
}

export interface ZincTrackingNumber {
  carrier: string;
  tracking_number: string;
  url?: string | null;
  delivered_at?: string | null;
  shipped_at?: string | null;
}

export interface ZincOrderResponse {
  id: string;
  status: 'order_started' | 'order_placed' | 'shipped' | 'delivered' | 'failed' | 'cancelled_by_retailer' | string;
  merchant_order_id?: string | null;
  tracking_numbers?: ZincTrackingNumber[];
  price_components?: ZincPriceComponents;
  created_at?: string;
  updated_at?: string;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
    field_errors?: Array<{
      field: string;
      code: string;
      message: string;
      received?: unknown;
      expected?: string | null;
    }>;
  };
}

export interface ZincWebhookEventPayload {
  event: string;
  order_id?: string | null;
  return_id?: string | null;
  status?: string | null;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface ZincTestProduct {
  url: string;
  scenario: string;
  name: string;
  is_synchronous_error: boolean;
}

export interface ZincTestProductsResponse {
  products: ZincTestProduct[];
}
