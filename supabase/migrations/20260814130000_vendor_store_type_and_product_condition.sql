-- Migration: Vendor Store Type and Product Condition System (Zona Vintage)
-- Date: 2026-08-14

BEGIN;

-- Clean up legacy condition values if any
UPDATE public.products SET condition = 'new_sealed' WHERE condition = 'new';
UPDATE public.products SET condition = 'used_complete' WHERE condition = 'used';
UPDATE public.products SET condition = NULL WHERE condition IS NOT NULL AND condition NOT IN (
  'new_sealed', 'new_open_box', 'used_complete', 'used_incomplete', 'loose_complete', 'loose_incomplete'
);

-- 1. ADD store_type TO public.vendors
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS store_type TEXT NOT NULL DEFAULT 'standard';

-- Add check constraint for store_type on vendors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_vendor_store_type'
  ) THEN
    ALTER TABLE public.vendors
      ADD CONSTRAINT check_vendor_store_type CHECK (store_type IN ('standard', 'vintage', 'mixed'));
  END IF;
END $$;

-- 2. ADD store_type TO public.vendor_stores
ALTER TABLE public.vendor_stores
  ADD COLUMN IF NOT EXISTS store_type TEXT NOT NULL DEFAULT 'standard';

-- Add check constraint for store_type on vendor_stores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_vendor_store_store_type'
  ) THEN
    ALTER TABLE public.vendor_stores
      ADD CONSTRAINT check_vendor_store_store_type CHECK (store_type IN ('standard', 'vintage', 'mixed'));
  END IF;
END $$;

-- 3. ADD condition AND condition_notes TO public.products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS condition TEXT NULL,
  ADD COLUMN IF NOT EXISTS condition_notes TEXT NULL;

-- Add check constraint for product condition
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_product_condition'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT check_product_condition CHECK (
        condition IS NULL OR condition IN (
          'new_sealed',
          'new_open_box',
          'used_complete',
          'used_incomplete',
          'loose_complete',
          'loose_incomplete'
        )
      );
  END IF;
END $$;

-- 4. FUNCTION & TRIGGER: SECURE VENDOR STORE TYPE UPDATES
-- Prevents non-admin users from altering store_type on vendors
CREATE OR REPLACE FUNCTION public.secure_vendor_store_type_update()
RETURNS trigger AS $$
BEGIN
  -- If service_role, allow update
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- If store_type changed
  IF NEW.store_type IS DISTINCT FROM OLD.store_type THEN
    -- Check if user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = true
    ) THEN
        -- Revert store_type change if non-admin
        NEW.store_type := OLD.store_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_secure_vendor_store_type ON public.vendors;
CREATE TRIGGER tr_secure_vendor_store_type
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.secure_vendor_store_type_update();

-- 5. FUNCTION TO SYNC VENDOR STORE TYPE TO VENDOR_STORES
CREATE OR REPLACE FUNCTION public.sync_vendor_store_type()
RETURNS trigger AS $$
BEGIN
  IF NEW.store_type IS DISTINCT FROM OLD.store_type THEN
    UPDATE public.vendor_stores
    SET store_type = NEW.store_type
    WHERE vendor_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sync_vendor_store_type ON public.vendors;
CREATE TRIGGER tr_sync_vendor_store_type
  AFTER UPDATE OF store_type ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_vendor_store_type();

COMMIT;
