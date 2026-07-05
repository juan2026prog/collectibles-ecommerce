-- Migration: Funko Pop Guardrails and Learning Fix V2
-- Date: 2026-07-02

-- 1. Revert evaluate_rule_conditions to original logic (no inline Funko guardrail)
CREATE OR REPLACE FUNCTION public.evaluate_rule_conditions(
  p_title text,
  p_ml_category_id text,
  p_brand_name text,
  p_vendor_id uuid,
  p_rule jsonb
)
RETURNS boolean AS $$
DECLARE
  v_conds jsonb := p_rule->'conditions';
  v_op text := COALESCE(p_rule->>'logical_operator', 'AND');
  v_cond jsonb;
BEGIN
  IF v_conds IS NULL OR jsonb_array_length(v_conds) = 0 THEN
    RETURN (
      (p_rule->>'condition_field' = 'ml_category_id' AND (
         normalize_ml_category(p_ml_category_id) = normalize_ml_category(p_rule->>'condition_value') OR 
         lower(p_ml_category_id) = lower(p_rule->>'condition_value')
       )) OR
       (p_rule->>'condition_field' = 'brand_name' AND lower(p_brand_name) = lower(p_rule->>'condition_value')) OR
       (p_rule->>'condition_field' = 'title' AND lower(p_title) LIKE concat('%', lower(p_rule->>'condition_value'), '%'))
    );
  END IF;

  IF v_op = 'AND' THEN
    FOR v_cond IN SELECT * FROM jsonb_array_elements(v_conds) LOOP
      IF NOT evaluate_single_condition(p_title, p_ml_category_id, p_brand_name, p_vendor_id, v_cond) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  ELSIF v_op = 'OR' THEN
    FOR v_cond IN SELECT * FROM jsonb_array_elements(v_conds) LOOP
      IF evaluate_single_condition(p_title, p_ml_category_id, p_brand_name, p_vendor_id, v_cond) THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  ELSIF v_op = 'NOT' THEN
    FOR v_cond IN SELECT * FROM jsonb_array_elements(v_conds) LOOP
      IF evaluate_single_condition(p_title, p_ml_category_id, p_brand_name, p_vendor_id, v_cond) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Update evaluate_product_rules to perform the Funko guardrail check and flag conflicts
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
        
        IF v_parent_id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb' THEN
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

