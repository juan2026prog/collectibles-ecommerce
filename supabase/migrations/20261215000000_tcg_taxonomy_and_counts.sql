-- Migration: TCG & Boardgames Global Taxonomy & Recursive Published Counts View
-- Date: 2026-08-14

-- 1. Ensure Top-Level Category TCG & BOARDGAMES exists
INSERT INTO public.categories (id, name, slug, parent_id, is_active, status, sort_order)
VALUES ('6e659b91-5130-4f20-9ddb-609410b9f84c', 'TCG & Boardgames', 'tcg', NULL, true, 'approved', 8)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  is_active = true,
  status = 'approved';

-- 2. Upgrade View `categories_with_published_counts` to recursively count published products across N levels
CREATE OR REPLACE VIEW public.categories_with_published_counts AS
WITH RECURSIVE cat_tree AS (
  -- Base case: category itself
  SELECT id AS root_id, id AS descendant_id
  FROM public.categories
  UNION ALL
  -- Recursive case: all subcategories down to any depth
  SELECT ct.root_id, c.id AS descendant_id
  FROM cat_tree ct
  JOIN public.categories c ON c.parent_id = ct.descendant_id
)
SELECT 
  c.id,
  c.parent_id,
  c.name,
  c.slug,
  c.image_url,
  c.is_active,
  c.sort_order,
  c.metadata,
  c.owner_vendor_id,
  c.status,
  c.merged_into_id,
  c.approved_by,
  c.approved_at,
  (
    SELECT count(DISTINCT p.id)::integer
    FROM cat_tree ct
    JOIN public.products p ON (p.category_id = ct.descendant_id OR p.id IN (
      SELECT pc.product_id FROM public.product_categories pc WHERE pc.category_id = ct.descendant_id
    ))
    WHERE ct.root_id = c.id
      AND p.status = 'published' 
      AND p.is_active = true
  ) AS published_products_count
FROM public.categories c;
