-- Add saved_addresses jsonb array to profiles for multiple address support
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS saved_addresses jsonb DEFAULT '[]'::jsonb;
