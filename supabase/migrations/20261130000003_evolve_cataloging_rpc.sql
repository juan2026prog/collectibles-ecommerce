-- Migration: Evolve Cataloging RPC & Vendor-specific category mappings
-- Date: 2026-11-30

-- 1. Evolve ml_category_mapping table to support vendor-specific mappings
ALTER TABLE public.ml_category_mapping DROP CONSTRAINT IF EXISTS ml_category_mapping_pkey;

-- Add vendor_id column if not exists
ALTER TABLE public.ml_category_mapping ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE;
ALTER TABLE public.ml_category_mapping ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Re-add primary key on id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
      AND table_name = 'ml_category_mapping' 
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE public.ml_category_mapping ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Drop existing unique indexes to avoid duplicates
DROP INDEX IF EXISTS public.ml_category_mapping_vendor_idx;
DROP INDEX IF EXISTS public.ml_category_mapping_global_idx;

-- Create unique indexes to allow only one global mapping and one mapping per vendor for the same ml_category_id
CREATE UNIQUE INDEX ml_category_mapping_vendor_idx ON public.ml_category_mapping (ml_category_id, vendor_id) WHERE vendor_id IS NOT NULL;
CREATE UNIQUE INDEX ml_category_mapping_global_idx ON public.ml_category_mapping (ml_category_id) WHERE vendor_id IS NULL;


-- 2. Drop the old get_batch_classification_preview function
DROP FUNCTION IF EXISTS public.get_batch_classification_preview(uuid);

-- 3. Create the evolved get_batch_classification_preview function
CREATE OR REPLACE FUNCTION public.get_batch_classification_preview(p_vendor_id uuid DEFAULT NULL)
 RETURNS TABLE(
   id text, 
   title text, 
   thumbnail text, 
   sku text, 
   ml_brand text, 
   ml_category text, 
   suggested_category_id uuid, 
   suggested_category_name text, 
   confidence integer, 
   is_exception boolean, 
   conflict_reason text, 
   status text, 
   applied_rule text,
   vendor_id uuid,
   vendor_name text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH batch_items AS (
    -- 1. Already published products for selected vendor or all vendors
    SELECT 
      p.id::text as id,
      p.title::text as title,
      COALESCE((SELECT img.url FROM public.product_images img WHERE img.product_id = p.id AND img.is_primary = true LIMIT 1), '')::text as thumbnail,
      COALESCE((SELECT v.sku FROM public.product_variants v WHERE v.product_id = p.id LIMIT 1), '')::text as sku,
      (SELECT b.name FROM public.brands b WHERE b.id = p.brand_id)::text as ml_brand,
      p.ml_category_id::text as ml_category,
      p.status::text as status,
      p.vendor_id as vendor_id,
      COALESCE((SELECT v.store_name FROM public.vendors v WHERE v.id = p.vendor_id LIMIT 1), 'Desconocido')::text as vendor_name
    FROM public.products p
    WHERE p_vendor_id IS NULL OR p.vendor_id = p_vendor_id

    UNION ALL

    -- 2. Raw items for selected vendor or all vendors in curation queue
    SELECT 
      r.id::text as id,
      r.title::text as title,
      r.thumbnail::text as thumbnail,
      (r.raw_payload->'normalized_metadata'->>'extracted_seller_sku')::text as sku,
      (r.raw_payload->'normalized_metadata'->>'brand_name')::text as ml_brand,
      (r.raw_payload->>'category_id')::text as ml_category,
      'Curation Queue'::text as status,
      a.vendor_id as vendor_id,
      COALESCE((SELECT v.store_name FROM public.vendors v WHERE v.id = a.vendor_id LIMIT 1), 'Desconocido')::text as vendor_name
    FROM public.ml_raw_items r
    JOIN public.ml_seller_accounts a ON r.seller_id::text = a.seller_id::text
    WHERE 
      r.status NOT IN ('approved', 'ignored') AND
      (p_vendor_id IS NULL OR a.vendor_id = p_vendor_id)
  ),
  evaluated_items AS (
    SELECT 
      bi.id,
      bi.title,
      bi.thumbnail,
      bi.sku,
      bi.ml_brand,
      bi.ml_category,
      bi.status,
      bi.vendor_id,
      bi.vendor_name,
      er.suggested_id,
      er.confidence,
      er.has_conflict,
      er.conflict_details,
      er.rule_description
    FROM batch_items bi
    LEFT JOIN LATERAL public.evaluate_product_rules(bi.title, bi.ml_category, bi.ml_brand, bi.vendor_id) er ON true    
  )
  SELECT 
    ei.id,
    ei.title,
    ei.thumbnail,
    ei.sku,
    ei.ml_brand,
    ei.ml_category,
    ei.suggested_id,
    COALESCE((SELECT c.name FROM public.categories c WHERE c.id = ei.suggested_id), 'Sin clasificar')::text as suggested_category_name,
    COALESCE(ei.confidence, 40)::integer as confidence,
    CASE 
      WHEN ei.has_conflict = true OR COALESCE(ei.confidence, 40) < 70 THEN true 
      ELSE false 
    END as is_exception,
    CASE 
      WHEN ei.has_conflict = true THEN ei.conflict_details
      WHEN COALESCE(ei.confidence, 40) < 70 THEN 'Low rule confidence suggestion'::text
      ELSE ''::text
    END as conflict_reason,
    ei.status,
    COALESCE(ei.rule_description, 'IA Auto-Classification (Default fallback)')::text as applied_rule,
    ei.vendor_id,
    ei.vendor_name
  FROM evaluated_items ei;
END;
$function$;
