-- ==============================================================================
-- MIGRATION: 20261228000000_international_negative_rules_and_precision.sql
-- PURPOSE: Add negative keyword exclusions, precision figure rules, taxonomy safety,
--          and resolution trace capabilities for international category mapping.
-- ==============================================================================

-- 1. Extend keyword_mapping_rules table with rule_type, applies_to, and blocks columns
ALTER TABLE keyword_mapping_rules
ADD COLUMN IF NOT EXISTS rule_type VARCHAR(20) NOT NULL DEFAULT 'include',
ADD COLUMN IF NOT EXISTS applies_to VARCHAR(50) NOT NULL DEFAULT 'title',
ADD COLUMN IF NOT EXISTS blocks VARCHAR(50) NOT NULL DEFAULT 'brand_mapping';

-- 2. Deactivate building kit / building blocks mapping to Model Kits (Taxonomy Gap: Building Sets != Model Kits)
UPDATE keyword_mapping_rules
SET is_active = false
WHERE keyword IN ('building kit', 'building blocks');

-- 3. Insert Negative Exclusion Rules (High Priority = 100) to block false positives on accessories / display stands
INSERT INTO keyword_mapping_rules (keyword, rule_type, applies_to, blocks, priority, is_active)
VALUES
  ('display stand', 'exclude', 'title', 'brand_mapping', 100, true),
  ('figure stand', 'exclude', 'title', 'brand_mapping', 100, true),
  ('display base', 'exclude', 'title', 'brand_mapping', 100, true),
  ('action figure stand', 'exclude', 'title', 'brand_mapping', 100, true),
  ('protective case', 'exclude', 'title', 'brand_mapping', 100, true),
  ('acrylic display', 'exclude', 'title', 'brand_mapping', 100, true),
  ('controller holder', 'exclude', 'title', 'brand_mapping', 100, true),
  ('device stand', 'exclude', 'title', 'brand_mapping', 100, true)
ON CONFLICT DO NOTHING;

-- 4. Insert Safe Positive Figure Keywords for Genuine Articulated & Battle Figures
DO $$
DECLARE
  cat_figuras UUID := 'ddd41421-fb1c-423f-a282-131aba8c4373';
  cat_modelkits UUID := '0ec3e416-9ec7-43d6-8c30-6d361da83644';
BEGIN
  INSERT INTO keyword_mapping_rules (keyword, target_category_id, rule_type, applies_to, blocks, priority, is_active)
  VALUES
    ('battle figure', cat_figuras, 'include', 'title', 'brand_mapping', 10, true),
    ('battle figures', cat_figuras, 'include', 'title', 'brand_mapping', 10, true),
    ('articulated figure', cat_figuras, 'include', 'title', 'brand_mapping', 10, true),
    ('articulated figures', cat_figuras, 'include', 'title', 'brand_mapping', 10, true),
    ('super-articulated', cat_figuras, 'include', 'title', 'brand_mapping', 10, true),
    ('s.h.figuarts', cat_figuras, 'include', 'title', 'brand_mapping', 12, true),
    ('gunpla', cat_modelkits, 'include', 'title', 'brand_mapping', 12, true),
    ('nendoroid', cat_figuras, 'include', 'title', 'brand_mapping', 12, true),
    ('figma', cat_figuras, 'include', 'title', 'brand_mapping', 12, true)
  ON CONFLICT DO NOTHING;
END $$;

-- 5. Update Postgres RPC function recalculate_candidate_category_suggestions
CREATE OR REPLACE FUNCTION recalculate_candidate_category_suggestions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cand RECORD;
  resolved_cat_id UUID;
  resolved_subcat_id UUID;
  resolved_source VARCHAR(50);
  resolved_conf INTEGER;
  updated_count INTEGER := 0;
  
  cat_rule RECORD;
  brand_rule RECORD;
  kw_rule RECORD;
  
  brand_blocked BOOLEAN;
  all_blocked BOOLEAN;
  clean_title TEXT;
  clean_brand TEXT;
