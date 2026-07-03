-- Migration: Funko Pop Cleanup and Guardrail Fix
-- Date: 2026-07-03

-- 1. Insert new ML category mappings to resolve mismatched categories
INSERT INTO public.ml_category_mapping (ml_category_id, ml_category_name, internal_category_id)
SELECT 'MLU1166', 'Peluches ML', 'b1cdd325-1be1-47f8-a8af-bcb58fa9b403'
WHERE NOT EXISTS (SELECT 1 FROM public.ml_category_mapping WHERE ml_category_id = 'MLU1166' AND vendor_id IS NULL);

INSERT INTO public.ml_category_mapping (ml_category_id, ml_category_name, internal_category_id)
SELECT 'MLU110909', 'Muñecas ML', '9a089aa7-3a0c-4f23-8bbb-e7a6bbb52773'
WHERE NOT EXISTS (SELECT 1 FROM public.ml_category_mapping WHERE ml_category_id = 'MLU110909' AND vendor_id IS NULL);

INSERT INTO public.ml_category_mapping (ml_category_id, ml_category_name, internal_category_id)
SELECT 'MLU161175', 'Disfraces y Accesorios ML', '5d4bbaf6-8e04-42ad-a4ed-3364e47d117c'
WHERE NOT EXISTS (SELECT 1 FROM public.ml_category_mapping WHERE ml_category_id = 'MLU161175' AND vendor_id IS NULL);

INSERT INTO public.ml_category_mapping (ml_category_id, ml_category_name, internal_category_id)
SELECT 'MLU110853', 'Vehículos de Juguete ML', 'c1a368f5-0dea-49dc-95a0-6347cfbd7fd1'
WHERE NOT EXISTS (SELECT 1 FROM public.ml_category_mapping WHERE ml_category_id = 'MLU110853' AND vendor_id IS NULL);

INSERT INTO public.ml_category_mapping (ml_category_id, ml_category_name, internal_category_id)
SELECT 'MLU455430', 'Muñecos y Sets ML', 'ddd41421-fb1c-423f-a282-131aba8c4373'
WHERE NOT EXISTS (SELECT 1 FROM public.ml_category_mapping WHERE ml_category_id = 'MLU455430' AND vendor_id IS NULL);

-- 2. Update evaluate_product_rules to close the guardrail gap for the parent category ID
CREATE OR REPLACE FUNCTION public.evaluate_product_rules(
  p_title text,
  p_ml_category_id text,
  p_brand_name text,
  p_vendor_id uuid
)
RETURNS TABLE(
  rule_id uuid,
  suggested_id uuid,
  action_type text,
  confidence integer,
  rule_description text,
  has_conflict boolean,
  conflict_details text
) AS $$
DECLARE
  v_rule RECORD;
  v_matched boolean;
  v_max_priority integer := -1;
  v_prim_rule_id uuid := NULL;
  v_prim_suggested_id uuid := NULL;
  v_prim_action_type text := NULL;
  v_prim_desc text := NULL;
  v_has_conflict boolean := false;
  v_conflict_details text := '';
  v_parent_id uuid := NULL;
  v_is_funko boolean := false;
  v_is_dc_related boolean := false;
  v_cat_name text;
