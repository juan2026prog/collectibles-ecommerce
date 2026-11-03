import { describe, it, expect } from 'vitest';

/**
 * Schema Invariant Validation Test
 * Asserts that the SQL definition in create_order_atomic_v2 only references
 * columns that actually exist in Supabase production tables.
 */

const PRODUCTION_SCHEMAS = {
  orders: [
    "id", "created_at", "user_id", "status", "total_amount", "currency",
    "payment_method", "payment_id", "shipping_address", "billing_address",
    "customer_email", "customer_phone", "affiliate_id", "customer_id",
    "payment_processed_at", "coupon_id", "payment_status", "tracking_number",
    "shipping_provider", "tracking_provider", "terms_accepted", "terms_accepted_at",
    "accepted_terms_version", "ml_order_id", "order_number", "customer_name",
    "billing_data", "payment_provider", "payment_provider_reference",
    "subtotal_products", "total_shipping", "total_payment_fee", "total_discounts",
    "is_test_order", "preorder_status", "logistics_consent", "order_source",
    "last_payment_attempt_id", "last_reconciled_at", "reconciliation_status",
    "display_currency", "display_subtotal", "display_shipping", "display_total",
    "payment_currency", "payment_subtotal", "payment_shipping", "payment_total",
    "fx_rate", "fx_rate_source", "fx_rate_timestamp", "handy_invoice_number",
    "shipping_weight_kg", "shipping_cost_ars", "shipping_cost_usd",
    "mbe_service_type", "shipping_weight_real_kg", "shipping_weight_volumetric_kg",
    "shipping_weight_chargeable_kg", "shipping_rule_applied",
    "is_shipping_quote_required", "updated_at", "paid_at", "is_international"
  ],
  order_suborders: [
    "id", "parent_order_id", "suborder_number", "vendor_id", "vendor_name",
    "is_collectibles_order", "product_subtotal", "shipping_method",
    "shipping_provider", "shipping_cost", "shipping_status", "tracking_number",
    "tracking_url", "marketplace_commission_rate", "marketplace_fee",
    "payment_fee_share", "vendor_gross_amount", "vendor_net_amount",
    "liquidation_status", "liquidation_id", "status", "delivered_at",
    "eligible_for_liquidation_at", "created_at", "updated_at", "vendor_store_id",
    "vendor_store_name", "discount_total", "shipping_charged_to_customer",
    "shipping_provider_cost", "shipping_paid_by", "shipping_billing_mode",
    "shipping_margin", "shipping_provider_invoice_status", "shipping_quote_to_customer",
    "shipping_provider_cost_estimated", "shipping_provider_cost_real",
    "shipping_invoice_cost", "shipping_margin_estimated", "shipping_margin_real",
    "shipping_invoice_status", "seller_type", "shipping_mode", "pickup_type",
    "agency_id", "agency_name", "dispatch_address_id", "internal_reference",
    "exchange_rate_used", "exchange_rate_source", "exchange_rate_buffer_percent",
    "exchange_rate_timestamp", "is_international", "vendor_policy_snapshot",
    "cancellation_requested_at", "cancellation_reason"
  ],
  order_items: [
    "id", "order_id", "product_id", "quantity", "unit_price", "total_price",
    "variant_id", "vendor_id", "vendor_payout", "platform_fee", "suborder_id",
    "product_name", "sku", "discount_total", "final_total", "vendor_store_id",
    "status", "refunded_quantity", "refunded_amount"
  ],
  customer_consents: [
    "id", "email", "phone", "email_marketing_opt_in", "whatsapp_opt_in",
    "source", "created_at", "updated_at", "logistics_consent_opt_in"
  ],
  payment_attempts: [
    "id", "order_id", "user_id", "provider", "payment_method_type",
    "payment_method_detail", "attempt_number", "amount", "currency",
    "normalized_status", "provider_status", "provider_status_detail",
    "external_payment_id", "external_preference_id", "external_reference",
    "checkout_session_id", "idempotency_key", "initiated_at", "approved_at",
    "rejected_at", "cancelled_at", "expired_at", "last_checked_at",
    "error_code", "error_message_sanitized", "metadata", "created_at", "updated_at"
  ],
  stock_reservations: [
    "id", "order_id", "variant_id", "quantity", "reserved_until", "status",
    "created_at", "updated_at"
  ],
  preorder_items: [
    "id", "order_item_id", "product_id", "customer_id", "status",
    "estimated_arrival", "tracking_info", "created_at", "updated_at"
  ]
};

