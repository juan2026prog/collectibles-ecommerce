-- Migration: Create get_brand_facets RPC function for faceted brand filtering
-- Date: 2026-07-03

CREATE OR REPLACE FUNCTION public.get_brand_facets(
  p_category_slug text DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_vendor_store_id uuid DEFAULT NULL,
  p_group_slug text DEFAULT NULL,
  p_is_international boolean DEFAULT false
)
RETURNS TABLE(
  brand_id uuid,
  brand_name text,
  brand_slug text,
  product_count bigint
) AS $$
DECLARE
  v_category_ids uuid[];
  v_product_ids uuid[];
BEGIN
  IF p_is_international THEN
    RETURN QUERY
    SELECT 
      b.id as brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      COUNT(DISTINCT ip.id) as product_count
    FROM public.international_products ip
    JOIN public.brands b ON lower(ip.brand) = lower(b.name)
    WHERE ip.status = 'published'
      AND b.status = 'approved'
      AND b.is_active = true
      AND b.is_public = true
      AND (p_search_query IS NULL OR p_search_query = '' OR ip.title ILIKE '%' || p_search_query || '%' OR ip.description ILIKE '%' || p_search_query || '%')
    GROUP BY b.id, b.name, b.slug
    HAVING COUNT(DISTINCT ip.id) > 0
    ORDER BY product_count DESC, b.name ASC;
  ELSE
    -- 1. Resolve product group if specified
    IF p_group_slug IS NOT NULL AND p_group_slug <> '' THEN
      SELECT ARRAY_AGG(pgi.product_id) INTO v_product_ids
      FROM public.product_group_items pgi
      JOIN public.product_groups pg ON pgi.group_id = pg.id
      WHERE pg.slug = p_group_slug AND pg.is_active = true;
      
      IF v_product_ids IS NULL OR cardinality(v_product_ids) = 0 THEN
        RETURN;
      END IF;
    END IF;

    -- 2. Resolve category and its subcategories if specified
    IF p_category_slug IS NOT NULL AND p_category_slug <> '' THEN
      DECLARE
        v_root_cat_id uuid;
      BEGIN
        SELECT id INTO v_root_cat_id
        FROM public.categories
        WHERE slug = p_category_slug AND is_active = true;
        
        IF v_root_cat_id IS NOT NULL THEN
          SELECT ARRAY_AGG(id) INTO v_category_ids
          FROM public.categories
          WHERE (id = v_root_cat_id OR parent_id = v_root_cat_id) AND is_active = true;
        END IF;
      END;
    END IF;

    -- 3. Perform query to aggregate product counts by brand
    RETURN QUERY
    SELECT 
      b.id as brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      COUNT(DISTINCT p.id) as product_count
    FROM public.products p
    JOIN public.brands b ON p.brand_id = b.id
    WHERE p.status = 'published'
      AND p.is_active = true
      AND b.status = 'approved'
      AND b.is_active = true
      AND b.is_public = true
      AND (v_product_ids IS NULL OR p.id = ANY(v_product_ids))
      AND (p_vendor_store_id IS NULL OR p.vendor_store_id = p_vendor_store_id)
      AND (p_search_query IS NULL OR p_search_query = '' OR p.title ILIKE '%' || p_search_query || '%' OR p.description ILIKE '%' || p_search_query || '%')
      AND (v_category_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.product_categories pc 
        WHERE pc.product_id = p.id AND pc.category_id = ANY(v_category_ids)
      ))
    GROUP BY b.id, b.name, b.slug
    HAVING COUNT(DISTINCT p.id) > 0
    ORDER BY product_count DESC, b.name ASC;
  END IF;
END;
$$ LANGUAGE plpgsql;
