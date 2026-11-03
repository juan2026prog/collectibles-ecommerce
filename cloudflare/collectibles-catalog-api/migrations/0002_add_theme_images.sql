-- Migration: 0002_add_theme_images.sql
-- Description: Add image_url and image_alt columns to public_themes table in Cloudflare D1
ALTER TABLE public_themes ADD COLUMN image_url TEXT;
ALTER TABLE public_themes ADD COLUMN image_alt TEXT;
