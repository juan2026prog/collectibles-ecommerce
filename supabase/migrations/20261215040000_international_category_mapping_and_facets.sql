-- Migration: International Category Mapping, Storefront Category Facets, and Safe Backfill
-- Date: 2026-12-15

-- 1. Schema Extensions
ALTER TABLE public.international_products
ADD COLUMN IF NOT EXISTS category_mapping_source text DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS category_mapping_confidence int DEFAULT 100;

ALTER TABLE public.international_import_candidates
ADD COLUMN IF NOT EXISTS category_mapping_source text DEFAULT 'unmapped';

ALTER TABLE public.amazon_category_mapping
ADD COLUMN IF NOT EXISTS amazon_category_path text;

CREATE INDEX IF NOT EXISTS idx_amazon_cat_mapping_path ON public.amazon_category_mapping(amazon_category_path);
CREATE INDEX IF NOT EXISTS idx_amazon_cat_mapping_subcat ON public.amazon_category_mapping(amazon_subcategory);
CREATE INDEX IF NOT EXISTS idx_intl_products_cat_id ON public.international_products(collectibles_category_id);
CREATE INDEX IF NOT EXISTS idx_intl_products_subcat_id ON public.international_products(collectibles_subcategory_id);

-- 2. Populate Initial Mappings in amazon_category_mapping
-- Priority / Confidence: Exact Path = 90, Subcategory Leaf = 80

INSERT INTO public.amazon_category_mapping (
    amazon_category,
    amazon_subcategory,
    amazon_category_path,
    collectibles_category_id,
    collectibles_subcategory_id,
    confidence_score
) VALUES
-- Figuras de Acción
('Toys & Games', 'Action Figures', 'Toys & Games > Toy Figures & Playsets > Action Figures', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 90),
('Toys & Games', 'Fantastic Creatures', 'Toys & Games > Toy Figures & Playsets > Fantastic Creatures', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 90),
('Toys & Games', 'Action & Toy Figures', 'Toys & Games > Action & Toy Figures', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 90),
('Toys & Games', 'Playsets', 'Toys & Games > Toy Figures & Playsets > Playsets', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 85),

-- Esculturas y Estatuas
('Toys & Games', 'Statues & Busts', 'Toys & Games > Collectible Toys > Statues & Busts', '0f5f33ba-8326-48bd-b61d-ec2a484bd5d4', NULL, 90),
('Toys & Games', 'Statues', 'Toys & Games > Collectible Toys > Statues', '0f5f33ba-8326-48bd-b61d-ec2a484bd5d4', NULL, 90),
('Toys & Games', 'Busts', 'Toys & Games > Collectible Toys > Busts', '0f5f33ba-8326-48bd-b61d-ec2a484bd5d4', NULL, 90),

-- Funko POP
('Toys & Games', 'Bobbleheads', 'Toys & Games > Collectible Toys > Bobbleheads', '94c47727-f07d-4c80-b74d-eb8344c8ddeb', NULL, 85),
('Toys & Games', 'Chibi Figures', 'Toys & Games > Collectible Toys > Chibi Figures', '94c47727-f07d-4c80-b74d-eb8344c8ddeb', NULL, 85),

-- TCG & Boardgames
('Toys & Games', 'Card Games', 'Toys & Games > Games & Accessories > Card Games', '6e659b91-5130-4f20-9ddb-609410b9f84c', 'e0e632d0-309e-4d2d-b0f6-fd76b2dada86', 90),
('Toys & Games', 'Collectible Card Games', 'Toys & Games > Games & Accessories > Collectible Card Games', '6e659b91-5130-4f20-9ddb-609410b9f84c', 'e0e632d0-309e-4d2d-b0f6-fd76b2dada86', 90),
('Toys & Games', 'Board Games', 'Toys & Games > Games & Accessories > Board Games', '6e659b91-5130-4f20-9ddb-609410b9f84c', '832ca0b5-2ebf-4afe-928c-fa87c0382b4b', 90),

