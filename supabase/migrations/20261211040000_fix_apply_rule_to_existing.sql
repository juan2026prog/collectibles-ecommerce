-- Migration: Fix apply_rule_to_existing function for global category mapping updates
-- Date: 2026-07-15

CREATE OR REPLACE FUNCTION public.apply_rule_to_existing(p_rule_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
    IF EXISTS (SELECT 1 FROM public.ml_category_mapping WHERE ml_category_id = v_rule.condition_value AND vendor_id IS NULL) THEN
      UPDATE public.ml_category_mapping 
      SET internal_category_id = v_rule.action_target_id 
      WHERE ml_category_id = v_rule.condition_value AND vendor_id IS NULL;
    ELSE
      INSERT INTO public.ml_category_mapping (ml_category_id, ml_category_name, internal_category_id, vendor_id)
      VALUES (v_rule.condition_value, v_rule.condition_value, v_rule.action_target_id, NULL);
    END IF;
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
$function$;
