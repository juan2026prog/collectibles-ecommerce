-- Migration for V2 Amazon Importer Enhancements (Media & Categories)

-- 1. Enhance international_import_candidates
ALTER TABLE public.international_import_candidates
ADD COLUMN IF NOT EXISTS main_image_url_external text,
ADD COLUMN IF NOT EXISTS image_urls_external jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS video_urls_external jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS amazon_category text,
ADD COLUMN IF NOT EXISTS amazon_subcategory text,
ADD COLUMN IF NOT EXISTS amazon_category_path text;

-- 2. Enhance international_products
ALTER TABLE public.international_products
ADD COLUMN IF NOT EXISTS main_image_url_external text,
ADD COLUMN IF NOT EXISTS image_urls_external jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS video_urls_external jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS amazon_category text,
ADD COLUMN IF NOT EXISTS amazon_subcategory text,
ADD COLUMN IF NOT EXISTS amazon_category_path text;

-- 3. Optional Indexes for performance on Amazon categorization mapping queries
CREATE INDEX IF NOT EXISTS idx_international_import_candidates_amazon_category ON public.international_import_candidates(amazon_category);
CREATE INDEX IF NOT EXISTS idx_international_products_amazon_category ON public.international_products(amazon_category);
