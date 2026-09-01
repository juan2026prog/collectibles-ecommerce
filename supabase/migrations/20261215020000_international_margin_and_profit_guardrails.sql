-- Migration: International Margin & Profit Guardrails
-- Date: 2026-12-15 02:00:00

-- 1. Ensure initial calibrated defaults (15% margin, $2.00 USD min absolute profit, never sell at loss = true)
UPDATE public.international_sync_settings
SET target_margin_percent = 15.00,
    min_absolute_profit_usd = 2.00,
    never_sell_at_loss = true
WHERE id = 1;

-- 2. Add strict database constraints to prevent invalid or loss-inducing configurations
ALTER TABLE public.international_sync_settings
  DROP CONSTRAINT IF EXISTS check_target_margin_positive,
  DROP CONSTRAINT IF EXISTS check_min_absolute_profit_positive,
  DROP CONSTRAINT IF EXISTS check_never_sell_at_loss_mandatory;

ALTER TABLE public.international_sync_settings
  ADD CONSTRAINT check_target_margin_positive CHECK (target_margin_percent > 0),
  ADD CONSTRAINT check_min_absolute_profit_positive CHECK (min_absolute_profit_usd > 0),
  ADD CONSTRAINT check_never_sell_at_loss_mandatory CHECK (never_sell_at_loss = true);
