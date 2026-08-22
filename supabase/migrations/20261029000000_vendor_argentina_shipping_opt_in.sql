-- Migration: Vendor Argentina Shipping Opt-In
-- Date: 2026-08-21
-- Description: Adds ships_to_argentina opt-in preference to vendors table.
-- Default for external vendors is FALSE (no international shipping without explicit consent).

ALTER TABLE public.vendors 
  ADD COLUMN IF NOT EXISTS ships_to_argentina BOOLEAN NOT NULL DEFAULT false;

-- Ensure existing external vendors default to false (explicit)
UPDATE public.vendors 
  SET ships_to_argentina = false 
  WHERE ships_to_argentina IS NULL;

COMMENT ON COLUMN public.vendors.ships_to_argentina IS 'Opt-in preference for international shipping to Argentina (default false for external vendors, Collectibles overrides to true in business logic)';
