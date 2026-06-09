-- Migration for V2 Amazon Importer (Zinc)

-- 1. Create Mapping Tables

-- Table: amazon_category_mapping
CREATE TABLE IF NOT EXISTS public.amazon_category_mapping (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    amazon_category text,
    amazon_subcategory text,
    collectibles_category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    collectibles_subcategory_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    confidence_score int DEFAULT 100,
    created_at timestamptz DEFAULT now(),
    UNIQUE(amazon_category, amazon_subcategory)
);

-- Table: amazon_brand_mapping
CREATE TABLE IF NOT EXISTS public.amazon_brand_mapping (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_name text UNIQUE NOT NULL,
    collectibles_category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    collectibles_subcategory_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    confidence_score int DEFAULT 100,
    created_at timestamptz DEFAULT now()
);

-- Table: keyword_mapping_rules
CREATE TABLE IF NOT EXISTS public.keyword_mapping_rules (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    keyword text UNIQUE NOT NULL,
    target_category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    target_subcategory_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    priority int DEFAULT 1,
    created_at timestamptz DEFAULT now()
);

-- Indexes for mapping tables
CREATE INDEX IF NOT EXISTS idx_amazon_cat_mapping ON public.amazon_category_mapping(amazon_category);
CREATE INDEX IF NOT EXISTS idx_amazon_brand_mapping ON public.amazon_brand_mapping(brand_name);

-- 2. Modify existing tables

-- Add suggestion fields to candidates
ALTER TABLE public.international_import_candidates
ADD COLUMN IF NOT EXISTS suggested_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS suggested_subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS mapping_confidence int DEFAULT 0;

-- Add tracking and mapping fields to products
ALTER TABLE public.international_products
ADD COLUMN IF NOT EXISTS collectibles_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS collectibles_subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS gallery_images jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS video_urls jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS external_sku text;

-- 3. Enable RLS and Policies for new tables

ALTER TABLE public.amazon_category_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amazon_brand_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyword_mapping_rules ENABLE ROW LEVEL SECURITY;

-- Admins can do anything on amazon_category_mapping
CREATE POLICY "Admins can select amazon_category_mapping" ON public.amazon_category_mapping FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Admins can insert amazon_category_mapping" ON public.amazon_category_mapping FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Admins can update amazon_category_mapping" ON public.amazon_category_mapping FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Admins can delete amazon_category_mapping" ON public.amazon_category_mapping FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- Admins can do anything on amazon_brand_mapping
CREATE POLICY "Admins can select amazon_brand_mapping" ON public.amazon_brand_mapping FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Admins can insert amazon_brand_mapping" ON public.amazon_brand_mapping FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Admins can update amazon_brand_mapping" ON public.amazon_brand_mapping FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Admins can delete amazon_brand_mapping" ON public.amazon_brand_mapping FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- Admins can do anything on keyword_mapping_rules
CREATE POLICY "Admins can select keyword_mapping_rules" ON public.keyword_mapping_rules FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Admins can insert keyword_mapping_rules" ON public.keyword_mapping_rules FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Admins can update keyword_mapping_rules" ON public.keyword_mapping_rules FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
CREATE POLICY "Admins can delete keyword_mapping_rules" ON public.keyword_mapping_rules FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- Seed basic mappings (optional, to help system start with intelligence)
-- Note: Requires actual category UUIDs, so we do it cautiously if we know names, otherwise we skip.
-- We'll skip hardcoded inserts here since UUIDs vary, we can do it via a function or admin panel.

