-- Migration: Official Store Customization Columns
-- Date: 2026-07-04

ALTER TABLE public.vendor_stores ADD COLUMN IF NOT EXISTS banner_mobile_url text;
ALTER TABLE public.vendor_stores ADD COLUMN IF NOT EXISTS accent_color text;
ALTER TABLE public.vendor_stores ADD COLUMN IF NOT EXISTS banner_position text DEFAULT 'center';
