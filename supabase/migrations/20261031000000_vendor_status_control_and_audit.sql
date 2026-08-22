-- Migration: Vendor Status Control and Audit Logging
-- Date: 2026-08-21
-- Description: Adds status check constraint, creates vendor_status_audit_logs table, and secures status against unauthorized vendor updates.

-- 1. Ensure public.vendors status constraint supports active, inactive, suspended, pending
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_status_check'
  ) THEN
    ALTER TABLE public.vendors 
      ADD CONSTRAINT vendors_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'pending'));
  END IF;
END $$;

-- 2. Create immutable audit table for vendor status changes
CREATE TABLE IF NOT EXISTS public.vendor_status_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on vendor_status_audit_logs
ALTER TABLE public.vendor_status_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view and manage all vendor status audit logs" ON public.vendor_status_audit_logs;
CREATE POLICY "Admins can view and manage all vendor status audit logs"
  ON public.vendor_status_audit_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Vendors can view their own status audit logs" ON public.vendor_status_audit_logs;
CREATE POLICY "Vendors can view their own status audit logs"
  ON public.vendor_status_audit_logs
  FOR SELECT
  USING (vendor_id = auth.uid());

-- 3. Security: Trigger to block non-admins from modifying vendor status or ships_to_argentina directly
CREATE OR REPLACE FUNCTION public.enforce_vendor_admin_fields_protection()
RETURNS TRIGGER AS $$
BEGIN
  -- If executed by an authenticated non-admin user
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    ) THEN
      -- Reset status and ships_to_argentina to previous values if modified by vendor
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status := OLD.status;
      END IF;
      IF OLD.ships_to_argentina IS DISTINCT FROM NEW.ships_to_argentina THEN
        NEW.ships_to_argentina := OLD.ships_to_argentina;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_vendor_admin_fields ON public.vendors;
CREATE TRIGGER trg_protect_vendor_admin_fields
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vendor_admin_fields_protection();