-- Peluches
('Toys & Games', 'Stuffed Animals & Plush Toys', 'Toys & Games > Stuffed Animals & Plush Toys', 'b1cdd325-1be1-47f8-a8af-bcb58fa9b403', NULL, 90),
('Toys & Games', 'Plush Figures', 'Toys & Games > Stuffed Animals & Plush Toys > Plush Figures', 'b1cdd325-1be1-47f8-a8af-bcb58fa9b403', NULL, 90),

-- Model Kits / Building Toys
('Toys & Games', 'Toy Building Sets', 'Toys & Games > Building Toys > Toy Building Sets', '0ec3e416-9ec7-43d6-8c30-6d361da83644', NULL, 85),
('Toys & Games', 'Model Kits', 'Toys & Games > Hobbies > Models & Model Kits > Model Kits', '0ec3e416-9ec7-43d6-8c30-6d361da83644', NULL, 90),

-- Vehículos a Escala
('Toys & Games', 'Die-Cast Vehicles', 'Toys & Games > Play Vehicles > Die-Cast Vehicles', 'c1a368f5-0dea-49dc-95a0-6347cfbd7fd1', NULL, 90),
('Toys & Games', 'Toy Vehicles', 'Toys & Games > Play Vehicles > Toy Vehicles', 'c1a368f5-0dea-49dc-95a0-6347cfbd7fd1', NULL, 85)
ON CONFLICT (amazon_category, amazon_subcategory) 
DO UPDATE SET 
    amazon_category_path = EXCLUDED.amazon_category_path,
    collectibles_category_id = EXCLUDED.collectibles_category_id,
    collectibles_subcategory_id = EXCLUDED.collectibles_subcategory_id,
    confidence_score = EXCLUDED.confidence_score;

-- 3. Populate Initial Brand Mappings (Secondary signal, confidence = 70)
INSERT INTO public.amazon_brand_mapping (
    brand_name,
    collectibles_category_id,
    collectibles_subcategory_id,
    confidence_score
) VALUES
('NECA', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 70),
('McFarlane Toys', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 70),
('Hasbro', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 70),
('Bandai', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 70),
('Bandai Spirits', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 70),
('Super7', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 70),
('Good Smile Company', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 70),
('Kotobukiya', '0f5f33ba-8326-48bd-b61d-ec2a484bd5d4', NULL, 70),
('Iron Studios', '0f5f33ba-8326-48bd-b61d-ec2a484bd5d4', NULL, 70),
('Funko', '94c47727-f07d-4c80-b74d-eb8344c8ddeb', NULL, 70),
('LEGO', '0ec3e416-9ec7-43d6-8c30-6d361da83644', NULL, 70)
ON CONFLICT (brand_name)
DO UPDATE SET
    collectibles_category_id = EXCLUDED.collectibles_category_id,
    collectibles_subcategory_id = EXCLUDED.collectibles_subcategory_id,
    confidence_score = EXCLUDED.confidence_score;

-- 4. Populate Keyword Mapping Rules (Tertiary signal, confidence = 50)
INSERT INTO public.keyword_mapping_rules (
    keyword,
    target_category_id,
    target_subcategory_id,
    priority
) VALUES
('action figure', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 10),
('7 inch figure', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 10),
('scale action figure', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 10),
('marvel legends', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 12),
('star wars black series', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 12),
('dc multiverse', 'ddd41421-fb1c-423f-a282-131aba8c4373', NULL, 12),
('funko pop', '94c47727-f07d-4c80-b74d-eb8344c8ddeb', NULL, 15),
('statue', '0f5f33ba-8326-48bd-b61d-ec2a484bd5d4', NULL, 8),
('bust', '0f5f33ba-8326-48bd-b61d-ec2a484bd5d4', NULL, 8),
('plush', 'b1cdd325-1be1-47f8-a8af-bcb58fa9b403', NULL, 10),
('peluche', 'b1cdd325-1be1-47f8-a8af-bcb58fa9b403', NULL, 10),
('trading card', '6e659b91-5130-4f20-9ddb-609410b9f84c', 'e0e632d0-309e-4d2d-b0f6-fd76b2dada86', 10),
('booster pack', '6e659b91-5130-4f20-9ddb-609410b9f84c', 'e0e632d0-309e-4d2d-b0f6-fd76b2dada86', 10),
('board game', '6e659b91-5130-4f20-9ddb-609410b9f84c', '832ca0b5-2ebf-4afe-928c-fa87c0382b4b', 10),
('building kit', '0ec3e416-9ec7-43d6-8c30-6d361da83644', NULL, 5),
('building blocks', '0ec3e416-9ec7-43d6-8c30-6d361da83644', NULL, 5)
ON CONFLICT (keyword)
DO UPDATE SET
    target_category_id = EXCLUDED.target_category_id,
    target_subcategory_id = EXCLUDED.target_subcategory_id,
    priority = EXCLUDED.priority;