BEGIN
  FOR cand IN 
    SELECT 
      id,
      title,
      brand,
      amazon_category,
      amazon_subcategory,
      amazon_category_path,
      raw_data
    FROM international_import_candidates
    WHERE status = 'review'
  LOOP
    resolved_cat_id := NULL;
    resolved_subcat_id := NULL;
    resolved_source := 'unmapped';
    resolved_conf := 0;
    brand_blocked := FALSE;
    all_blocked := FALSE;
    
    clean_title := LOWER(COALESCE(cand.title, ''));
    clean_brand := LOWER(TRIM(COALESCE(cand.brand, '')));
    
    -- STEP 1: Exact Path Category Mapping (90%)
    IF cand.amazon_category_path IS NOT NULL THEN
      SELECT collectibles_category_id, collectibles_subcategory_id, confidence_score
      INTO cat_rule
      FROM amazon_category_mapping
      WHERE is_active = true 
        AND amazon_category_path IS NOT NULL 
        AND LOWER(TRIM(amazon_category_path)) = LOWER(TRIM(cand.amazon_category_path))
      LIMIT 1;

      IF FOUND THEN
        resolved_cat_id := cat_rule.collectibles_category_id;
        resolved_subcat_id := cat_rule.collectibles_subcategory_id;
        resolved_source := 'category_mapping';
        resolved_conf := COALESCE(cat_rule.confidence_score, 90);
      END IF;
    END IF;

    -- STEP 2: Leaf Category Subcategory Mapping (80%)
    IF resolved_cat_id IS NULL AND (cand.amazon_subcategory IS NOT NULL OR cand.amazon_category IS NOT NULL) THEN
      SELECT collectibles_category_id, collectibles_subcategory_id, confidence_score
      INTO cat_rule
      FROM amazon_category_mapping
      WHERE is_active = true
        AND amazon_category_path IS NULL
        AND (
          (cand.amazon_subcategory IS NOT NULL AND LOWER(TRIM(amazon_subcategory)) = LOWER(TRIM(cand.amazon_subcategory)))
          OR
          (cand.amazon_category IS NOT NULL AND LOWER(TRIM(amazon_category)) = LOWER(TRIM(cand.amazon_category)))
        )
      LIMIT 1;

      IF FOUND THEN
        resolved_cat_id := cat_rule.collectibles_category_id;
        resolved_subcat_id := cat_rule.collectibles_subcategory_id;
        resolved_source := 'category_mapping_leaf';
        resolved_conf := COALESCE(cat_rule.confidence_score, 80);
      END IF;
    END IF;

    -- STEP 3: Evaluate Negative / Exclusion Rules (Priority >= 50, rule_type = 'exclude')
    IF resolved_cat_id IS NULL THEN
      FOR kw_rule IN 
        SELECT keyword, blocks
        FROM keyword_mapping_rules
        WHERE is_active = true AND rule_type = 'exclude'
        ORDER BY priority DESC
      LOOP
        IF clean_title LIKE '%' || LOWER(TRIM(kw_rule.keyword)) || '%' THEN
          IF kw_rule.blocks = 'all' THEN
            all_blocked := TRUE;
          ELSE
            brand_blocked := TRUE;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- STEP 4: Safe Standalone Brand Mapping (70%) - Only if NOT brand_blocked and NOT all_blocked
    IF resolved_cat_id IS NULL AND NOT brand_blocked AND NOT all_blocked AND clean_brand <> '' THEN
      SELECT collectibles_category_id, collectibles_subcategory_id, confidence_score
      INTO brand_rule
      FROM amazon_brand_mapping
      WHERE is_active = true 
        AND allow_standalone = true
        AND LOWER(TRIM(brand_name)) = clean_brand
      LIMIT 1;

      IF FOUND THEN
        resolved_cat_id := brand_rule.collectibles_category_id;
        resolved_subcat_id := brand_rule.collectibles_subcategory_id;
        resolved_source := 'brand_mapping';
        resolved_conf := COALESCE(brand_rule.confidence_score, 70);
      END IF;
    END IF;

    -- STEP 5: Positive Keyword Mapping on Title (50%) - Only if NOT all_blocked
    IF resolved_cat_id IS NULL AND NOT all_blocked AND clean_title <> '' THEN
      FOR kw_rule IN 
        SELECT target_category_id, target_subcategory_id, priority
        FROM keyword_mapping_rules
        WHERE is_active = true AND rule_type = 'include' AND target_category_id IS NOT NULL
        ORDER BY priority DESC, LENGTH(keyword) DESC
      LOOP
        SELECT target_category_id, target_subcategory_id
        INTO kw_rule
        FROM keyword_mapping_rules
        WHERE is_active = true 
          AND rule_type = 'include' 
          AND target_category_id IS NOT NULL
          AND clean_title LIKE '%' || LOWER(TRIM(keyword)) || '%'
        ORDER BY priority DESC, LENGTH(keyword) DESC
        LIMIT 1;

        IF FOUND THEN
          resolved_cat_id := kw_rule.target_category_id;
          resolved_subcat_id := kw_rule.target_subcategory_id;
          resolved_source := 'keyword_mapping';
          resolved_conf := 50;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- Update candidate with calculated suggestion
    UPDATE international_import_candidates
    SET 
      suggested_category_id = resolved_cat_id,
      suggested_subcategory_id = resolved_subcat_id,
      category_mapping_source = resolved_source,
      mapping_confidence = resolved_conf,
      updated_at = NOW()
    WHERE id = cand.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;

-- 6. Update get_mapping_rules_stats to support negative exclusion rules
CREATE OR REPLACE FUNCTION get_mapping_rules_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat_rules_json JSONB;
  brand_rules_json JSONB;
  keyword_rules_json JSONB;
  summary_json JSONB;
  
  cat_count INTEGER := 0;
  brand_count INTEGER := 0;
  kw_count INTEGER := 0;
  active_count INTEGER := 0;
  review_req_count INTEGER := 0;
  unmapped_cand_count INTEGER := 0;
