-- Migration: Fix Vendor Argentina Permissions and Admin Field Protection Trigger
-- Date: 2026-08-21
-- Description: Allows active vendors to manage their own ships_to_argentina preference while strictly protecting status against unauthorized vendor modifications.

CREATE OR REPLACE FUNCTION public.enforce_vendor_admin_fields_protection()
RETURNS TRIGGER AS $$
BEGIN
  -- If executed by an authenticated non-admin user
  IF auth.uid() IS NOT NULL THEN
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

      -- Note: NEW.ships_to_argentina is ALLOWED to be updated by the vendor for their own row!
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger
DROP TRIGGER IF EXISTS trg_protect_vendor_admin_fields ON public.vendors;
CREATE TRIGGER trg_protect_vendor_admin_fields
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vendor_admin_fields_protection();