import fs from 'fs';
import path from 'path';

describe('create_order_atomic_v2 SQL vs Production Schema Invariants', () => {
  const sqlPath = path.resolve(__dirname, '../../../supabase/migrations/20271102090000_atomic_order_idempotency.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  function extractInsertColumns(sql: string, tableName: string): string[] {
    const regex = new RegExp(`INSERT\\s+INTO\\s+public\\.${tableName}\\s*\\(([^)]+)\\)`, 'gi');
    const matches = [];
    let match;
    while ((match = regex.exec(sql)) !== null) {
      const cols = match[1]
        .split(',')
        .map(c => c.trim().replace(/["']/g, ''))
        .filter(Boolean);
      matches.push(...cols);
    }
    return matches;
  }

  it('1. All columns inserted into public.orders exist in production', () => {
    const insertedCols = extractInsertColumns(sqlContent, 'orders');
    expect(insertedCols.length).toBeGreaterThan(0);
    const validCols = new Set(PRODUCTION_SCHEMAS.orders);
    for (const col of insertedCols) {
      expect(validCols.has(col), `Column "${col}" does not exist in public.orders`).toBe(true);
    }
  });

  it('2. All columns inserted into public.order_suborders exist in production', () => {
    const insertedCols = extractInsertColumns(sqlContent, 'order_suborders');
    expect(insertedCols.length).toBeGreaterThan(0);
    const validCols = new Set(PRODUCTION_SCHEMAS.order_suborders);
    for (const col of insertedCols) {
      expect(validCols.has(col), `Column "${col}" does not exist in public.order_suborders`).toBe(true);
    }
  });

  it('3. All columns inserted into public.order_items exist in production', () => {
    const insertedCols = extractInsertColumns(sqlContent, 'order_items');
    expect(insertedCols.length).toBeGreaterThan(0);
    const validCols = new Set(PRODUCTION_SCHEMAS.order_items);
    for (const col of insertedCols) {
      expect(validCols.has(col), `Column "${col}" does not exist in public.order_items`).toBe(true);
    }
  });

  it('4. All columns inserted into public.customer_consents exist in production', () => {
    const insertedCols = extractInsertColumns(sqlContent, 'customer_consents');
    expect(insertedCols.length).toBeGreaterThan(0);
    const validCols = new Set(PRODUCTION_SCHEMAS.customer_consents);
    for (const col of insertedCols) {
      expect(validCols.has(col), `Column "${col}" does not exist in public.customer_consents`).toBe(true);
    }
  });

  it('5. All columns inserted into public.payment_attempts exist in production', () => {
    const insertedCols = extractInsertColumns(sqlContent, 'payment_attempts');
    expect(insertedCols.length).toBeGreaterThan(0);
    const validCols = new Set(PRODUCTION_SCHEMAS.payment_attempts);
    for (const col of insertedCols) {
      expect(validCols.has(col), `Column "${col}" does not exist in public.payment_attempts`).toBe(true);
    }
  });

  it('6. All columns inserted into public.stock_reservations exist in production', () => {
    const insertedCols = extractInsertColumns(sqlContent, 'stock_reservations');
    expect(insertedCols.length).toBeGreaterThan(0);
    const validCols = new Set(PRODUCTION_SCHEMAS.stock_reservations);
    for (const col of insertedCols) {
      expect(validCols.has(col), `Column "${col}" does not exist in public.stock_reservations`).toBe(true);
    }
  });

  it('7. All columns inserted into public.preorder_items exist in production', () => {
    const insertedCols = extractInsertColumns(sqlContent, 'preorder_items');
    expect(insertedCols.length).toBeGreaterThan(0);
    const validCols = new Set(PRODUCTION_SCHEMAS.preorder_items);
    for (const col of insertedCols) {
      expect(validCols.has(col), `Column "${col}" does not exist in public.preorder_items`).toBe(true);
    }
  });
});
