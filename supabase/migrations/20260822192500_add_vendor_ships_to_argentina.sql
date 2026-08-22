-- Migration: Add ships_to_argentina column to public.vendors and update triggers/RLS
-- Date: 2026-08-22
-- Description: Adds ships_to_argentina BOOLEAN column defaulting to false for external vendors, and sets up trigger protections.

-- 1. Add column if not exists
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS ships_to_argentina BOOLEAN NOT NULL DEFAULT false;

-- Backfill ships_to_argentina from shipping_settings JSONB if present
UPDATE public.vendors
SET ships_to_argentina = COALESCE((shipping_settings->>'ships_to_argentina')::boolean, false)
WHERE ships_to_argentina IS FALSE AND shipping_settings ? 'ships_to_argentina';

-- 2. Create/Update Trigger function to protect admin fields
CREATE OR REPLACE FUNCTION public.enforce_vendor_admin_fields_protection()
RETURNS TRIGGER AS $$
BEGIN
  -- If executed by an authenticated user
  IF auth.uid() IS NOT NULL THEN
    -- Check if user is an admin via is_admin boolean flag on public.profiles
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    ) THEN
      -- Vendors can ONLY update their OWN vendor profile record
      IF OLD.id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only update your own vendor profile.';
      END IF;

      -- Strictly protect administrative fields against modification by non-admins
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status := OLD.status;
      END IF;

      -- NEW.ships_to_argentina is ALLOWED to be updated by the vendor for their own row!
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-attach trigger to vendors table
DROP TRIGGER IF EXISTS trg_protect_vendor_admin_fields ON public.vendors;
CREATE TRIGGER trg_protect_vendor_admin_fields
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vendor_admin_fields_protection();

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
