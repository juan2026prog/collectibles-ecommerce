-- Migration to add approved_by and approved_at columns to vendor_stores,
-- and add a trigger to enforce that only administrators can modify these fields
-- or set a vendor store status to active (preventing self-promotion).

ALTER TABLE public.vendor_stores ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE public.vendor_stores ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.check_vendor_store_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- If there is a logged in user, verify they are an admin
  IF auth.uid() IS NOT NULL AND NOT (SELECT COALESCE(is_admin, false) FROM public.profiles WHERE id = auth.uid()) THEN
    -- Prevent changing is_official to true
    IF NEW.is_official = true AND (OLD.is_official IS NULL OR OLD.is_official = false) THEN
      RAISE EXCEPTION 'Solo los administradores pueden marcar una tienda como oficial.';
    END IF;

    -- Prevent changing approved_by/approved_at
    IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Solo los administradores pueden modificar la aprobacion de tienda oficial.';
    END IF;

    -- Prevent changing status to active if it wasn't active
    IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Solo los administradores pueden aprobar o activar tiendas.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_check_vendor_store_modification
  BEFORE UPDATE ON public.vendor_stores
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vendor_store_modification();
