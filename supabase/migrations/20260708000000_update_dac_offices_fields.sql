-- Migration: Update dac_offices with phone, address, and support columns
ALTER TABLE dac_offices 
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS supports_pickup boolean default true,
ADD COLUMN IF NOT EXISTS supports_delivery boolean default true;
