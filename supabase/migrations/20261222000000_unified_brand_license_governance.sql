-- Migration: Unified Brand & License Governance Schema Extension
-- Description: Extends products and vendor_brand_audit_logs for unified brand + license suggestions, evidence, and actions.

-- 1. Add License Suggestion & Governance columns to public.products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS suggested_license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_license_name TEXT,
  ADD COLUMN IF NOT EXISTS license_confidence_score NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recommended_action TEXT DEFAULT 'KEEP',
  ADD COLUMN IF NOT EXISTS brand_audit_evidence TEXT[];

-- 2. Add License & Evidence audit columns to public.vendor_brand_audit_logs
ALTER TABLE public.vendor_brand_audit_logs
  ADD COLUMN IF NOT EXISTS old_licenses TEXT[],
  ADD COLUMN IF NOT EXISTS new_licenses TEXT[],
  ADD COLUMN IF NOT EXISTS evidence JSONB;

-- 3. Index new columns for efficient dashboard querying
CREATE INDEX IF NOT EXISTS idx_products_suggested_license_id ON public.products(suggested_license_id);
CREATE INDEX IF NOT EXISTS idx_products_recommended_action ON public.products(recommended_action);
CREATE INDEX IF NOT EXISTS idx_products_needs_brand_review ON public.products(needs_brand_review) WHERE needs_brand_review = true;
