-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Curation & Vendor Product Offers Schema
-- Applied: 2026-07-25
-- ══════════════════════════════════════════════════════════════

-- 1. Create vendor_products table (Vendedor - Oferta Comercial Master)
CREATE TABLE IF NOT EXISTS public.vendor_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE, -- NULL represents platform/owner
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    price NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'draft'::text])),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial index to enforce UNIQUE (vendor_id, product_id) when vendor_id is NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_products_vendor_prod_unique
ON public.vendor_products (vendor_id, product_id)
WHERE vendor_id IS NOT NULL;

-- Partial index to enforce UNIQUE (product_id) for platform offers (vendor_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_products_platform_prod_unique
ON public.vendor_products (product_id)
WHERE vendor_id IS NULL;

-- 2. Create vendor_product_variants table (Stock y SKU de Vendedor por Variante)
CREATE TABLE IF NOT EXISTS public.vendor_product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_product_id UUID REFERENCES public.vendor_products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    inventory_count INTEGER DEFAULT 0,
    price_adjustment NUMERIC(10,2) DEFAULT 0.00,
    sku_vendedor TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (vendor_product_id, variant_id)
);

-- 3. Modify public.ml_catalog_links to add references to vendor_products & vendor_product_variants
ALTER TABLE public.ml_catalog_links 
    ADD COLUMN IF NOT EXISTS vendor_product_id UUID REFERENCES public.vendor_products(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS vendor_product_variant_id UUID REFERENCES public.vendor_product_variants(id) ON DELETE SET NULL;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_product_variants ENABLE ROW LEVEL SECURITY;

-- 5. Define Security Policies for vendor_products
DROP POLICY IF EXISTS "Admins manage all vendor products" ON public.vendor_products;
CREATE POLICY "Admins manage all vendor products" ON public.vendor_products
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors manage own products" ON public.vendor_products;
CREATE POLICY "Vendors manage own products" ON public.vendor_products
    FOR ALL USING (vendor_id = auth.uid())
    WITH CHECK (vendor_id = auth.uid());

DROP POLICY IF EXISTS "Public can view vendor products" ON public.vendor_products;
CREATE POLICY "Public can view vendor products" ON public.vendor_products
    FOR SELECT USING (true);

-- 6. Define Security Policies for vendor_product_variants
DROP POLICY IF EXISTS "Admins manage all vendor product variants" ON public.vendor_product_variants;
CREATE POLICY "Admins manage all vendor product variants" ON public.vendor_product_variants
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors manage own variants" ON public.vendor_product_variants;
CREATE POLICY "Vendors manage own variants" ON public.vendor_product_variants
    FOR ALL USING (
        vendor_product_id IN (
            SELECT id FROM public.vendor_products WHERE vendor_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Public can view vendor product variants" ON public.vendor_product_variants;
CREATE POLICY "Public can view vendor product variants" ON public.vendor_product_variants
    FOR SELECT USING (true);
