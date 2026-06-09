-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: Vendor Shipping Connections Table
-- Applied: 2026-08-04
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vendor_shipping_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    account_name TEXT,
    connection_status TEXT DEFAULT 'disconnected',
    credentials_encrypted TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    pickup_address JSONB DEFAULT '{}'::jsonb,
    last_tested_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vendor_id, provider)
);

-- Enable RLS
ALTER TABLE public.vendor_shipping_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Vendors can view their own connections
CREATE POLICY "Vendors can view their own shipping connections"
    ON public.vendor_shipping_connections FOR SELECT
    USING (auth.uid() = vendor_id);

-- Policy: Admins can view all connections
CREATE POLICY "Admins can view all shipping connections"
    ON public.vendor_shipping_connections FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Note: No INSERT/UPDATE/DELETE policies for frontend. 
-- All mutations must go through Edge Functions (vendor-shipping-save-connection) 
-- to ensure credentials are encrypted securely before saving, and to prevent tampering.