BEGIN
  -- Category rules with affected counts
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
  INTO cat_rules_json
  FROM (
    SELECT 
      m.id,
      m.amazon_category,
      m.amazon_subcategory,
      m.amazon_category_path,
      m.collectibles_category_id,
      m.collectibles_subcategory_id,
      m.confidence_score,
      m.is_active,
      m.created_at,
      (
        SELECT COUNT(*) 
        FROM international_import_candidates c 
        WHERE c.status = 'review' 
          AND (
            (m.amazon_category_path IS NOT NULL AND LOWER(TRIM(c.amazon_category_path)) = LOWER(TRIM(m.amazon_category_path)))
            OR
            (m.amazon_category_path IS NULL AND (
              (m.amazon_subcategory IS NOT NULL AND LOWER(TRIM(c.amazon_subcategory)) = LOWER(TRIM(m.amazon_subcategory)))
              OR
              (m.amazon_category IS NOT NULL AND LOWER(TRIM(c.amazon_category)) = LOWER(TRIM(m.amazon_category)))
            ))
          )
      ) AS affected_candidates,
      (
        SELECT COUNT(*) 
        FROM international_products p 
        WHERE (
          (m.amazon_category_path IS NOT NULL AND LOWER(TRIM(p.amazon_category_path)) = LOWER(TRIM(m.amazon_category_path)))
          OR
          (m.amazon_category_path IS NULL AND (
            (m.amazon_subcategory IS NOT NULL AND LOWER(TRIM(p.amazon_subcategory)) = LOWER(TRIM(m.amazon_subcategory)))
            OR
            (m.amazon_category IS NOT NULL AND LOWER(TRIM(p.amazon_category)) = LOWER(TRIM(m.amazon_category)))
          ))
        )
      ) AS affected_products
    FROM amazon_category_mapping m
    ORDER BY m.created_at DESC
  ) r;

  -- Brand rules with affected counts
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
  INTO brand_rules_json
  FROM (
    SELECT 
      b.id,
      b.brand_name,
      b.collectibles_category_id,
      b.collectibles_subcategory_id,
      b.confidence_score,
      b.allow_standalone,
      b.is_active,
      b.created_at,
      (
        SELECT COUNT(*) 
        FROM international_import_candidates c 
        WHERE c.status = 'review' 
          AND LOWER(TRIM(c.brand)) = LOWER(TRIM(b.brand_name))
      ) AS affected_candidates,
      (
        SELECT COUNT(*) 
        FROM international_products p 
        WHERE LOWER(TRIM(p.brand)) = LOWER(TRIM(b.brand_name))
      ) AS affected_products
    FROM amazon_brand_mapping b
    ORDER BY b.created_at DESC
  ) r;

  -- Keyword rules (Include & Exclude) with affected counts
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
  INTO keyword_rules_json
  FROM (
    SELECT 
      k.id,
      k.keyword,
      k.target_category_id,
      k.target_subcategory_id,
      k.priority,
      k.rule_type,
      k.applies_to,
      k.blocks,
      k.is_active,
      k.created_at,
      (
        SELECT COUNT(*) 
        FROM international_import_candidates c 
        WHERE c.status = 'review' 
          AND LOWER(c.title) LIKE '%' || LOWER(TRIM(k.keyword)) || '%'
      ) AS affected_candidates,
      (
        SELECT COUNT(*) 
        FROM international_products p 
        WHERE LOWER(p.title) LIKE '%' || LOWER(TRIM(k.keyword)) || '%'
      ) AS affected_products
    FROM keyword_mapping_rules k
    ORDER BY k.rule_type ASC, k.priority DESC, k.keyword ASC
  ) r;

  -- Summary counts
  SELECT COUNT(*) INTO cat_count FROM amazon_category_mapping;
  SELECT COUNT(*) INTO brand_count FROM amazon_brand_mapping;
  SELECT COUNT(*) INTO kw_count FROM keyword_mapping_rules;
  
  SELECT 
    (SELECT COUNT(*) FROM amazon_category_mapping WHERE is_active = true) +
    (SELECT COUNT(*) FROM amazon_brand_mapping WHERE is_active = true) +
    (SELECT COUNT(*) FROM keyword_mapping_rules WHERE is_active = true)
  INTO active_count;

  SELECT COUNT(*) INTO review_req_count 
  FROM amazon_brand_mapping 
  WHERE allow_standalone = false OR is_active = false;

  SELECT COUNT(*) INTO unmapped_cand_count 
  FROM international_import_candidates 
  WHERE status = 'review' AND (category_mapping_source = 'unmapped' OR suggested_category_id IS NULL);

  summary_json := jsonb_build_object(
    'category_rules_count', cat_count,
    'brand_rules_count', brand_count,
    'keyword_rules_count', kw_count,
    'active_rules_count', active_count,
    'review_required_rules_count', review_req_count,
    'unmapped_candidates_count', unmapped_cand_count
  );

  RETURN jsonb_build_object(
    'categories', cat_rules_json,
    'brands', brand_rules_json,
    'keywords', keyword_rules_json,
    'summary', summary_json
  );
END;
$$;
