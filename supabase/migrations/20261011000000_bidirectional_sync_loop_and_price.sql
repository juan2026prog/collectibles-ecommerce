-- Fix Bidirectional Sync Triggers
-- Changes:
-- 1. Switch AFTER triggers to BEFORE triggers so we can modify NEW.skip_ml_sync.
-- 2. Handle price changes (price_adjustment, or price in product_variants).

DROP TRIGGER IF EXISTS trg_ml_sync_vendor_stock ON public.vendor_product_variants;
DROP TRIGGER IF EXISTS trg_ml_sync_master_stock ON public.product_variants;

CREATE OR REPLACE FUNCTION ml_sync_vendor_stock_on_update()
RETURNS TRIGGER AS $$
DECLARE
    v_link RECORD;
    v_changed_fields JSONB := '{}'::jsonb;
BEGIN
    -- Anti-Loop: If skip flag is true, reset it and do not sync back to ML
    IF NEW.skip_ml_sync = true THEN
        NEW.skip_ml_sync := false;
        RETURN NEW;
    END IF;

    -- Determine what changed
    IF NEW.inventory_count IS DISTINCT FROM OLD.inventory_count THEN
        v_changed_fields := v_changed_fields || jsonb_build_object('inventory_count', NEW.inventory_count);
    END IF;

    IF NEW.price_adjustment IS DISTINCT FROM OLD.price_adjustment THEN
        v_changed_fields := v_changed_fields || jsonb_build_object('price_adjustment', NEW.price_adjustment);
    END IF;

    -- Only act if stock or price changed
    IF v_changed_fields <> '{}'::jsonb THEN
        -- Find all active ML catalog links associated with this vendor variant
        FOR v_link IN 
            SELECT * FROM public.ml_catalog_links
            WHERE vendor_product_variant_id = NEW.id
        LOOP
            -- Check if the specific changed field has sync enabled
            IF (v_changed_fields ? 'inventory_count' AND v_link.sync_stock = true) OR
               (v_changed_fields ? 'price_adjustment' AND v_link.sync_price = true) THEN
                
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
                    'sync_to_ml',
                    v_changed_fields,
                    'pending',
                    0
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_ml_sync_vendor_stock
BEFORE UPDATE ON public.vendor_product_variants
FOR EACH ROW
EXECUTE FUNCTION ml_sync_vendor_stock_on_update();

-- Same for master stock
CREATE OR REPLACE FUNCTION ml_sync_master_stock_on_update()
RETURNS TRIGGER AS $$
DECLARE
    v_link RECORD;
    v_changed_fields JSONB := '{}'::jsonb;
BEGIN
    -- Anti-Loop: If skip flag is true, reset it and do not sync back to ML
    IF NEW.skip_ml_sync = true THEN
        NEW.skip_ml_sync := false;
        RETURN NEW;
    END IF;

    -- Determine what changed
    IF NEW.inventory_count IS DISTINCT FROM OLD.inventory_count THEN
        v_changed_fields := v_changed_fields || jsonb_build_object('inventory_count', NEW.inventory_count);
    END IF;
    
    -- Assuming product_variants uses price column
    IF NEW.price IS DISTINCT FROM OLD.price THEN
        v_changed_fields := v_changed_fields || jsonb_build_object('price', NEW.price);
    END IF;

    -- Only act if stock or price changed
    IF v_changed_fields <> '{}'::jsonb THEN
        FOR v_link IN 
            SELECT * FROM public.ml_catalog_links
            WHERE variant_id = NEW.id
              AND vendor_product_variant_id IS NULL
        LOOP
            IF (v_changed_fields ? 'inventory_count' AND v_link.sync_stock = true) OR
               (v_changed_fields ? 'price' AND v_link.sync_price = true) THEN
                
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
                    'sync_to_ml',
                    v_changed_fields,
                    'pending',
                    0
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_ml_sync_master_stock
BEFORE UPDATE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION ml_sync_master_stock_on_update();
