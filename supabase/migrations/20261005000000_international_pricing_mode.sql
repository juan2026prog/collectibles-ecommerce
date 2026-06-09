-- Add Pricing Modes to Settings
ALTER TABLE public.international_sync_settings
ADD COLUMN IF NOT EXISTS pricing_mode text DEFAULT 'amazon_price_plus_fee',
ADD COLUMN IF NOT EXISTS fixed_markup_usd numeric DEFAULT 6.00,
ADD COLUMN IF NOT EXISTS percentage_markup numeric DEFAULT 15.00,
ADD COLUMN IF NOT EXISTS tiered_markup_rules jsonb DEFAULT '[{"max_price": 20, "markup_usd": 4.99}, {"max_price": 100, "markup_percent": 20}, {"max_price": 500, "markup_percent": 15}, {"max_price": null, "markup_percent": 10}]'::jsonb;

-- Add tracking fields to international_products
ALTER TABLE public.international_products
ADD COLUMN IF NOT EXISTS amazon_current_price_usd numeric,
ADD COLUMN IF NOT EXISTS amazon_list_price_usd numeric,
ADD COLUMN IF NOT EXISTS amazon_discount_percent numeric,
ADD COLUMN IF NOT EXISTS pricing_mode text;

-- Populate legacy data
UPDATE public.international_products 
SET amazon_current_price_usd = base_price_usd 
WHERE amazon_current_price_usd IS NULL AND base_price_usd IS NOT NULL;
