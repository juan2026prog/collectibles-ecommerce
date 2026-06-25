-- Migration: Add source and is_public to brands
-- Date: 2026-06-25

ALTER TABLE brands ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;

-- Update existing approved/active brands to be public and manual by default
UPDATE brands SET is_public = true, source = 'manual' WHERE status = 'approved' OR owner_vendor_id IS NULL;
