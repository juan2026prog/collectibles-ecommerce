-- Migration: Upgrade categories_with_published_counts to aggregate subcategory products into parent categories
-- Date: 2026-07-02

CREATE OR REPLACE VIEW public.categories_with_published_counts AS
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
    COALESCE(
      (
        SELECT count(DISTINCT p.id)
        FROM public.products p
        LEFT JOIN public.product_categories pc ON pc.product_id = p.id
        WHERE p.status = 'published' 
          AND p.is_active = true
          AND (
            p.category_id = c.id 
            OR pc.category_id = c.id
            OR (c.parent_id IS NULL AND (
                 p.category_id IN (SELECT sub.id FROM public.categories sub WHERE sub.parent_id = c.id)
                 OR pc.category_id IN (SELECT sub.id FROM public.categories sub WHERE sub.parent_id = c.id)
               ))
          )
      ), 
      0
    )
  )::integer AS published_products_count
FROM public.categories c;
