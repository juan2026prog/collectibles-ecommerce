-- Migration: Fix RLS Policies for /vendor_prueba page
-- Date: 2026-06-14

-- 1. Allow public select of active vendors (enables vendor names on products & vendor filter dropdown)
DROP POLICY IF EXISTS "vendors_select_public" ON public.vendors;
CREATE POLICY "vendors_select_public" ON public.vendors
  FOR SELECT TO public
  USING (status = 'active');

-- 2. Allow public select of brands that are either approved or pending_review (enables showing proposed brands on preview)
DROP POLICY IF EXISTS "brands_select" ON public.brands;
CREATE POLICY "brands_select" ON public.brands
  FOR SELECT TO public
  USING (status IN ('approved', 'pending_review') OR owner_vendor_id = auth.uid() OR is_admin());

-- 3. Allow public select of categories that are either approved or pending_review (enables showing proposed categories on preview)
DROP POLICY IF EXISTS "categories_select" ON public.categories;
CREATE POLICY "categories_select" ON public.categories
  FOR SELECT TO public
  USING (status IN ('approved', 'pending_review') OR owner_vendor_id = auth.uid() OR is_admin());

-- 4. Allow public select of ml_catalog_links (enables showing sync error/status on preview)
DROP POLICY IF EXISTS "ml_catalog_links_select_public" ON public.ml_catalog_links;
CREATE POLICY "ml_catalog_links_select_public" ON public.ml_catalog_links
  FOR SELECT TO public
  USING (true);
