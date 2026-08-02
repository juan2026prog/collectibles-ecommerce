-- Migration: 20260802000000_normalize_sku_system.sql
-- Description: SKU System Normalization and Cleansing of Legacy Mercado Libre / Amazon ASIN / Vendor Price SKUs

-- 1. Create backup tables
CREATE TABLE IF NOT EXISTS public.backup_product_variants_sku_20260802 AS
SELECT id, product_id, sku, created_at FROM public.product_variants;

CREATE TABLE IF NOT EXISTS public.backup_vendor_product_variants_sku_20260802 AS
SELECT id, vendor_product_id, variant_id, sku_vendedor, created_at FROM public.vendor_product_variants;

-- 2. Preserve barcodes in metadata GTIN before overwriting numeric SKUs
UPDATE public.products p
SET metadata = jsonb_set(COALESCE(p.metadata, '{}'::jsonb), '{gtin}', to_jsonb(pv.sku))
FROM public.product_variants pv
WHERE pv.product_id = p.id
  AND pv.sku ~ '^[0-9]{8,14}$'
  AND (p.metadata->>'gtin' IS NULL OR p.metadata->>'gtin' = '');

-- 3. Sequentially re-assign clean internal SKUs (COL-000001, COL-000002...)
DO $$
DECLARE
    r RECORD;
    v_seq INT := 1;
    v_new_sku TEXT;
BEGIN
    FOR r IN 
        SELECT pv.id, pv.product_id, pv.sku, p.vendor_id
        FROM public.product_variants pv
        JOIN public.products p ON p.id = pv.product_id
        WHERE UPPER(pv.sku) ~ '^(ML|MLA|MLB|MLU|MLM)[0-9]+'
           OR UPPER(pv.sku) ~ '^B0[A-Z0-9]{8}'
           OR UPPER(pv.sku) LIKE 'USD%'
           OR pv.sku LIKE '%-dup-%'
           OR pv.sku ~ '^\s'
           OR pv.sku = 'x'
        ORDER BY pv.created_at ASC
    LOOP
        WHILE EXISTS (SELECT 1 FROM public.product_variants WHERE sku = 'COL-' || lpad(v_seq::text, 6, '0')) LOOP
            v_seq := v_seq + 1;
        END LOOP;
        
        v_new_sku := 'COL-' || lpad(v_seq::text, 6, '0');

        UPDATE public.product_variants
        SET sku = v_new_sku
        WHERE id = r.id;

        v_seq := v_seq + 1;
    END LOOP;
END $$;

-- 4. Clean vendor_product_variants.sku_vendedor from legacy ML IDs
UPDATE public.vendor_product_variants
SET sku_vendedor = NULL
WHERE UPPER(sku_vendedor) ~ '^(ML|MLA|MLB|MLU|MLM)[0-9]+';
