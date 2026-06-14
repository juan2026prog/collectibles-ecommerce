-- Migration: Vendor BYOC Logistics Schema & RLS Policies
-- Date: 2026-06-14

-- 1. Create vendor_dispatch_addresses table
CREATE TABLE IF NOT EXISTS public.vendor_dispatch_addresses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    department TEXT NOT NULL,
    postal_code TEXT,
    phone TEXT,
    is_default BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Trigger to enforce single default dispatch address per vendor
CREATE OR REPLACE FUNCTION public.handle_vendor_default_dispatch_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.vendor_dispatch_addresses
    SET is_default = false
    WHERE vendor_id = NEW.vendor_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_vendor_default_dispatch_address ON public.vendor_dispatch_addresses;
CREATE TRIGGER tr_vendor_default_dispatch_address
  BEFORE INSERT OR UPDATE OF is_default ON public.vendor_dispatch_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_vendor_default_dispatch_address();

-- 3. Enable Row Level Security
ALTER TABLE public.vendor_dispatch_addresses ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for vendor_dispatch_addresses
DROP POLICY IF EXISTS "dispatch_address_select" ON public.vendor_dispatch_addresses;
CREATE POLICY "dispatch_address_select" ON public.vendor_dispatch_addresses
  FOR SELECT
  USING (auth.uid() = vendor_id OR is_admin());

DROP POLICY IF EXISTS "dispatch_address_insert" ON public.vendor_dispatch_addresses;
CREATE POLICY "dispatch_address_insert" ON public.vendor_dispatch_addresses
  FOR INSERT
  WITH CHECK (auth.uid() = vendor_id OR is_admin());

DROP POLICY IF EXISTS "dispatch_address_update" ON public.vendor_dispatch_addresses;
CREATE POLICY "dispatch_address_update" ON public.vendor_dispatch_addresses
  FOR UPDATE
  USING (auth.uid() = vendor_id OR is_admin())
  WITH CHECK (auth.uid() = vendor_id OR is_admin());

DROP POLICY IF EXISTS "dispatch_address_delete" ON public.vendor_dispatch_addresses;
CREATE POLICY "dispatch_address_delete" ON public.vendor_dispatch_addresses
  FOR DELETE
  USING (auth.uid() = vendor_id OR is_admin());

-- 5. Enable INSERT/UPDATE/DELETE RLS policies for vendor_shipping_connections
-- These allow vendors to create and update their connections safely from edge functions/directly
DROP POLICY IF EXISTS "Vendors can insert their own shipping connections" ON public.vendor_shipping_connections;
CREATE POLICY "Vendors can insert their own shipping connections"
    ON public.vendor_shipping_connections FOR INSERT
    WITH CHECK (auth.uid() = vendor_id OR is_admin());

DROP POLICY IF EXISTS "Vendors can update their own shipping connections" ON public.vendor_shipping_connections;
CREATE POLICY "Vendors can update their own shipping connections"
    ON public.vendor_shipping_connections FOR UPDATE
    USING (auth.uid() = vendor_id OR is_admin())
    WITH CHECK (auth.uid() = vendor_id OR is_admin());

DROP POLICY IF EXISTS "Vendors can delete their own shipping connections" ON public.vendor_shipping_connections;
CREATE POLICY "Vendors can delete their own shipping connections"
    ON public.vendor_shipping_connections FOR DELETE
    USING (auth.uid() = vendor_id OR is_admin());
