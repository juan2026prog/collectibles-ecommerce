-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Credentials & Data Structure
-- Applied: 2026-05-17
-- ══════════════════════════════════════════════════════════════

-- 1. Create secure credentials table
CREATE TABLE IF NOT EXISTS public.ml_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deny all access to public/anon/authenticated. Only service_role can access this.
ALTER TABLE public.ml_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all access to ml_credentials" ON public.ml_credentials;
CREATE POLICY "Deny all access to ml_credentials" ON public.ml_credentials
    FOR ALL
    USING (false)
    WITH CHECK (false);

-- 2. Migrate existing tokens if any
DO $$
DECLARE
    v_access_token TEXT;
    v_refresh_token TEXT;
BEGIN
    SELECT value INTO v_access_token FROM public.site_settings WHERE key = 'mercadolibre_access_token';
    SELECT value INTO v_refresh_token FROM public.site_settings WHERE key = 'mercadolibre_refresh_token';
    
    IF v_access_token IS NOT NULL THEN
        INSERT INTO public.ml_credentials (access_token, refresh_token)
        VALUES (v_access_token, v_refresh_token);
        
        -- Set a flag in site_settings so frontend knows it's connected without reading the token
        INSERT INTO public.site_settings (key, value, updated_at) 
        VALUES ('ml_connection_status', 'true', NOW())
        ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();
    END IF;
END $$;

-- 3. Delete tokens from site_settings permanently
DELETE FROM public.site_settings WHERE key IN ('mercadolibre_access_token', 'mercadolibre_refresh_token');

-- 4. Ensure metadata JSONB fields exist for products
-- (Products table should already have metadata, but just in case)
-- We use metadata to store: ml_category_id, ml_permalink, sold_quantity, initial_quantity, source, sku_source, generated_sku

-- 5. Ensure product_categories table exists for M2M category relationships
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, category_id)
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read product_categories" ON public.product_categories;
CREATE POLICY "Public can read product_categories" ON public.product_categories
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admins can manage product_categories" ON public.product_categories;
CREATE POLICY "Admins can manage product_categories" ON public.product_categories
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );
