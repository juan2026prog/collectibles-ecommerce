-- Buy Box Implementation
-- Hides vendor variants if Collectibles (platform) has stock for the same SKU

-- 1. Trigger when Platform updates its stock
CREATE OR REPLACE FUNCTION sync_vendor_buy_box()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor_id uuid;
BEGIN
  -- We only care if the SKU is not null
  IF NEW.sku IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the vendor_id of the product for the NEW variant
  SELECT vendor_id INTO v_vendor_id FROM products WHERE id = NEW.product_id;

  -- Only care if it's the platform updating its own stock
  IF v_vendor_id IS NULL THEN
    IF NEW.inventory_count > 0 AND NEW.is_active = true THEN
      -- Platform has stock -> hide vendor variants with same SKU
      UPDATE product_variants pv
      SET is_active = false
      FROM products p
      WHERE pv.product_id = p.id
        AND p.vendor_id IS NOT NULL
        AND pv.sku = NEW.sku
        AND pv.is_active = true; -- Only update if needed
    ELSE
      -- Platform is out of stock -> reveal vendor variants with same SKU
      UPDATE product_variants pv
      SET is_active = true
      FROM products p
      WHERE pv.product_id = p.id
        AND p.vendor_id IS NOT NULL
        AND pv.sku = NEW.sku
        AND pv.is_active = false; -- Only update if needed
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_vendor_buy_box ON product_variants;
CREATE TRIGGER trigger_sync_vendor_buy_box
AFTER INSERT OR UPDATE OF inventory_count, is_active, sku ON product_variants
FOR EACH ROW
EXECUTE FUNCTION sync_vendor_buy_box();


-- 2. Trigger when Vendor adds/updates a variant to ensure they don't bypass the Buy Box
CREATE OR REPLACE FUNCTION enforce_buy_box_on_vendor_variant()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor_id uuid;
  v_has_platform_stock boolean;
BEGIN
  -- We only care if the SKU is not null
  IF NEW.sku IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if it's a vendor variant
  SELECT vendor_id INTO v_vendor_id FROM products WHERE id = NEW.product_id;

  IF v_vendor_id IS NOT NULL AND NEW.is_active = true THEN
    -- Check if platform has stock
    SELECT EXISTS (
      SELECT 1 FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.sku = NEW.sku
        AND p.vendor_id IS NULL
        AND pv.inventory_count > 0
        AND pv.is_active = true
    ) INTO v_has_platform_stock;

    IF v_has_platform_stock THEN
      -- Force it to be inactive because platform has stock
      NEW.is_active = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_buy_box_on_vendor_variant ON product_variants;
CREATE TRIGGER trigger_enforce_buy_box_on_vendor_variant
BEFORE INSERT OR UPDATE OF sku, is_active ON product_variants
FOR EACH ROW
EXECUTE FUNCTION enforce_buy_box_on_vendor_variant();
