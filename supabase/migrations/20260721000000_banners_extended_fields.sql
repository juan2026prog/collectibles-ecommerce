-- Migration: Add extended visual and layout fields to public.banners table
ALTER TABLE public.banners
ADD COLUMN IF NOT EXISTS secondary_button_text text,
ADD COLUMN IF NOT EXISTS secondary_button_url text,
ADD COLUMN IF NOT EXISTS content_position text DEFAULT 'center',
ADD COLUMN IF NOT EXISTS content_align text DEFAULT 'left',
ADD COLUMN IF NOT EXISTS overlay_opacity numeric DEFAULT 0.4;
