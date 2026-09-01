-- Migration: international_settings_security_and_validation
-- Timestamp: 20261216010000

-- 1. Drop public read policy on international_sync_settings to protect financial secrets
DROP POLICY IF EXISTS "Allow public read on international_sync_settings" ON public.international_sync_settings;

-- 2. Ensure Admin policy is strict (only is_admin() can SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Admins manage international_sync_settings" ON public.international_sync_settings;
CREATE POLICY "Admins manage international_sync_settings"
  ON public.international_sync_settings
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 3. Create safe public status RPC (exposes only boolean feature flags, ZERO financial fields)
CREATE OR REPLACE FUNCTION public.get_international_public_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'international_public_enabled', COALESCE((SELECT international_public_enabled FROM international_sync_settings WHERE id = 1), false),
    'international_purchases_enabled', COALESCE((SELECT international_purchases_enabled FROM international_sync_settings WHERE id = 1), true)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_international_public_status() TO anon, authenticated, public;

-- 4. Add strict financial validation CHECK constraints to prevent corrupt or negative configurations
ALTER TABLE public.international_sync_settings
  DROP CONSTRAINT IF EXISTS check_target_margin_positive,
  DROP CONSTRAINT IF EXISTS check_min_absolute_profit_positive,
  DROP CONSTRAINT IF EXISTS check_target_margin_valid_range,
  DROP CONSTRAINT IF EXISTS check_min_absolute_profit_non_negative,
  DROP CONSTRAINT IF EXISTS check_min_profit_non_negative,
  DROP CONSTRAINT IF EXISTS check_zinc_fee_non_negative,
  DROP CONSTRAINT IF EXISTS check_financial_fee_fixed_non_negative,
  DROP CONSTRAINT IF EXISTS check_financial_fee_percent_range,
  DROP CONSTRAINT IF EXISTS check_financial_fee_tax_rate_range,
  DROP CONSTRAINT IF EXISTS check_florida_sales_tax_percent_range,
  DROP CONSTRAINT IF EXISTS check_fixed_markup_non_negative;

ALTER TABLE public.international_sync_settings
  ADD CONSTRAINT check_target_margin_valid_range CHECK (target_margin_percent IS NULL OR (target_margin_percent >= 0 AND target_margin_percent < 100)),
  ADD CONSTRAINT check_min_absolute_profit_non_negative CHECK (min_absolute_profit_usd IS NULL OR min_absolute_profit_usd >= 0),
  ADD CONSTRAINT check_min_profit_non_negative CHECK (min_profit_usd IS NULL OR min_profit_usd >= 0),
  ADD CONSTRAINT check_zinc_fee_non_negative CHECK (zinc_fee_usd IS NULL OR zinc_fee_usd >= 0),
  ADD CONSTRAINT check_financial_fee_fixed_non_negative CHECK (financial_fee_fixed_usd IS NULL OR financial_fee_fixed_usd >= 0),
  ADD CONSTRAINT check_financial_fee_percent_range CHECK (financial_fee_percent IS NULL OR (financial_fee_percent >= 0 AND financial_fee_percent < 100)),
  ADD CONSTRAINT check_financial_fee_tax_rate_range CHECK (financial_fee_tax_rate IS NULL OR (financial_fee_tax_rate >= 0 AND financial_fee_tax_rate < 1)),
  ADD CONSTRAINT check_florida_sales_tax_percent_range CHECK (florida_sales_tax_percent IS NULL OR (florida_sales_tax_percent >= 0 AND florida_sales_tax_percent < 100)),
  ADD CONSTRAINT check_fixed_markup_non_negative CHECK (fixed_markup_usd IS NULL OR fixed_markup_usd >= 0);
