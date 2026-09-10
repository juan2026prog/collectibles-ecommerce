-- ==============================================================================
-- MIGRATION: SOURCING INTELLIGENCE FASE 2 — CANONICAL ENGINE & OFFERS SCHEMA
-- Canonical Products, Identifiers, Families, Raw Listings, Normalized Sellers, Offers, Match Reviews
-- ==============================================================================

-- 1. Table: product_families
CREATE TABLE IF NOT EXISTS public.product_families (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    franchise text NOT NULL,
    brand text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Table: canonical_products
CREATE TABLE IF NOT EXISTS public.canonical_products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    family_id uuid REFERENCES public.product_families(id) ON DELETE SET NULL,
    brand text NOT NULL,
    manufacturer text,
    franchise text NOT NULL,
    series text,
    character text NOT NULL,
    product_name text NOT NULL,
    canonical_title text NOT NULL,
    category text DEFAULT 'Action Figures',
    subcategory text,
    scale text,
    edition text DEFAULT 'Standard',
    variant text,
    color_variant text,
    release_year int,
    gtin text,
    ean text,
    upc text,
    mpn text,
    sku_reference text UNIQUE NOT NULL,
    primary_image text NOT NULL,
    additional_images jsonb DEFAULT '[]'::jsonb,
    description text,
    specifications jsonb DEFAULT '{}'::jsonb,
    package_dimensions jsonb DEFAULT '{}'::jsonb,
    package_weight_lbs numeric(8,3),
    product_status text DEFAULT 'ACTIVE', -- ACTIVE, DRAFT, ARCHIVED, REVIEW_REQUIRED
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Table: product_identifiers
CREATE TABLE IF NOT EXISTS public.product_identifiers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    canonical_product_id uuid REFERENCES public.canonical_products(id) ON DELETE CASCADE,
    identifier_type text NOT NULL, -- UPC, EAN, GTIN, MPN, ASIN, BESTBUY_SKU, EBAY_ITEM_ID, RETAILER_SKU
    identifier_value text NOT NULL,
    source text DEFAULT 'system',
    verified boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    UNIQUE(identifier_type, identifier_value)
);

-- 4. Table: source_listings
CREATE TABLE IF NOT EXISTS public.source_listings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source text NOT NULL, -- amazon, ebay, bestbuy, etc.
    external_id text NOT NULL,
    url text NOT NULL,
    raw_title text NOT NULL,
    raw_description text,
    raw_brand text,
    raw_price numeric(10,2) NOT NULL,
    raw_currency text DEFAULT 'USD',
    raw_condition text,
    raw_stock int,
    raw_images jsonb DEFAULT '[]'::jsonb,
    seller_external_id text,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    first_seen_at timestamptz DEFAULT now(),
    last_seen_at timestamptz DEFAULT now(),
    UNIQUE(source, external_id)
);

-- 5. Table: source_sellers
CREATE TABLE IF NOT EXISTS public.source_sellers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source text NOT NULL,
    external_seller_id text NOT NULL,
    seller_name text NOT NULL,
    rating numeric(5,2),
    rating_count int DEFAULT 0,
    positive_percentage numeric(5,2),
    seller_status text DEFAULT 'UNKNOWN', -- TRUSTED, ACCEPTABLE, RISKY, UNKNOWN
    first_seen_at timestamptz DEFAULT now(),
    last_seen_at timestamptz DEFAULT now(),
    UNIQUE(source, external_seller_id)
);

-- 6. Table: product_offers
CREATE TABLE IF NOT EXISTS public.product_offers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    canonical_product_id uuid REFERENCES public.canonical_products(id) ON DELETE CASCADE,
    source_listing_id uuid REFERENCES public.source_listings(id) ON DELETE CASCADE,
    retailer text NOT NULL,
    seller_id uuid REFERENCES public.source_sellers(id) ON DELETE SET NULL,
    condition text DEFAULT 'new',
    condition_normalized text DEFAULT 'NEW', -- NEW, USED_LIKE_NEW, USED_GOOD, USED_ACCEPTABLE, REFURBISHED, UNKNOWN
    price numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD',
    original_price numeric(10,2),
    sale_price numeric(10,2),
    shipping_us numeric(10,2) DEFAULT 0,
    shipping_estimated numeric(10,2) DEFAULT 0,
    availability text DEFAULT 'IN_STOCK', -- IN_STOCK, LOW_STOCK, PREORDER, BACKORDER, OUT_OF_STOCK, UNKNOWN
    estimated_delivery_min date,
    estimated_delivery_max date,
    offer_url text NOT NULL,
    is_best_new_offer boolean DEFAULT false,
    is_best_used_offer boolean DEFAULT false,
    first_seen_at timestamptz DEFAULT now(),
    last_seen_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(canonical_product_id, source_listing_id)
);

-- 7. Table: match_reviews
CREATE TABLE IF NOT EXISTS public.match_reviews (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source_listing_id uuid REFERENCES public.source_listings(id) ON DELETE CASCADE,
    suggested_canonical_product_id uuid REFERENCES public.canonical_products(id) ON DELETE SET NULL,
    confidence_score numeric(5,2) NOT NULL,
    reasons jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'REVIEW_REQUIRED', -- REVIEW_REQUIRED, CONFIRMED, REJECTED, DISCARDED
    manual_action text, -- LINK_EXISTING, CREATE_NEW, REJECT
    reviewed_by text,
    reviewed_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Indexes for maximum performance
CREATE INDEX IF NOT EXISTS idx_canonical_sku ON public.canonical_products(sku_reference);
CREATE INDEX IF NOT EXISTS idx_canonical_brand ON public.canonical_products(brand);
CREATE INDEX IF NOT EXISTS idx_canonical_character ON public.canonical_products(character);
CREATE INDEX IF NOT EXISTS idx_canonical_upc ON public.canonical_products(upc);
CREATE INDEX IF NOT EXISTS idx_canonical_mpn ON public.canonical_products(mpn);
CREATE INDEX IF NOT EXISTS idx_canonical_family ON public.canonical_products(family_id);

CREATE INDEX IF NOT EXISTS idx_identifiers_type_val ON public.product_identifiers(identifier_type, identifier_value);
CREATE INDEX IF NOT EXISTS idx_identifiers_product ON public.product_identifiers(canonical_product_id);

CREATE INDEX IF NOT EXISTS idx_source_listings_src_ext ON public.source_listings(source, external_id);
CREATE INDEX IF NOT EXISTS idx_source_sellers_src_ext ON public.source_sellers(source, external_seller_id);

CREATE INDEX IF NOT EXISTS idx_offers_canonical ON public.product_offers(canonical_product_id);
CREATE INDEX IF NOT EXISTS idx_offers_retailer ON public.product_offers(retailer);
CREATE INDEX IF NOT EXISTS idx_offers_condition ON public.product_offers(condition_normalized);
CREATE INDEX IF NOT EXISTS idx_offers_avail ON public.product_offers(availability);

CREATE INDEX IF NOT EXISTS idx_match_reviews_status ON public.match_reviews(status);
CREATE INDEX IF NOT EXISTS idx_match_reviews_listing ON public.match_reviews(source_listing_id);

-- Enable RLS (Strict Admin Only)
ALTER TABLE public.product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage product_families"
    ON public.product_families FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins can manage canonical_products"
    ON public.canonical_products FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins can manage product_identifiers"
    ON public.product_identifiers FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins can manage source_listings"
    ON public.source_listings FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins can manage source_sellers"
    ON public.source_sellers FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins can manage product_offers"
    ON public.product_offers FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins can manage match_reviews"
    ON public.match_reviews FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
