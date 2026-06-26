-- Migration: Approved Badges Verification Flow and Vendor Promotions Opt-in
-- Date: 2026-06-26

BEGIN;

-- 1. ADD promotions_opt_in TO vendors TABLE
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS promotions_opt_in BOOLEAN NOT NULL DEFAULT false;

-- 2. ADD APPROVAL FIELDS TO vendor_store_badge_assignments TABLE
ALTER TABLE public.vendor_store_badge_assignments
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending_review' 
    CONSTRAINT check_badge_assignment_status CHECK (status IN ('pending_review', 'active', 'rejected', 'revoked'));

-- 3. BACKFILL EXISTING BADGE ASSIGNMENTS
-- Mark them as active and approved by the first available administrator to prevent breakage
UPDATE public.vendor_store_badge_assignments
SET status = 'active',
    approved_at = now(),
    approved_by = (
      SELECT id FROM public.profiles 
      WHERE is_admin = true OR id IN (SELECT user_id FROM public.user_roles WHERE role IN ('god_admin', 'admin'))
      LIMIT 1
    )
WHERE approved_by IS NULL;

-- 4. SECURITY AUDIT HARDENING: ENABLE RLS ON FLOATING TABLES
ALTER TABLE public.seo_backup_202607_seo3a ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.international_sync_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.international_product_sync_logs ENABLE ROW LEVEL SECURITY;

-- 5. RE-CREATE POLICIES FOR SAFETY
DROP POLICY IF EXISTS "Admins manage seo_backup" ON public.seo_backup_202607_seo3a;
DROP POLICY IF EXISTS "Admins manage international_sync_settings" ON public.international_sync_settings;
DROP POLICY IF EXISTS "Admins manage international_product_sync_logs" ON public.international_product_sync_logs;

CREATE POLICY "Admins manage seo_backup" ON public.seo_backup_202607_seo3a FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admins manage international_sync_settings" ON public.international_sync_settings FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admins manage international_product_sync_logs" ON public.international_product_sync_logs FOR ALL TO authenticated USING (public.is_admin());

COMMIT;
