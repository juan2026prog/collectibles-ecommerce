-- Migration: Add DAC Hybrid Shipping Mode (Standard platform rates vs BYOC vendor account)
-- Path: supabase/migrations/20261217000000_dac_hybrid_shipping_mode.sql

-- 1. Extend vendor_shipping_connections with mode & credential fields
ALTER TABLE public.vendor_shipping_connections
  ADD COLUMN IF NOT EXISTS account_mode TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS pricing_source TEXT DEFAULT 'platform_standard',
  ADD COLUMN IF NOT EXISTS customer_number TEXT,
  ADD COLUMN IF NOT EXISTS agency_code TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

-- 2. Create vendor_shipping_preferences table if not exists
CREATE TABLE IF NOT EXISTS public.vendor_shipping_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE NOT NULL,
    provider TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true NOT NULL,
    account_mode TEXT DEFAULT 'standard' NOT NULL,
    pricing_source TEXT DEFAULT 'platform_standard' NOT NULL,
    free_shipping_enabled BOOLEAN DEFAULT false NOT NULL,
    free_shipping_threshold NUMERIC DEFAULT 0 NOT NULL,
    markup_type TEXT DEFAULT 'none' NOT NULL,
    markup_value NUMERIC DEFAULT 0 NOT NULL,
    dispatch_method TEXT,
    default_agency TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT vendor_shipping_preferences_account_mode_check CHECK (account_mode IN ('standard', 'byoc')),
    CONSTRAINT vendor_shipping_preferences_pricing_source_check CHECK (pricing_source IN ('platform_standard', 'vendor_account')),
    CONSTRAINT vendor_shipping_preferences_markup_type_check CHECK (markup_type IN ('none', 'fixed', 'percentage')),
    CONSTRAINT vendor_shipping_preferences_vendor_provider_unique UNIQUE (vendor_id, provider)
);

-- Enable RLS on vendor_shipping_preferences
ALTER TABLE public.vendor_shipping_preferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for vendor_shipping_preferences
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vendor_shipping_preferences' AND policyname = 'Vendors can manage their own shipping preferences'
  ) THEN
    CREATE POLICY "Vendors can manage their own shipping preferences"
      ON public.vendor_shipping_preferences
      FOR ALL
      USING (auth.uid() = vendor_id)
      WITH CHECK (auth.uid() = vendor_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vendor_shipping_preferences' AND policyname = 'Public read for active vendor shipping preferences'
  ) THEN
    CREATE POLICY "Public read for active vendor shipping preferences"
      ON public.vendor_shipping_preferences
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- 3. Ensure DAC provider is active in shipping_providers table
INSERT INTO public.shipping_providers (code, name, status, is_active, provider_type, config_required)
VALUES ('dac', 'DAC (Grupo Agencia)', 'active', true, 'courier', false)
ON CONFLICT (code) DO UPDATE 
SET is_active = true, status = 'active';
