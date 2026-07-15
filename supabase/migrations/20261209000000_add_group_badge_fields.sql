-- Migration: Add Group Badge Fields and Audit Trigger
-- Date: 2026-12-09

-- 1. Add columns to product_groups
ALTER TABLE public.product_groups
ADD COLUMN IF NOT EXISTS badge_image_url text,
ADD COLUMN IF NOT EXISTS badge_storage_path text,
ADD COLUMN IF NOT EXISTS badge_alt_text text,
ADD COLUMN IF NOT EXISTS badge_updated_at timestamptz;

-- 2. Create trigger to log audits
DROP TRIGGER IF EXISTS audit_product_groups_trigger ON public.product_groups;

CREATE TRIGGER audit_product_groups_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.product_groups
FOR EACH ROW EXECUTE FUNCTION public.log_audit_trigger();
