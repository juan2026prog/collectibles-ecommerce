-- Migration: International Public Visibility Feature Flag
-- Date: 2026-12-15 03:00:00

-- Add international_public_enabled flag (default false for safe gradual launch from Admin)
ALTER TABLE public.international_sync_settings
  ADD COLUMN IF NOT EXISTS international_public_enabled BOOLEAN DEFAULT false;

UPDATE public.international_sync_settings
SET international_public_enabled = false
WHERE id = 1 AND international_public_enabled IS NULL;
