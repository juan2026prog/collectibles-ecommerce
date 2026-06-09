-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Automated Bidirectional Stock Sync Triggers
-- Applied: 2026-08-01
-- ══════════════════════════════════════════════════════════════

-- 1. Function to handle stock updates from vendor_product_variants
CREATE OR REPLACE FUNCTION ml_sync_vendor_stock_on_update()
RETURNS TRIGGER AS $$
DECLARE
    v_link RECORD;
BEGIN
    -- Only act if inventory_count has changed
    IF NEW.inventory_count IS DISTINCT FROM OLD.inventory_count THEN
        -- Find all active ML catalog links associated with this vendor variant
        FOR v_link IN 
            SELECT * FROM public.ml_catalog_links
            WHERE vendor_product_variant_id = NEW.id
              AND sync_stock = true
        LOOP
            -- Insert a pending sync task into the ML sync queue
            INSERT INTO public.ml_sync_queue (
                product_id,
                variant_id,
                ml_item_id,
                seller_id,
                action,
                payload,
                status,
                retry_count
            ) VALUES (
                v_link.product_id,
                v_link.variant_id,
                v_link.ml_item_id,
                v_link.seller_id,
                'sync_stock',
                jsonb_build_object('force_inventory', NEW.inventory_count),
                'pending',
                0
            );
        END LOOP;
    END IF;

    -- Handle price updates if necessary (optional)
    IF NEW.price_adjustment IS DISTINCT FROM OLD.price_adjustment THEN
        FOR v_link IN 
            SELECT * FROM public.ml_catalog_links
            WHERE vendor_product_variant_id = NEW.id
              AND sync_price = true
        LOOP
            INSERT INTO public.ml_sync_queue (
                product_id, variant_id, ml_item_id, seller_id, action, payload, status, retry_count
            ) VALUES (
                v_link.product_id, v_link.variant_id, v_link.ml_item_id, v_link.seller_id, 'sync_price',
                jsonb_build_object('trigger', 'price_adjustment_changed'), 'pending', 0
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger on vendor_product_variants
DROP TRIGGER IF EXISTS trg_ml_sync_vendor_stock ON public.vendor_product_variants;
CREATE TRIGGER trg_ml_sync_vendor_stock
AFTER UPDATE ON public.vendor_product_variants
FOR EACH ROW
EXECUTE FUNCTION ml_sync_vendor_stock_on_update();

-- 3. Function to handle stock updates from product_variants (Platform/Master items)
CREATE OR REPLACE FUNCTION ml_sync_master_stock_on_update()
RETURNS TRIGGER AS $$
DECLARE
    v_link RECORD;
BEGIN
    -- Only act if inventory_count has changed
    IF NEW.inventory_count IS DISTINCT FROM OLD.inventory_count THEN
        -- Find all active ML catalog links associated with this master variant
        -- AND where there is NO vendor_product_variant_id (meaning it's a platform offer)
        FOR v_link IN 
            SELECT * FROM public.ml_catalog_links
            WHERE variant_id = NEW.id
              AND vendor_product_variant_id IS NULL
              AND sync_stock = true
        LOOP
            INSERT INTO public.ml_sync_queue (
                product_id,
                variant_id,
                ml_item_id,
                seller_id,
                action,
                payload,
                status,
                retry_count
            ) VALUES (
                v_link.product_id,
                v_link.variant_id,
                v_link.ml_item_id,
                v_link.seller_id,
                'sync_stock',
                jsonb_build_object('force_inventory', NEW.inventory_count),
                'pending',
                0
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger on product_variants
DROP TRIGGER IF EXISTS trg_ml_sync_master_stock ON public.product_variants;
CREATE TRIGGER trg_ml_sync_master_stock
AFTER UPDATE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION ml_sync_master_stock_on_update();

-- 5. Handle vendor_products price changes
CREATE OR REPLACE FUNCTION ml_sync_vendor_price_on_update()
RETURNS TRIGGER AS $$
DECLARE
    v_link RECORD;
BEGIN
    IF NEW.price IS DISTINCT FROM OLD.price THEN
        FOR v_link IN 
            SELECT * FROM public.ml_catalog_links
            WHERE vendor_product_id = NEW.id
              AND sync_price = true
        LOOP
            INSERT INTO public.ml_sync_queue (
                product_id, variant_id, ml_item_id, seller_id, action, payload, status, retry_count
            ) VALUES (
                v_link.product_id, v_link.variant_id, v_link.ml_item_id, v_link.seller_id, 'sync_price',
                jsonb_build_object('trigger', 'base_price_changed'), 'pending', 0
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ml_sync_vendor_price ON public.vendor_products;
CREATE TRIGGER trg_ml_sync_vendor_price
AFTER UPDATE ON public.vendor_products
FOR EACH ROW
EXECUTE FUNCTION ml_sync_vendor_price_on_update();
