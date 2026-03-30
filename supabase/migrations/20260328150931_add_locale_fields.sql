-- Add locale fields to profile table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'es';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_currency text DEFAULT 'UYU';
