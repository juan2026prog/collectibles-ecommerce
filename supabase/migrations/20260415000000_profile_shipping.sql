-- Add phone and shipping_address to profiles for checkout auto-fill
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS shipping_address jsonb DEFAULT '{}'::jsonb;