BEGIN
  FOR v_rule IN 
    SELECT * 
    FROM public.taxonomy_rules 
    WHERE is_active = true 
    ORDER BY priority DESC, created_at DESC
  LOOP
    IF v_rule.scope = 'vendor' AND v_rule.scope_target_id <> p_vendor_id::text THEN
      CONTINUE;
    END IF;

    v_matched := evaluate_rule_conditions(p_title, p_ml_category_id, p_brand_name, p_vendor_id, to_jsonb(v_rule));

    IF v_matched THEN
      -- Enforce Funko POP subcategory guardrails (Fase 4 & 5)
      IF v_rule.action_type = 'set_category' THEN
        SELECT parent_id, name INTO v_parent_id, v_cat_name 
        FROM public.categories 
        WHERE id = v_rule.action_target_id;
        
        -- Guardrail: Matches either the parent Funko POP category itself OR any of its subcategories
        IF v_rule.action_target_id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb' OR v_parent_id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb' THEN
          v_is_funko := (
            lower(COALESCE(p_brand_name, '')) = 'funko' OR
            lower(p_title) LIKE '%funko%' OR
            lower(p_title) LIKE '%pop!%' OR
            lower(p_title) LIKE '%pop %' OR
            lower(p_title) LIKE '% pop%'
          );
          
          -- Check if related to DC (Fase 5)
          v_is_dc_related := (
            lower(p_title) LIKE '%dc comics%' OR
            lower(p_title) LIKE '%batman%' OR
            lower(p_title) LIKE '%superman%' OR
            lower(p_title) LIKE '%wonder woman%' OR
            lower(p_title) LIKE '%joker%' OR
            lower(p_title) LIKE '%harley quinn%' OR
            lower(p_title) LIKE '%flash%' OR
            lower(p_title) LIKE '%aquaman%' OR
            lower(p_title) LIKE '%justice league%'
          );
          
          IF NOT v_is_funko THEN
            v_has_conflict := true;
            IF v_is_dc_related THEN
              v_conflict_details := 'Producto relacionado con DC, pero no es Funko Pop.';
            ELSE
              v_conflict_details := 'Producto no es Funko Pop, pero la regla sugiere una subcategoría Funko.';
            END IF;
            
            rule_id := v_rule.id;
            suggested_id := NULL; -- Block automatic assignment
            action_type := v_rule.action_type;
            confidence := 30; -- Low confidence
            rule_description := concat(upper(v_rule.rule_type), ' Rule (Conflict)');
            has_conflict := true;
            conflict_details := v_conflict_details;
            RETURN NEXT;
            RETURN;
          END IF;
        END IF;
      END IF;

      IF v_max_priority = -1 THEN
        v_max_priority := v_rule.priority;
        v_prim_rule_id := v_rule.id;
        v_prim_suggested_id := v_rule.action_target_id;
        v_prim_action_type := v_rule.action_type;
        v_prim_desc := concat(upper(v_rule.rule_type), ' Rule (Priority ', v_rule.priority, ')');
      ELSIF v_rule.priority = v_max_priority THEN
        IF v_rule.action_target_id <> v_prim_suggested_id THEN
          v_has_conflict := true;
          v_conflict_details := concat(v_conflict_details, '; Conflict with ', upper(v_rule.rule_type), ' Rule (Priority ', v_rule.priority, ')');
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_prim_rule_id IS NOT NULL THEN
    rule_id := v_prim_rule_id;
    suggested_id := v_prim_suggested_id;
    action_type := v_prim_action_type;
    confidence := v_max_priority;
    rule_description := v_prim_desc;
    has_conflict := v_has_conflict;
    conflict_details := trim(leading '; ' from v_conflict_details);
    RETURN NEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Execute transactional reclassification DO block
DO $$
DECLARE
  v_rec RECORD;
  v_resolved_cat_id UUID;
  v_history_cat_id UUID;
  v_history_cat_raw TEXT;
  v_reclassified_count INTEGER := 0;
  v_prod_ids UUID[] := ARRAY[]::UUID[];
  v_prev_vals JSONB := '[]'::JSONB;
