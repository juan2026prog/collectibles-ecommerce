-- Migration for International Importer (Zinc/Amazon)

-- Table: international_import_searches
CREATE TABLE IF NOT EXISTS public.international_import_searches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    provider text DEFAULT 'zinc',
    retailer text DEFAULT 'amazon',
    query text NOT NULL,
    brand_filter text,
    category_filter text,
    min_price numeric,
    max_price numeric,
    min_rating numeric,
    max_results int DEFAULT 20,
    page int DEFAULT 1,
    raw_response jsonb,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- Table: international_import_candidates
CREATE TABLE IF NOT EXISTS public.international_import_candidates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    search_id uuid REFERENCES public.international_import_searches(id) ON DELETE CASCADE,
    provider text DEFAULT 'zinc',
    retailer text DEFAULT 'amazon',
    external_product_id text,
    title text NOT NULL,
    brand text,
    category text,
    image_url text,
    product_url_external text NOT NULL,
    price_usd numeric,
    currency text DEFAULT 'USD',
    rating numeric,
    review_count int,
    availability text,
    raw_data jsonb,
    status text DEFAULT 'review', -- values: review, imported, rejected
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Table: international_products
CREATE TABLE IF NOT EXISTS public.international_products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source_provider text DEFAULT 'zinc',
    source_retailer text DEFAULT 'amazon',
    external_product_id text,
    title text NOT NULL,
    description text,
    brand text,
    category text,
    image_url text,
    product_url_external text NOT NULL,
    base_price_usd numeric,
    usa_domestic_shipping_usd numeric DEFAULT 0,
    collectibles_fee_usd numeric DEFAULT 0,
    final_price_usd numeric,
    final_price_uyu numeric,
    currency text DEFAULT 'USD',
    availability text,
    rating numeric,
    review_count int,
    estimated_delivery_min_days int DEFAULT 5,
    estimated_delivery_max_days int DEFAULT 12,
    status text DEFAULT 'draft', -- values: draft, published, disabled, unavailable
    raw_data jsonb,
    last_synced_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_international_import_candidates_url ON public.international_import_candidates(product_url_external);
CREATE INDEX IF NOT EXISTS idx_international_products_url ON public.international_products(product_url_external);
CREATE INDEX IF NOT EXISTS idx_international_products_source ON public.international_products(source_provider, source_retailer);
CREATE INDEX IF NOT EXISTS idx_international_products_status ON public.international_products(status);

-- Enable RLS
ALTER TABLE public.international_import_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.international_import_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.international_products ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin (if not already exists, fallback to joining profiles)
-- Assuming the standard setup used in the project relies on the profiles.is_admin or profiles.role. 
-- The user explicitly mentioned: "Si no existe, crear políticas usando profiles.role IN ('admin', 'super_admin')" 
-- Let's define the policies by joining the profiles table.

CREATE POLICY "Admins can select international_import_searches" 
ON public.international_import_searches FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can insert international_import_searches" 
ON public.international_import_searches FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can update international_import_searches" 
ON public.international_import_searches FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can delete international_import_searches" 
ON public.international_import_searches FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Policies for candidates
CREATE POLICY "Admins can select international_import_candidates" 
ON public.international_import_candidates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can insert international_import_candidates" 
ON public.international_import_candidates FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can update international_import_candidates" 
ON public.international_import_candidates FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can delete international_import_candidates" 
ON public.international_import_candidates FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Policies for products
CREATE POLICY "Admins can select international_products" 
ON public.international_products FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can insert international_products" 
ON public.international_products FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can update international_products" 
ON public.international_products FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can delete international_products" 
ON public.international_products FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);
