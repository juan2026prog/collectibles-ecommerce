-- Migration: Fix profile column check in enforce_vendor_admin_fields_protection trigger
-- Date: 2026-08-22
-- Description: Fixes column "role" does not exist error (PGRST 42703) by querying is_admin = true on public.profiles.

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