BEGIN
  -- Disable learning during this update
  PERFORM set_config('app.disable_funko_learning', 'true', true);

  -- For each mismatched product in Funko POP or its subcategories
  FOR v_rec IN 
    SELECT p.id, p.title, p.brand_id, b.name as brand_name, p.ml_category_id, p.category_id as current_cat_id, p.metadata
    FROM public.products p
    LEFT JOIN public.brands b ON p.brand_id = b.id
    WHERE p.category_id IN (
      SELECT id FROM public.categories 
      WHERE id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb' OR parent_id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb'
    )
    AND NOT (
      COALESCE(p.brand_id = '1cbd2abc-1508-40c4-8823-9806998979e3', false) OR
      lower(p.title) LIKE '%funko%' OR
      lower(p.title) LIKE '%pop!%' OR
      lower(p.title) LIKE '%pop %' OR
      lower(p.title) LIKE '% pop%'
    )
  LOOP
    v_resolved_cat_id := NULL;
    v_history_cat_raw := NULL;

    -- Nivel 1: Taxonomy History
    SELECT 
      CASE 
        WHEN jsonb_typeof(th.previous_values) = 'array' THEN (
          SELECT elem->>'value' 
          FROM jsonb_array_elements(th.previous_values) elem 
          WHERE elem->>'id' = v_rec.id::text AND elem->>'field' = 'category_id'
          LIMIT 1
        )
        WHEN jsonb_typeof(th.previous_values) = 'object' THEN (
          th.previous_values->>'category_id'
        )
      END INTO v_history_cat_raw
    FROM public.taxonomy_history th
    WHERE th.products_affected @> jsonb_build_array(v_rec.id::text)
    ORDER BY th.applied_at DESC
    LIMIT 1;

    -- Resolve raw history cat id
    IF v_history_cat_raw IS NOT NULL AND v_history_cat_raw <> 'null' AND v_history_cat_raw <> '94c47727-f07d-4c80-b74d-eb8344c8ddeb' THEN
      SELECT c.id INTO v_history_cat_id FROM public.categories c 
      WHERE c.id::text = v_history_cat_raw 
        AND c.id <> '94c47727-f07d-4c80-b74d-eb8344c8ddeb' 
        AND COALESCE(c.parent_id <> '94c47727-f07d-4c80-b74d-eb8344c8ddeb', true);
        
      IF v_history_cat_id IS NOT NULL THEN
        v_resolved_cat_id := v_history_cat_id;
      ELSE
        -- Look up mapped ML Category ID from history
        SELECT map.internal_category_id INTO v_resolved_cat_id 
        FROM public.ml_category_mapping map 
        WHERE map.ml_category_id = v_history_cat_raw;
      END IF;
    END IF;

    -- Nivel 2: Mapped ML Category ID from current product
    IF v_resolved_cat_id IS NULL AND v_rec.ml_category_id IS NOT NULL THEN
      SELECT map.internal_category_id INTO v_resolved_cat_id 
      FROM public.ml_category_mapping map 
      WHERE map.ml_category_id = v_rec.ml_category_id;
    END IF;

    -- Nivel 3: Fallback Logic
    IF v_resolved_cat_id IS NULL THEN
      IF lower(v_rec.title) LIKE '%peluche%' OR lower(v_rec.title) LIKE '%plush%' THEN
        v_resolved_cat_id := 'b1cdd325-1be1-47f8-a8af-bcb58fa9b403'; -- Peluches
      ELSIF lower(v_rec.title) LIKE '%muñeca%' OR lower(v_rec.title) LIKE '%doll%' OR lower(v_rec.title) LIKE '%princesas disney%' THEN
        v_resolved_cat_id := '9a089aa7-3a0c-4f23-8bbb-e7a6bbb52773'; -- Muñecas
      ELSIF v_rec.brand_name IN ('Hasbro', 'NECA', 'Bandai', 'Mattel', 'Jakks Pacific', 'DC Collectibles', 'Mcfarlane', 'Iron Studios', 'Super7', 'Hot Toys', 'Storm Collectibles', 'Mezco Toyz', 'Mafex', 'Medicom Toy') THEN
        v_resolved_cat_id := 'ddd41421-fb1c-423f-a282-131aba8c4373'; -- Figuras de Acción
      ELSE
        v_resolved_cat_id := 'f3436353-9149-435b-b18f-95f24c9e853e'; -- Juegos y Juguetes
      END IF;
    END IF;

    -- Update product category
    IF v_resolved_cat_id IS NOT NULL THEN
      -- Record previous value
      v_prod_ids := array_append(v_prod_ids, v_rec.id);
      v_prev_vals := v_prev_vals || jsonb_build_object(
        'id', v_rec.id,
        'field', 'category_id',
        'value', v_rec.current_cat_id::text
      );

      -- Add review flag if default fallback was used
      IF v_resolved_cat_id = 'f3436353-9149-435b-b18f-95f24c9e853e' THEN
        UPDATE public.products 
        SET category_id = v_resolved_cat_id, 
            metadata = COALESCE(v_rec.metadata, '{}'::jsonb) || '{"needs_manual_category_review": true}'::jsonb
        WHERE id = v_rec.id;
      ELSE
        UPDATE public.products SET category_id = v_resolved_cat_id WHERE id = v_rec.id;
      END IF;

      -- Sync duplicate database items
      PERFORM public.recalculate_product_duplicates(v_rec.id);
      
      v_reclassified_count := v_reclassified_count + 1;
    END IF;
  END LOOP;

  -- Insert taxonomy history record if any products updated
  IF v_reclassified_count > 0 THEN
    INSERT INTO public.taxonomy_history (
      rule_id,
      applied_by,
      products_affected,
      previous_values,
      new_value,
      notes
    ) VALUES (
      NULL,
      NULL,
      to_jsonb(v_prod_ids),
      v_prev_vals,
      'Resolved Categories',
      concat('Reclassified ', v_reclassified_count, ' mismatched non-Funko products out of Funko POP tree.')
    );
  END IF;

  RAISE NOTICE 'Total reclassified mismatched products: %', v_reclassified_count;
END $$;
