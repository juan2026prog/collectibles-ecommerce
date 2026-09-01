-- Migration: International Dynamic Profit Protection
-- Date: 2026-12-16 00:00:00

-- 1. Add configurable financial parameters to international_sync_settings
ALTER TABLE public.international_sync_settings
  ADD COLUMN IF NOT EXISTS financial_fee_percent numeric DEFAULT 2.50,
  ADD COLUMN IF NOT EXISTS financial_fee_fixed_usd numeric DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS financial_fee_tax_rate numeric DEFAULT 0.22,
  ADD COLUMN IF NOT EXISTS florida_sales_tax_percent numeric DEFAULT 0.00;

-- 2. Update default settings for standard production calibrated values
UPDATE public.international_sync_settings
SET 
  min_profit_usd = 3.99,
  min_absolute_profit_usd = 3.99,
  target_margin_percent = 15.00,
  zinc_fee_usd = 1.00,
  fixed_markup_usd = 6.00,
  financial_fee_percent = 2.50,
  financial_fee_fixed_usd = 0.50,
  financial_fee_tax_rate = 0.22,
  florida_sales_tax_percent = 0.00,
  never_sell_at_loss = true
WHERE id = 1;
