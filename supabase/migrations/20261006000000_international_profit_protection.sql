-- Add Profit Protection Engine fields to Settings
ALTER TABLE public.international_sync_settings
ADD COLUMN IF NOT EXISTS target_margin_percent numeric DEFAULT 7.0,
ADD COLUMN IF NOT EXISTS min_profit_usd numeric DEFAULT 3.99,
ADD COLUMN IF NOT EXISTS min_absolute_profit_usd numeric DEFAULT 2.00,
ADD COLUMN IF NOT EXISTS never_sell_at_loss boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS max_price_variation_percent numeric DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS price_variation_action text DEFAULT 'manual_review',
ADD COLUMN IF NOT EXISTS urubox_price_per_kg numeric DEFAULT 20.0,
ADD COLUMN IF NOT EXISTS urubox_handling_fee numeric DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS zinc_fee_usd numeric DEFAULT 1.00;

-- Add tracking and audit fields to international_products
ALTER TABLE public.international_products
ADD COLUMN IF NOT EXISTS weight_grams integer,
ADD COLUMN IF NOT EXISTS package_length numeric,
ADD COLUMN IF NOT EXISTS package_width numeric,
ADD COLUMN IF NOT EXISTS package_height numeric,
ADD COLUMN IF NOT EXISTS expected_profit_usd numeric,
ADD COLUMN IF NOT EXISTS urubox_estimated_cost_usd numeric,
ADD COLUMN IF NOT EXISTS total_estimated_cost_usd numeric,
ADD COLUMN IF NOT EXISTS real_cost_usd numeric;
