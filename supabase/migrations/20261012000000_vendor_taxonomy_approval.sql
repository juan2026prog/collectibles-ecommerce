-- Migration: Vendor Taxonomy Approval & RLS Policies
-- Date: 2026-06-12

-- 1. Alter brands table
ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_review' 
CONSTRAINT check_brand_status CHECK (status IN ('pending_review', 'approved', 'rejected', 'merged'));

ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES brands(id) ON DELETE SET NULL;

ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- 2. Alter categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_review' 
CONSTRAINT check_category_status CHECK (status IN ('pending_review', 'approved', 'rejected', 'merged'));

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- 3. Backfill existing records (global taxonomies are approved)
UPDATE brands SET status = 'approved' WHERE owner_vendor_id IS NULL;
UPDATE categories SET status = 'approved' WHERE owner_vendor_id IS NULL;

-- 4. RLS policies for brands
DROP POLICY IF EXISTS "Public brands are viewable by everyone" ON brands;
DROP POLICY IF EXISTS "brands_select_active" ON brands;
DROP POLICY IF EXISTS "Vendors can manage their own brands" ON brands;
DROP POLICY IF EXISTS "brands_admin" ON brands;
DROP POLICY IF EXISTS "Only admins can modify brands" ON brands;
DROP POLICY IF EXISTS "brands_select" ON brands;
DROP POLICY IF EXISTS "brands_insert" ON brands;
DROP POLICY IF EXISTS "brands_update" ON brands;
DROP POLICY IF EXISTS "brands_delete" ON brands;

CREATE POLICY "brands_select" ON brands
  FOR SELECT
  USING (status = 'approved' OR owner_vendor_id = auth.uid() OR is_admin());

CREATE POLICY "brands_insert" ON brands
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid() AND status = 'pending_review'::text)
    OR is_admin()
  );

CREATE POLICY "brands_update" ON brands
  FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid() AND status = 'pending_review'::text)
    OR is_admin()
  )
  WITH CHECK (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid() AND status = 'pending_review'::text)
    OR is_admin()
  );

CREATE POLICY "brands_delete" ON brands
  FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid() AND status = 'pending_review'::text)
    OR is_admin()
  );

-- 5. RLS policies for categories
DROP POLICY IF EXISTS "categories_select_active" ON categories;
DROP POLICY IF EXISTS "Vendors can manage their own categories" ON categories;
DROP POLICY IF EXISTS "categories_admin" ON categories;
DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
DROP POLICY IF EXISTS "categories_delete" ON categories;

CREATE POLICY "categories_select" ON categories
  FOR SELECT
  USING (status = 'approved' OR owner_vendor_id = auth.uid() OR is_admin());

CREATE POLICY "categories_insert" ON categories
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid() AND status = 'pending_review'::text)
    OR is_admin()
  );

CREATE POLICY "categories_update" ON categories
  FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid() AND status = 'pending_review'::text)
    OR is_admin()
  )
  WITH CHECK (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid() AND status = 'pending_review'::text)
    OR is_admin()
  );

CREATE POLICY "categories_delete" ON categories
  FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid() AND status = 'pending_review'::text)
    OR is_admin()
  );

-- 6. Public RLS policy for products on /vendor_prueba page
DROP POLICY IF EXISTS "products_select_vendor_prueba" ON products;
CREATE POLICY "products_select_vendor_prueba" ON products
  FOR SELECT TO public
  USING (vendor_id IS NOT NULL AND status IN ('published', 'pending_taxonomy_review', 'draft'));
