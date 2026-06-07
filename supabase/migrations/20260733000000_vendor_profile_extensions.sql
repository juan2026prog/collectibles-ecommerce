-- Add extended profile fields for vendors
ALTER TABLE vendors 
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS pickup_address jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS shipping_settings jsonb DEFAULT '{}'::jsonb;