-- 5. RPC Function: get_international_category_facets
-- Accurately counts categories and subcategories for published international products without polluting local counts
CREATE OR REPLACE FUNCTION public.get_international_category_facets(
    p_brand_slug text DEFAULT NULL,
    p_search_query text DEFAULT NULL,
    p_min_price numeric DEFAULT NULL,
    p_max_price numeric DEFAULT NULL
)
RETURNS TABLE (
    category_id uuid,
    parent_id uuid,
    name text,
    slug text,
    sort_order int,
    product_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH matching_products AS (
        SELECT ip.id, ip.collectibles_category_id, ip.collectibles_subcategory_id
        FROM public.international_products ip
        LEFT JOIN public.brands b ON lower(ip.brand) = lower(b.name)
        WHERE ip.status = 'published'
          AND (p_brand_slug IS NULL OR p_brand_slug = '' OR b.slug = p_brand_slug OR lower(ip.brand) = lower(p_brand_slug))
          AND (p_search_query IS NULL OR p_search_query = '' OR ip.title ILIKE '%' || p_search_query || '%' OR ip.description ILIKE '%' || p_search_query || '%' OR ip.brand ILIKE '%' || p_search_query || '%')
          AND (p_min_price IS NULL OR ip.final_price_usd >= p_min_price)
          AND (p_max_price IS NULL OR ip.final_price_usd <= p_max_price)
    ),
    parent_counts AS (
        SELECT c.id, c.parent_id, c.name, c.slug, c.sort_order, COUNT(DISTINCT mp.id) as count
        FROM public.categories c
        JOIN matching_products mp ON (mp.collectibles_category_id = c.id OR mp.collectibles_subcategory_id = c.id)
        WHERE c.is_active = true
        GROUP BY c.id, c.parent_id, c.name, c.slug, c.sort_order
    )
    SELECT 
        pc.id as category_id,
        pc.parent_id,
        pc.name,
        pc.slug,
        pc.sort_order,
        pc.count as product_count
    FROM parent_counts pc
    ORDER BY pc.sort_order ASC, pc.name ASC;
END;
$$;

-- 6. Safe Backfill of Existing Published Products
-- Preserves existing collectibles_category_id and sets source to 'manual' (score = 100)
-- Extracts amazon_category, amazon_subcategory and amazon_category_path from raw_data if available
UPDATE public.international_products
SET 
    amazon_category = COALESCE(amazon_category, raw_data->'categories'->>0),
    amazon_subcategory = COALESCE(amazon_subcategory, raw_data->'categories'->>-1),
    amazon_category_path = COALESCE(
        amazon_category_path, 
        CASE 
            WHEN jsonb_typeof(raw_data->'categories') = 'array' 
            THEN (
                SELECT string_agg(elems.value, ' > ') 
                FROM jsonb_array_elements_text(raw_data->'categories') AS elems(value)
            )
            ELSE NULL 
        END
    ),
    category_mapping_source = 'manual',
    category_mapping_confidence = 100
WHERE collectibles_category_id IS NOT NULL;

-- 7. SQL Function to recalculate suggestions for candidate items
CREATE OR REPLACE FUNCTION public.recalculate_candidate_category_suggestions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count int := 0;
    c RECORD;
    v_cat_id uuid;
    v_subcat_id uuid;
    v_conf int;
    v_source text;
    v_raw_categories jsonb;
    v_path text;
    v_leaf text;
BEGIN
    FOR c IN (SELECT id, title, brand, raw_data FROM public.international_import_candidates WHERE status = 'review') LOOP
        v_cat_id := NULL;
        v_subcat_id := NULL;
        v_conf := 0;
        v_source := 'unmapped';
        v_path := NULL;
        v_leaf := NULL;

        v_raw_categories := c.raw_data->'_enriched_details'->'categories';
        IF v_raw_categories IS NULL OR jsonb_array_length(v_raw_categories) = 0 THEN
            v_raw_categories := c.raw_data->'categories';
        END IF;

        IF v_raw_categories IS NOT NULL AND jsonb_typeof(v_raw_categories) = 'array' AND jsonb_array_length(v_raw_categories) > 0 THEN
            SELECT string_agg(elems.value, ' > ') INTO v_path
            FROM jsonb_array_elements_text(v_raw_categories) AS elems(value);
            v_leaf := v_raw_categories->>-1;
        END IF;

        -- 1. Try Exact Path Mapping (Confidence 90)
        IF v_path IS NOT NULL THEN
            SELECT collectibles_category_id, collectibles_subcategory_id, confidence_score
            INTO v_cat_id, v_subcat_id, v_conf
            FROM public.amazon_category_mapping
            WHERE lower(trim(amazon_category_path)) = lower(trim(v_path))
            LIMIT 1;

            IF v_cat_id IS NOT NULL THEN
                v_source := 'category_mapping';
            END IF;
        END IF;

        -- 2. Try Leaf Category Mapping (Confidence 80)
        IF v_cat_id IS NULL AND v_leaf IS NOT NULL THEN
            SELECT collectibles_category_id, collectibles_subcategory_id, confidence_score
            INTO v_cat_id, v_subcat_id, v_conf
            FROM public.amazon_category_mapping
            WHERE lower(trim(amazon_subcategory)) = lower(trim(v_leaf))
            LIMIT 1;

            IF v_cat_id IS NOT NULL THEN
                v_source := 'category_mapping_leaf';
            END IF;
        END IF;

        -- 3. Try Brand Mapping (Confidence 70)
        IF v_cat_id IS NULL AND c.brand IS NOT NULL THEN
            SELECT collectibles_category_id, collectibles_subcategory_id, confidence_score
            INTO v_cat_id, v_subcat_id, v_conf
            FROM public.amazon_brand_mapping
            WHERE lower(trim(brand_name)) = lower(trim(c.brand))
            LIMIT 1;

            IF v_cat_id IS NOT NULL THEN
                v_source := 'brand_mapping';
            END IF;
        END IF;

        -- 4. Try Keyword Mapping (Confidence 50)
        IF v_cat_id IS NULL AND c.title IS NOT NULL THEN
            SELECT target_category_id, target_subcategory_id, 50
            INTO v_cat_id, v_subcat_id, v_conf
            FROM public.keyword_mapping_rules
            WHERE lower(c.title) ILIKE '%' || lower(keyword) || '%'
            ORDER BY priority DESC, length(keyword) DESC
            LIMIT 1;

            IF v_cat_id IS NOT NULL THEN
                v_source := 'keyword_mapping';
            END IF;
        END IF;

        -- Update candidate
        UPDATE public.international_import_candidates
        SET 
            suggested_category_id = v_cat_id,
            suggested_subcategory_id = v_subcat_id,
            mapping_confidence = v_conf,
            category_mapping_source = v_source
        WHERE id = c.id;

        IF v_cat_id IS NOT NULL THEN
            v_updated_count := v_updated_count + 1;
        END IF;
    END LOOP;

    RETURN v_updated_count;
END;
$$;