-- 3. Replace apply_rule_to_existing to evaluate product rules and skip conflicts
CREATE OR REPLACE FUNCTION public.apply_rule_to_existing(p_rule_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_rule RECORD;
  v_prod_ids uuid[] := ARRAY[]::uuid[];
  v_raw_ids uuid[] := ARRAY[]::uuid[];
  v_prev_vals jsonb := '[]'::jsonb;
  v_prod_count integer := 0;
  v_raw_count integer := 0;
  v_curated_count integer := 0;
  v_rec RECORD;
  v_new_prod_id uuid;
  v_target_label text;
  v_rule_match RECORD;
BEGIN
  -- Get the rule details
  SELECT * INTO v_rule FROM public.taxonomy_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Regla no encontrada');
  END IF;

  -- Disable learning during automatic rule applications
  PERFORM set_config('app.disable_funko_learning', 'true', true);

  -- 1. Mapped Category mapping upsert
  IF v_rule.condition_field = 'ml_category_id' AND v_rule.action_type = 'set_category' THEN
    INSERT INTO public.ml_category_mapping (ml_category_id, ml_category_name, internal_category_id)
    VALUES (v_rule.condition_value, v_rule.condition_value, v_rule.action_target_id)
    ON CONFLICT (ml_category_id) DO UPDATE SET internal_category_id = v_rule.action_target_id;
  END IF;

  -- 2. Find and update existing products
  FOR v_rec IN 
    SELECT p.id, p.category_id, p.brand_id, p.ml_category_id, p.title, (SELECT b.name FROM public.brands b WHERE b.id = p.brand_id LIMIT 1) as brand_name
    FROM public.products p
    WHERE 
      (v_rule.scope = 'global' OR p.vendor_id::text = v_rule.scope_target_id)
  LOOP
    -- Check if this specific rule matches this product and is valid (not a conflict)
    SELECT * INTO v_rule_match 
    FROM evaluate_product_rules(v_rec.title, v_rec.ml_category_id, v_rec.brand_name, NULL)
    WHERE rule_id = p_rule_id;

    IF v_rule_match.suggested_id IS NOT NULL AND NOT COALESCE(v_rule_match.has_conflict, false) THEN
      v_prod_ids := array_append(v_prod_ids, v_rec.id);
      v_prev_vals := v_prev_vals || jsonb_build_object(
        'id', v_rec.id, 
        'field', CASE WHEN v_rule.action_type = 'set_category' THEN 'category_id' ELSE 'brand_id' END, 
        'value', CASE WHEN v_rule.action_type = 'set_category' THEN v_rec.category_id::text ELSE v_rec.brand_id::text END
      );
      
      -- Update product
      IF v_rule.action_type = 'set_category' THEN
        UPDATE public.products SET category_id = v_rule.action_target_id WHERE id = v_rec.id;
      ELSE
        UPDATE public.products SET brand_id = v_rule.action_target_id WHERE id = v_rec.id;
      END IF;
      v_prod_count := v_prod_count + 1;
    END IF;
  END LOOP;

  -- 3. Find and curate matching raw items
  FOR v_rec IN 
    SELECT r.id, r.title, r.status, a.vendor_id, r.raw_payload
    FROM public.ml_raw_items r
    JOIN public.ml_seller_accounts a ON r.seller_id::text = a.seller_id::text
    WHERE 
      (v_rule.scope = 'global' OR a.vendor_id::text = v_rule.scope_target_id) AND
      r.status IN ('analyzing', 'pending', 'review_needed')
  LOOP
    SELECT * INTO v_rule_match 
    FROM evaluate_product_rules(v_rec.title, v_rec.raw_payload->>'category_id', v_rec.raw_payload->'normalized_metadata'->>'brand_name', v_rec.vendor_id)
    WHERE rule_id = p_rule_id;

    IF v_rule_match.suggested_id IS NOT NULL AND NOT COALESCE(v_rule_match.has_conflict, false) THEN
      v_raw_ids := array_append(v_raw_ids, v_rec.id);
      
      -- Perform auto-curation
      v_new_prod_id := auto_curate_raw_item(v_rec.id);
      IF v_new_prod_id IS NOT NULL THEN
        v_curated_count := v_curated_count + 1;
      END IF;
      v_raw_count := v_raw_count + 1;
    END IF;
  END LOOP;

  -- 4. Get target label for history
  IF v_rule.action_type = 'set_category' THEN
    SELECT name INTO v_target_label FROM public.categories WHERE id = v_rule.action_target_id;
  ELSE
    SELECT name INTO v_target_label FROM public.brands WHERE id = v_rule.action_target_id;
  END IF;

  -- 5. Insert History record
  INSERT INTO public.taxonomy_history (
    rule_id,
    applied_by,
    products_affected,
    previous_values,
    new_value,
    notes
  ) VALUES (
    v_rule.id,
    v_rule.created_by,
    to_jsonb(v_prod_ids::text[] || v_raw_ids::text[]),
    v_prev_vals,
    COALESCE(v_target_label, 'Catalogación'),
    concat('Aplicación de regla manual (', v_prod_count, ' existentes, ', v_curated_count, ' curados automáticamente)')
  );

  RETURN jsonb_build_object(
    'success', true,
    'products_found', v_prod_count + v_raw_count,
    'products_updated', v_prod_count,
    'products_curated', v_curated_count,
    'raw_count', v_raw_count
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Replace auto_curate_raw_item to disable learning trigger
CREATE OR REPLACE FUNCTION public.auto_curate_raw_item(p_raw_item_id uuid)
RETURNS uuid AS $$
DECLARE
  v_raw RECORD;
  v_vendor_id uuid;
  v_slug text;
  v_product_id uuid;
  v_category_id uuid;
  v_brand_id uuid;
  v_store_id uuid;
  v_rule_match RECORD;
  v_sku text;
BEGIN
  -- Disable learning during automatic curation
  PERFORM set_config('app.disable_funko_learning', 'true', true);

  SELECT * INTO v_raw FROM public.ml_raw_items WHERE id = p_raw_item_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get vendor ID from seller
  SELECT vendor_id INTO v_vendor_id FROM public.ml_seller_accounts WHERE seller_id::text = v_raw.seller_id::text LIMIT 1;
  IF v_vendor_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Evaluate rules
  SELECT * INTO v_rule_match FROM evaluate_product_rules(
    v_raw.title, 
    v_raw.raw_payload->>'category_id', 
    v_raw.raw_payload->'normalized_metadata'->>'brand_name', 
    v_vendor_id
  );

  IF v_rule_match.suggested_id IS NULL OR v_rule_match.confidence < 50 THEN
    RETURN NULL;
  END IF;

  IF v_rule_match.action_type = 'set_category' THEN
    v_category_id := v_rule_match.suggested_id;
    v_brand_id := CASE WHEN v_raw.raw_payload->'normalized_metadata'->>'brand_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (v_raw.raw_payload->'normalized_metadata'->>'brand_id')::uuid ELSE NULL END;
  ELSE
    v_brand_id := v_rule_match.suggested_id;
    v_category_id := CASE WHEN v_raw.raw_payload->'normalized_metadata'->>'suggested_category_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (v_raw.raw_payload->'normalized_metadata'->>'suggested_category_id')::uuid ELSE NULL END;
  END IF;

  -- Resilient check for foreign keys existence
  IF v_brand_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.brands WHERE id = v_brand_id) THEN
    v_brand_id := NULL;
  END IF;
  
  IF v_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = v_category_id) THEN
    v_category_id := NULL;
  END IF;

  -- Check if product already exists
  SELECT id INTO v_product_id FROM public.products WHERE ml_item_id = v_raw.ml_item_id LIMIT 1;
  
  IF v_product_id IS NULL THEN
    -- Generate slug
    v_slug := concat(lower(regexp_replace(v_raw.title, '[^a-zA-Z0-9]', '-', 'g')), '-', floor(random() * 9000 + 1000)::text);

    -- Get active vendor store
    SELECT id INTO v_store_id FROM public.vendor_stores WHERE vendor_id = v_vendor_id AND status = 'active' LIMIT 1;

    -- Insert Product
    INSERT INTO public.products (
      vendor_id,
      vendor_store_id,
      title,
      description,
      slug,
      base_price,
      category_id,
      brand_id,
      status,
      is_active,
      ml_item_id,
      metadata,
      ml_category_id
    ) VALUES (
      v_vendor_id,
      v_store_id,
      v_raw.title,
      v_raw.raw_payload->>'description',
      v_slug,
      v_raw.price,
      v_category_id,
      v_brand_id,
      'published',
      true,
      v_raw.ml_item_id,
      jsonb_build_object('source_platform', 'mercadolibre', 'catalog_product_id', v_raw.catalog_product_id),
      v_raw.raw_payload->>'category_id'
    ) RETURNING id INTO v_product_id;

    -- Suffix SKU if it already exists to avoid unique constraint violation
    v_sku := v_raw.raw_payload->'normalized_metadata'->>'extracted_seller_sku';
    IF v_sku IS NOT NULL AND EXISTS (SELECT 1 FROM public.product_variants WHERE sku = v_sku) THEN
      v_sku := concat(v_sku, '-dup-', floor(random() * 9000 + 1000)::text);
    END IF;

    -- Insert variant
    INSERT INTO public.product_variants (
      product_id,
      sku,
      name,
      inventory_count
    ) VALUES (
      v_product_id,
      v_sku,
      'Standard',
      v_raw.available_quantity
    );

    -- Insert primary image
    IF v_raw.thumbnail IS NOT NULL AND v_raw.thumbnail <> '' THEN
      INSERT INTO public.product_images (
        product_id,
        url,
        is_primary,
        sort_order
      ) VALUES (
        v_product_id,
        v_raw.thumbnail,
        true,
        0
      );
    END IF;
  END IF;

  -- Update raw item status
  UPDATE public.ml_raw_items
  SET status = 'approved',
      raw_payload = jsonb_set(
        jsonb_set(raw_payload, '{normalized_metadata,suggested_category_id}', concat('"', v_category_id::text, '"')::jsonb),
        '{normalized_metadata,brand_id}',
        concat('"', v_brand_id::text, '"')::jsonb
      )
  WHERE id = p_raw_item_id;

  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql;
