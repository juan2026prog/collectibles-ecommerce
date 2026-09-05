-- ==============================================================================
-- MIGRATION: SOURCING & IMPORTACIÓN MULTIFUENTE V2
-- Schema for Normalized Products, Multiple Source Offers, Research Packs & Uruguay Stores
-- ==============================================================================

-- 1. Table: sourcing_research_packs
CREATE TABLE IF NOT EXISTS public.sourcing_research_packs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    pack_id text UNIQUE NOT NULL,
    title text NOT NULL,
    schema_version text DEFAULT '1.0',
    source text DEFAULT 'chatgpt-research',
    status text DEFAULT 'READY',
    total_items int DEFAULT 0,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Table: sourcing_normalized_products
CREATE TABLE IF NOT EXISTS public.sourcing_normalized_products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    pack_id uuid REFERENCES public.sourcing_research_packs(id) ON DELETE SET NULL,
    canonical_sku text UNIQUE NOT NULL,
    title text NOT NULL,
    brand text NOT NULL,
    license text,
    line text,
    character text,
    scale text,
    upc text,
    ean text,
    mpn text,
    asin text,
    image_url text,
    gallery_images jsonb DEFAULT '[]'::jsonb,
    authenticity_status text DEFAULT 'NEEDS_VERIFICATION',
    authenticity_score int DEFAULT 50,
    authenticity_evidence jsonb DEFAULT '{}'::jsonb,
    catalog_status text DEFAULT 'NOT_IN_CATALOG',
    matched_catalog_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    product_type text DEFAULT 'EVERGREEN',
    opportunity_score int DEFAULT 60,
    catalog_value_score int DEFAULT 70,
    cost_puesto_usd numeric(10,2) DEFAULT 0,
    sale_price_usd numeric(10,2) DEFAULT 0,
    profit_usd numeric(10,2) DEFAULT 0,
    margin_percent numeric(5,2) DEFAULT 0,
    profit_protection_status text DEFAULT 'PASS',
    uruguay_market jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'review', -- review, imported, published_preorder, rejected
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Table: sourcing_source_offers
CREATE TABLE IF NOT EXISTS public.sourcing_source_offers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    normalized_product_id uuid REFERENCES public.sourcing_normalized_products(id) ON DELETE CASCADE,
    source text NOT NULL, -- amazon, ebay, bestbuy, walmart, etc.
    source_product_id text NOT NULL,
    url text NOT NULL,
    seller text,
    price numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD',
    domestic_shipping numeric(10,2) DEFAULT 0,
    availability text DEFAULT 'in_stock',
    stock int,
    condition text DEFAULT 'new',
    estimated_delivery text,
    is_best_source boolean DEFAULT false,
    is_zinc_compatible boolean DEFAULT false,
    reliability_score int DEFAULT 80,
    last_checked_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- 4. Table: uruguay_market_stores
CREATE TABLE IF NOT EXISTS public.uruguay_market_stores (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    domain text NOT NULL,
    is_active boolean DEFAULT true,
    method text DEFAULT 'MANUAL', -- API, FEED, CSV, URL, SCRAPING, MANUAL
    priority int DEFAULT 1,
    reliability_score numeric(5,2) DEFAULT 90.0,
    last_update timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sourcing_norm_brand ON public.sourcing_normalized_products(brand);
CREATE INDEX IF NOT EXISTS idx_sourcing_norm_upc ON public.sourcing_normalized_products(upc);
CREATE INDEX IF NOT EXISTS idx_sourcing_norm_sku ON public.sourcing_normalized_products(canonical_sku);
CREATE INDEX IF NOT EXISTS idx_sourcing_offers_product ON public.sourcing_source_offers(normalized_product_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_offers_source ON public.sourcing_source_offers(source, source_product_id);

-- Enable RLS (Strict Admin Only)
ALTER TABLE public.sourcing_research_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_normalized_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_source_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uruguay_market_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sourcing_research_packs"
    ON public.sourcing_research_packs FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins can manage sourcing_normalized_products"
    ON public.sourcing_normalized_products FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins can manage sourcing_source_offers"
    ON public.sourcing_source_offers FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins can manage uruguay_market_stores"
    ON public.uruguay_market_stores FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- Seed Default Uruguayan Stores
INSERT INTO public.uruguay_market_stores (name, domain, is_active, method, priority, reliability_score)
VALUES 
    ('Mercado Libre Uruguay', 'mercadolibre.com.uy', true, 'API', 1, 95.0),
    ('XUruguay Geek & Toys', 'xuruguay.com.uy', true, 'URL', 2, 88.0),
    ('GeekSpot Montevideo', 'geekspot.uy', true, 'FEED', 3, 85.0),
    ('Tiendamia (UY Local)', 'tiendamia.com/uy', true, 'API', 4, 90.0)
ON CONFLICT DO NOTHING;
