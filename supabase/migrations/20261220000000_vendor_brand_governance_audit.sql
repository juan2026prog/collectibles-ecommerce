-- Migration: 20261220000000_vendor_brand_governance_audit.sql
-- Description: Add brand governance audit fields to products and create immutable vendor_brand_audit_logs table.

-- 1. Add audit columns to public.products if not present
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS needs_brand_review BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS brand_audit_status TEXT CHECK (brand_audit_status IN ('VALID_BRAND', 'MISSING_BRAND', 'GENERIC_BRAND', 'LICENSE_AS_BRAND', 'UNKNOWN_BRAND', 'INVALID_BRAND', 'AMBIGUOUS_BRAND')),
ADD COLUMN IF NOT EXISTS brand_audit_reason TEXT,
ADD COLUMN IF NOT EXISTS suggested_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS suggested_brand_name TEXT,
ADD COLUMN IF NOT EXISTS brand_confidence_score NUMERIC(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS is_brand_exception BOOLEAN DEFAULT false;

-- Create indexes for efficient querying in Admin Catalog Center
CREATE INDEX IF NOT EXISTS idx_products_needs_brand_review ON public.products(needs_brand_review) WHERE needs_brand_review = true;
CREATE INDEX IF NOT EXISTS idx_products_brand_audit_status ON public.products(brand_audit_status);

-- 2. Create public.vendor_brand_audit_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.vendor_brand_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    old_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
    old_brand_name TEXT,
    new_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
    new_brand_name TEXT,
    reason TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('auto_fix', 'admin_manual', 'vendor_correction', 'system_audit', 'exception_approved')),
    confidence NUMERIC(5,2) DEFAULT 0.00,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on vendor_brand_audit_logs
ALTER TABLE public.vendor_brand_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for vendor_brand_audit_logs
DROP POLICY IF EXISTS "Admins can manage brand audit logs" ON public.vendor_brand_audit_logs;
CREATE POLICY "Admins can manage brand audit logs"
ON public.vendor_brand_audit_logs
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);

DROP POLICY IF EXISTS "Vendors can view brand audit logs for their products" ON public.vendor_brand_audit_logs;
CREATE POLICY "Vendors can view brand audit logs for their products"
ON public.vendor_brand_audit_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = vendor_brand_audit_logs.product_id
        AND p.vendor_id = auth.uid()
    )
);
