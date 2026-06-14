-- Migration: Vendor Product Groups & RLS Policies
-- Date: 2026-06-12

-- 1. Alter product_groups table to add owner_vendor_id
ALTER TABLE product_groups 
ADD COLUMN IF NOT EXISTS owner_vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE;

-- 2. Drop existing RLS policies on product_groups
DROP POLICY IF EXISTS "Admin manage product_groups" ON product_groups;
DROP POLICY IF EXISTS "Public read product_groups" ON product_groups;
DROP POLICY IF EXISTS "product_groups_select" ON product_groups;
DROP POLICY IF EXISTS "product_groups_insert" ON product_groups;
DROP POLICY IF EXISTS "product_groups_update" ON product_groups;
DROP POLICY IF EXISTS "product_groups_delete" ON product_groups;

-- 3. Create updated RLS policies for product_groups
CREATE POLICY "product_groups_select" ON product_groups
  FOR SELECT
  USING (is_active = true OR owner_vendor_id = auth.uid() OR is_admin());

CREATE POLICY "product_groups_insert" ON product_groups
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "product_groups_update" ON product_groups
  FOR UPDATE
  USING (
    owner_vendor_id = auth.uid()
    OR is_admin()
  )
  WITH CHECK (
    (auth.uid() IS NOT NULL AND owner_vendor_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "product_groups_delete" ON product_groups
  FOR DELETE
  USING (
    owner_vendor_id = auth.uid()
    OR is_admin()
  );

-- 4. Drop existing RLS policies on product_group_items
DROP POLICY IF EXISTS "Admin manage product_group_items" ON product_group_items;
DROP POLICY IF EXISTS "Public read product_group_items" ON product_group_items;
DROP POLICY IF EXISTS "product_group_items_select" ON product_group_items;
DROP POLICY IF EXISTS "product_group_items_insert" ON product_group_items;
DROP POLICY IF EXISTS "product_group_items_update" ON product_group_items;
DROP POLICY IF EXISTS "product_group_items_delete" ON product_group_items;

-- 5. Create updated RLS policies for product_group_items
CREATE POLICY "product_group_items_select" ON product_group_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM product_groups 
      WHERE id = group_id 
      AND (is_active = true OR owner_vendor_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "product_group_items_insert" ON product_group_items
  FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      EXISTS (SELECT 1 FROM product_groups WHERE id = group_id AND owner_vendor_id = auth.uid())
      AND EXISTS (SELECT 1 FROM products WHERE id = product_id AND vendor_id = auth.uid())
    )
  );

CREATE POLICY "product_group_items_update" ON product_group_items
  FOR UPDATE
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM product_groups WHERE id = group_id AND owner_vendor_id = auth.uid())
  )
  WITH CHECK (
    is_admin()
    OR (
      EXISTS (SELECT 1 FROM product_groups WHERE id = group_id AND owner_vendor_id = auth.uid())
      AND EXISTS (SELECT 1 FROM products WHERE id = product_id AND vendor_id = auth.uid())
    )
  );

CREATE POLICY "product_group_items_delete" ON product_group_items
  FOR DELETE
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM product_groups WHERE id = group_id AND owner_vendor_id = auth.uid())
  );
