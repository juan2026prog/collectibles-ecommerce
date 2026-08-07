-- ══════════════════════════════════════════════════════════════
-- Migration: Multi-Vendor Distrilogic Integration Schema
-- Applied: 2026-08-04
-- ══════════════════════════════════════════════════════════════

-- 1. Create vendor_shipping_services table
CREATE TABLE IF NOT EXISTS public.vendor_shipping_services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_id UUID REFERENCES public.vendor_shipping_connections(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE NOT NULL,
    provider TEXT NOT NULL DEFAULT 'distrilogic',
    external_service_id TEXT NOT NULL,
    external_service_name TEXT NOT NULL,
    display_name TEXT,
    enabled BOOLEAN DEFAULT true NOT NULL,
    estimated_delivery_text TEXT,
    free_shipping_enabled BOOLEAN DEFAULT false NOT NULL,
    free_shipping_threshold NUMERIC DEFAULT 0,
    markup_type TEXT CHECK (markup_type IN ('none', 'fixed', 'percentage')) DEFAULT 'none' NOT NULL,
    markup_value NUMERIC DEFAULT 0 NOT NULL,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(vendor_id, provider, external_service_id)
);

-- 2. Create shipping_quotes table for checkout caching
CREATE TABLE IF NOT EXISTS public.shipping_quotes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE NOT NULL,
    integration_id UUID REFERENCES public.vendor_shipping_connections(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'distrilogic',
    destination_department TEXT NOT NULL,
    destination_locality TEXT,
    external_service_id TEXT NOT NULL,
    provider_cost NUMERIC NOT NULL DEFAULT 0,
    customer_cost NUMERIC NOT NULL DEFAULT 0,
    free_shipping_applied BOOLEAN DEFAULT false NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Extend shipments table with Distrilogic specific columns
ALTER TABLE public.shipments 
    ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES public.vendor_shipping_connections(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS external_tracking_number TEXT,
    ADD COLUMN IF NOT EXISTS external_service_id TEXT,
    ADD COLUMN IF NOT EXISTS external_service_name TEXT,
    ADD COLUMN IF NOT EXISTS external_status_code INTEGER,
    ADD COLUMN IF NOT EXISTS external_status_description TEXT,
    ADD COLUMN IF NOT EXISTS customer_shipping_cost NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_shipping_cost NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS free_shipping_applied BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS label_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS label_generated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS error_code TEXT,
    ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_vendor_shipping_services_vendor ON public.vendor_shipping_services(vendor_id, provider);
CREATE INDEX IF NOT EXISTS idx_shipping_quotes_vendor ON public.shipping_quotes(vendor_id, provider, destination_department);
CREATE INDEX IF NOT EXISTS idx_shipments_vendor_provider ON public.shipments(vendor_id, provider_key);

-- 4. Enable Row Level Security
ALTER TABLE public.vendor_shipping_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_quotes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for vendor_shipping_services
DROP POLICY IF EXISTS "Vendors can view their own shipping services" ON public.vendor_shipping_services;
CREATE POLICY "Vendors can view their own shipping services"
    ON public.vendor_shipping_services FOR SELECT
    USING (auth.uid() = vendor_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Vendors can manage their own shipping services" ON public.vendor_shipping_services;
CREATE POLICY "Vendors can manage their own shipping services"
    ON public.vendor_shipping_services FOR ALL
    USING (auth.uid() = vendor_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Public can view enabled vendor shipping services" ON public.vendor_shipping_services;
CREATE POLICY "Public can view enabled vendor shipping services"
    ON public.vendor_shipping_services FOR SELECT
    USING (enabled = true);

-- 6. RLS Policies for shipping_quotes
DROP POLICY IF EXISTS "Anyone can select valid shipping quotes" ON public.shipping_quotes;
CREATE POLICY "Anyone can select valid shipping quotes"
    ON public.shipping_quotes FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated or Service role manage quotes" ON public.shipping_quotes;
CREATE POLICY "Authenticated or Service role manage quotes"
    ON public.shipping_quotes FOR ALL
    USING (true);

-- 7. Seed site settings for Distrilogic feature flags if not present
INSERT INTO public.site_settings (key, value)
VALUES 
    ('distrilogic_integration_enabled', 'true'),
    ('distrilogic_testing_enabled', 'true'),
    ('distrilogic_production_enabled', 'false'),
    ('distrilogic_webhook_enabled', 'false'),
    ('distrilogic_auto_create_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
