-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Anti-Loop Mechanism for Stock Sync
-- Applied: 2026-08-02
-- ══════════════════════════════════════════════════════════════

-- 1. Add skip_ml_sync flag to both variant tables
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS skip_ml_sync BOOLEAN DEFAULT false;

ALTER TABLE public.vendor_product_variants 
ADD COLUMN IF NOT EXISTS skip_ml_sync BOOLEAN DEFAULT false;

-- 2. Modify vendor trigger to respect the flag
CREATE OR REPLACE FUNCTION ml_sync_vendor_stock_on_update()
RETURNS TRIGGER AS $$
DECLARE
    v_link RECORD;
BEGIN
    -- Anti-Loop: If skip flag is true, reset it and do not sync back to ML
    IF NEW.skip_ml_sync = true THEN
        NEW.skip_ml_sync := false;
        RETURN NEW;
    END IF;

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

    -- Handle price updates if necessary
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


-- 3. Modify master/platform trigger to respect the flag
CREATE OR REPLACE FUNCTION ml_sync_master_stock_on_update()
RETURNS TRIGGER AS $$
DECLARE
    v_link RECORD;
BEGIN
    -- Anti-Loop: If skip flag is true, reset it and do not sync back to ML
    IF NEW.skip_ml_sync = true THEN
        NEW.skip_ml_sync := false;
        RETURN NEW;
    END IF;

    -- Only act if inventory_count has changed
    IF NEW.inventory_count IS DISTINCT FROM OLD.inventory_count THEN
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

-- 4. Update decrement_inventory to support skip_ml_sync
CREATE OR REPLACE FUNCTION decrement_inventory(
  p_variant_id UUID,
  p_quantity INT,
  p_skip_ml_sync BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
  v_current_inventory INT;
  v_new_inventory INT;
BEGIN
  -- Bloquear la fila para evitar race conditions
  SELECT inventory_count INTO v_current_inventory
  FROM product_variants
  WHERE id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante no encontrada';
  END IF;

  IF v_current_inventory < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente para la variante %', p_variant_id;
  END IF;

  v_new_inventory := v_current_inventory - p_quantity;

  -- Actualizar el inventario de la variante pasando el flag anti-loop
  UPDATE product_variants
  SET 
    inventory_count = v_new_inventory,
    skip_ml_sync = p_skip_ml_sync,
    updated_at = NOW()
  WHERE id = p_variant_id;

  RETURN jsonb_build_object(
    'success', true,
    'variant_id', p_variant_id,
    'old_inventory', v_current_inventory,
    'new_inventory', v_new_inventory
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
