-- Migration: 20261222000000_vendor_catalog_permissions.sql
-- Description: Add catalog permission flags to public.vendors, create request tables for categories and licenses, and enforce RLS policies.

-- 1. Add catalog permission columns to public.vendors if not existing
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS can_request_categories BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS can_request_brands BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS can_request_licenses BOOLEAN NOT NULL DEFAULT false;

-- Ensure defaults for existing rows stay false
UPDATE public.vendors
SET 
  can_request_categories = COALESCE(can_request_categories, false),
  can_request_brands = COALESCE(can_request_brands, false),
  can_request_licenses = COALESCE(can_request_licenses, false);

-- 2. Create public.vendor_category_requests Table if not exists
CREATE TABLE IF NOT EXISTS public.vendor_category_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  requested_name TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'vendor_form' CHECK (source IN ('vendor_form', 'csv_import', 'ml_import')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  admin_notes TEXT,
  resolved_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_cat_requests_vendor_id ON public.vendor_category_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_cat_requests_status ON public.vendor_category_requests(status);

-- 3. Create public.vendor_license_requests Table if not exists
CREATE TABLE IF NOT EXISTS public.vendor_license_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  requested_name TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'vendor_form' CHECK (source IN ('vendor_form', 'csv_import', 'ml_import')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  admin_notes TEXT,
  resolved_license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_lic_requests_vendor_id ON public.vendor_license_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_lic_requests_status ON public.vendor_license_requests(status);

-- 4. Configure RLS Policies for vendor_brand_requests
ALTER TABLE public.vendor_brand_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can insert brand requests if permitted" ON public.vendor_brand_requests;
DROP POLICY IF EXISTS "Vendors can create brand requests" ON public.vendor_brand_requests;

CREATE POLICY "Vendors can create brand requests" ON public.vendor_brand_requests
  FOR INSERT WITH CHECK (
    vendor_id = auth.uid() 
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      OR EXISTS (SELECT 1 FROM public.vendors WHERE id = auth.uid() AND can_request_brands = true)
    )
  );

-- 5. Configure RLS Policies for vendor_category_requests
ALTER TABLE public.vendor_category_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can view own category requests" ON public.vendor_category_requests;
CREATE POLICY "Vendors can view own category requests" ON public.vendor_category_requests
  FOR SELECT USING (vendor_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Vendors can create category requests" ON public.vendor_category_requests;
CREATE POLICY "Vendors can create category requests" ON public.vendor_category_requests
  FOR INSERT WITH CHECK (
    vendor_id = auth.uid() 
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      OR EXISTS (SELECT 1 FROM public.vendors WHERE id = auth.uid() AND can_request_categories = true)
    )
  );

DROP POLICY IF EXISTS "Admins can manage category requests" ON public.vendor_category_requests;
CREATE POLICY "Admins can manage category requests" ON public.vendor_category_requests
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 6. Configure RLS Policies for vendor_license_requests
ALTER TABLE public.vendor_license_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can view own license requests" ON public.vendor_license_requests;
CREATE POLICY "Vendors can view own license requests" ON public.vendor_license_requests
  FOR SELECT USING (vendor_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Vendors can create license requests" ON public.vendor_license_requests;
CREATE POLICY "Vendors can create license requests" ON public.vendor_license_requests
  FOR INSERT WITH CHECK (
    vendor_id = auth.uid() 
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      OR EXISTS (SELECT 1 FROM public.vendors WHERE id = auth.uid() AND can_request_licenses = true)
    )
  );

DROP POLICY IF EXISTS "Admins can manage license requests" ON public.vendor_license_requests;
CREATE POLICY "Admins can manage license requests" ON public.vendor_license_requests
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
