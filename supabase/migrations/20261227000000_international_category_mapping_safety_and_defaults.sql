-- Migration: International Category Mapping Safety, Defaults, and Stats RPC
-- Date: 2026-12-27

-- 1. Correct Defaults for international_products
-- Only explicit admin action can produce 'manual' / 100
ALTER TABLE public.international_products
ALTER COLUMN category_mapping_source SET DEFAULT 'unmapped';

ALTER TABLE public.international_products
ALTER COLUMN category_mapping_confidence SET DEFAULT 0;

-- 2. Add is_active flags to mapping tables
ALTER TABLE public.amazon_category_mapping
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.amazon_brand_mapping
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS allow_standalone boolean NOT NULL DEFAULT true;

ALTER TABLE public.keyword_mapping_rules
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 3. Configure Brand Standalone Safety
-- Specialized brands are SAFE for standalone mapping
UPDATE public.amazon_brand_mapping SET allow_standalone = true WHERE brand_name IN ('NECA', 'McFarlane Toys', 'Super7', 'Good Smile Company', 'Kotobukiya', 'Iron Studios', 'Funko');

-- Broad brands require category or keyword context (TOO_BROAD / CONTEXT_REQUIRED)
UPDATE public.amazon_brand_mapping SET allow_standalone = false WHERE brand_name IN ('Hasbro', 'Bandai', 'Bandai Spirits', 'LEGO');

-- 4. Update recalculate_candidate_category_suggestions to respect is_active and allow_standalone
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
            WHERE is_active = true
              AND lower(trim(amazon_category_path)) = lower(trim(v_path))
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
            WHERE is_active = true
              AND lower(trim(amazon_subcategory)) = lower(trim(v_leaf))
            LIMIT 1;

            IF v_cat_id IS NOT NULL THEN
                v_source := 'category_mapping_leaf';
            END IF;
        END IF;

        -- 3. Try Brand Mapping (Confidence 70, only if allow_standalone = true)
        IF v_cat_id IS NULL AND c.brand IS NOT NULL THEN
            SELECT collectibles_category_id, collectibles_subcategory_id, confidence_score
            INTO v_cat_id, v_subcat_id, v_conf
            FROM public.amazon_brand_mapping
            WHERE is_active = true
              AND allow_standalone = true
              AND lower(trim(brand_name)) = lower(trim(c.brand))
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
            WHERE is_active = true
              AND lower(c.title) ILIKE '%' || lower(keyword) || '%'
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

-- 5. RPC Function: get_mapping_rules_stats
-- Returns counts of matching candidates and published products for each rule efficiently
CREATE OR REPLACE FUNCTION public.get_mapping_rules_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_categories jsonb;
    v_brands jsonb;
    v_keywords jsonb;
    v_summary jsonb;
BEGIN
    -- 1. Category rules with affected counts
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', cm.id,
            'amazon_category', cm.amazon_category,
            'amazon_subcategory', cm.amazon_subcategory,
            'amazon_category_path', cm.amazon_category_path,
            'collectibles_category_id', cm.collectibles_category_id,
            'collectibles_subcategory_id', cm.collectibles_subcategory_id,
            'confidence_score', cm.confidence_score,
            'is_active', cm.is_active,
            'affected_candidates', (
                SELECT count(*) FROM public.international_import_candidates iic
                WHERE (
                    (cm.amazon_category_path IS NOT NULL AND (
                        iic.raw_data->'_enriched_details'->'categories' @> to_jsonb(cm.amazon_subcategory) OR
                        iic.raw_data->'categories' @> to_jsonb(cm.amazon_subcategory) OR
                        (iic.raw_data->'_enriched_details'->'categories'->>-1) = cm.amazon_subcategory OR
                        (iic.raw_data->'categories'->>-1) = cm.amazon_subcategory
                    ))
                    OR
                    (cm.amazon_category_path IS NULL AND (
                        (iic.raw_data->'_enriched_details'->'categories'->>-1) = cm.amazon_subcategory OR
                        (iic.raw_data->'categories'->>-1) = cm.amazon_subcategory
                    ))
                )
            ),
            'affected_products', (
                SELECT count(*) FROM public.international_products ip
                WHERE (
                    (cm.amazon_category_path IS NOT NULL AND lower(trim(ip.amazon_category_path)) = lower(trim(cm.amazon_category_path))) OR
                    (lower(trim(ip.amazon_subcategory)) = lower(trim(cm.amazon_subcategory)))
                )
            )
        )
    ) INTO v_categories
    FROM public.amazon_category_mapping cm;

    -- 2. Brand rules with affected counts
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', bm.id,
            'brand_name', bm.brand_name,
            'collectibles_category_id', bm.collectibles_category_id,
            'collectibles_subcategory_id', bm.collectibles_subcategory_id,
            'confidence_score', bm.confidence_score,
            'is_active', bm.is_active,
            'allow_standalone', bm.allow_standalone,
            'affected_candidates', (
                SELECT count(*) FROM public.international_import_candidates iic
                WHERE lower(trim(iic.brand)) = lower(trim(bm.brand_name))
            ),
            'affected_products', (
                SELECT count(*) FROM public.international_products ip
                WHERE lower(trim(ip.brand)) = lower(trim(bm.brand_name))
            )
        )
    ) INTO v_brands
    FROM public.amazon_brand_mapping bm;

    -- 3. Keyword rules with affected counts
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', kr.id,
            'keyword', kr.keyword,
            'target_category_id', kr.target_category_id,
            'target_subcategory_id', kr.target_subcategory_id,
            'priority', kr.priority,
            'is_active', kr.is_active,
            'affected_candidates', (
                SELECT count(*) FROM public.international_import_candidates iic
                WHERE lower(iic.title) ILIKE '%' || lower(kr.keyword) || '%'
            ),
            'affected_products', (
                SELECT count(*) FROM public.international_products ip
                WHERE lower(ip.title) ILIKE '%' || lower(kr.keyword) || '%'
            )
        )
    ) INTO v_keywords
    FROM public.keyword_mapping_rules kr;

    -- 4. Summary counts
    SELECT jsonb_build_object(
        'category_rules_count', (SELECT count(*) FROM public.amazon_category_mapping),
        'brand_rules_count', (SELECT count(*) FROM public.amazon_brand_mapping),
        'keyword_rules_count', (SELECT count(*) FROM public.keyword_mapping_rules),
        'active_rules_count', (
            (SELECT count(*) FROM public.amazon_category_mapping WHERE is_active = true) +
            (SELECT count(*) FROM public.amazon_brand_mapping WHERE is_active = true) +
            (SELECT count(*) FROM public.keyword_mapping_rules WHERE is_active = true)
        ),
        'review_required_rules_count', (
            (SELECT count(*) FROM public.amazon_brand_mapping WHERE allow_standalone = false) +
            (SELECT count(*) FROM public.keyword_mapping_rules WHERE priority < 10)
        ),
        'unmapped_candidates_count', (
            SELECT count(*) FROM public.international_import_candidates
            WHERE status = 'review' AND (suggested_category_id IS NULL OR category_mapping_source = 'unmapped')
        )
    ) INTO v_summary;

    RETURN jsonb_build_object(
        'categories', COALESCE(v_categories, '[]'::jsonb),
        'brands', COALESCE(v_brands, '[]'::jsonb),
        'keywords', COALESCE(v_keywords, '[]'::jsonb),
        'summary', v_summary
    );
END;
$$;
