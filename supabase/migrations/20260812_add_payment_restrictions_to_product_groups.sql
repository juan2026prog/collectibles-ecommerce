-- Migration: Add payment restrictions columns to product_groups
ALTER TABLE product_groups 
  ADD COLUMN IF NOT EXISTS allowed_payment_providers text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_method_restriction text DEFAULT 'all';

COMMENT ON COLUMN product_groups.allowed_payment_providers IS 'Array of allowed payment gateway provider IDs: mercadopago, dlocalgo, paypal, handy. NULL means all providers allowed.';
COMMENT ON COLUMN product_groups.payment_method_restriction IS 'Payment method restriction type: all, cards_only, transfer_only. Default: all.';
