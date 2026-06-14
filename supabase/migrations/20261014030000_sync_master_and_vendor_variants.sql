-- Migration: Synchronize Master and Vendor Variants Stock & Price Adjustment
-- Date: 2026-06-14

-- 1. Trigger function: vendor_product_variants -> product_variants
CREATE OR REPLACE FUNCTION public.sync_vendor_variant_to_master()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.product_variants pv
    SET 
        inventory_count = NEW.inventory_count,
        price_adjustment = NEW.price_adjustment,
        skip_ml_sync = NEW.skip_ml_sync,
        updated_at = NOW()
    FROM public.ml_catalog_links cl
    WHERE cl.variant_id = pv.id
      AND cl.vendor_product_variant_id = NEW.id
      -- Only update if there is a difference to prevent infinite trigger loops
      AND (pv.inventory_count IS DISTINCT FROM NEW.inventory_count 
           OR pv.price_adjustment IS DISTINCT FROM NEW.price_adjustment
           OR pv.skip_ml_sync IS DISTINCT FROM NEW.skip_ml_sync);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger: vendor_product_variants
DROP TRIGGER IF EXISTS trg_sync_vendor_variant_to_master ON public.vendor_product_variants;
CREATE TRIGGER trg_sync_vendor_variant_to_master
AFTER UPDATE OF inventory_count, price_adjustment, skip_ml_sync ON public.vendor_product_variants
FOR EACH ROW
EXECUTE FUNCTION public.sync_vendor_variant_to_master();


-- 3. Trigger function: product_variants -> vendor_product_variants
CREATE OR REPLACE FUNCTION public.sync_master_variant_to_vendor()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.vendor_product_variants vpv
    SET 
        inventory_count = NEW.inventory_count,
        price_adjustment = NEW.price_adjustment,
        skip_ml_sync = NEW.skip_ml_sync
    FROM public.ml_catalog_links cl
    WHERE cl.vendor_product_variant_id = vpv.id
      AND cl.variant_id = NEW.id
      -- Only update if there is a difference to prevent infinite trigger loops
      AND (vpv.inventory_count IS DISTINCT FROM NEW.inventory_count
           OR vpv.price_adjustment IS DISTINCT FROM NEW.price_adjustment
           OR vpv.skip_ml_sync IS DISTINCT FROM NEW.skip_ml_sync);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger: product_variants
DROP TRIGGER IF EXISTS trg_sync_master_variant_to_vendor ON public.product_variants;
CREATE TRIGGER trg_sync_master_variant_to_vendor
AFTER UPDATE OF inventory_count, price_adjustment, skip_ml_sync ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.sync_master_variant_to_vendor();
