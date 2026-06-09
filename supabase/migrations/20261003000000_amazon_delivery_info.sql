-- Migration to add Amazon delivery info

-- 1. Add fields to international_import_candidates
ALTER TABLE public.international_import_candidates
ADD COLUMN IF NOT EXISTS amazon_delivery_text text,
ADD COLUMN IF NOT EXISTS amazon_delivery_type text;

-- 2. Add fields to international_products
ALTER TABLE public.international_products
ADD COLUMN IF NOT EXISTS amazon_delivery_text text,
ADD COLUMN IF NOT EXISTS amazon_delivery_type text;

-- (The existing estimated_delivery_min_days and estimated_delivery_max_days are kept intact)
