-- Migration: Figuras de Acción Cleanup and Guardrails
-- Date: 2026-07-03

-- 1. Clean up FIGURAS dictionary by removing generic 'figure' word
DELETE FROM public.taxonomy_dictionary_words 
WHERE dictionary_id = '0a31bb56-6e95-4fda-8aa8-266e19214ab2' AND word = 'figure';

-- 2. Populate VEHICULOS_ESCALA and JUEGOS_JUGUETES dictionaries
INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'hot wheels'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'matchbox'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'majorette'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'diecast'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'escala'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'racer'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'vehicle'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'vehicles'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'vehículo'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'vehículos'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'autos'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'autito'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'autitos'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'tren'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'trenes'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'pista de autos'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e04', 'trackset')
ON CONFLICT (dictionary_id, word) DO NOTHING;

INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'juego'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'juegos'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'juguete'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'juguetes'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'playset'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'playsets'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'set'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'sets'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'boardgame'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'boardgames'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'lego'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'playmobil'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'nerf'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'beyblade'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'rompecabezas'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'puzzle'),
  ('59fdfb74-1234-45aa-bbcc-d3d6610e5e05', 'puzzles')
ON CONFLICT (dictionary_id, word) DO NOTHING;

-- 3. Create new taxonomy rules for Vehículos a Escala and Juegos y Juguetes dictionaries
INSERT INTO public.taxonomy_rules (id, priority, rule_type, scope, condition_field, condition_value, action_type, action_target_id, is_active, conditions)
SELECT '59fdfb74-1234-45aa-bbcc-d3d6610e5f04', 90, 'keyword', 'global', 'dictionary', 'VEHICULOS_ESCALA', 'set_category', 'c1a368f5-0dea-49dc-95a0-6347cfbd7fd1', true, '[{"field": "dictionary", "value": "VEHICULOS_ESCALA", "operator": "equals"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.taxonomy_rules WHERE id = '59fdfb74-1234-45aa-bbcc-d3d6610e5f04');

INSERT INTO public.taxonomy_rules (id, priority, rule_type, scope, condition_field, condition_value, action_type, action_target_id, is_active, conditions)
SELECT '59fdfb74-1234-45aa-bbcc-d3d6610e5f05', 85, 'keyword', 'global', 'dictionary', 'JUEGOS_JUGUETES', 'set_category', 'f3436353-9149-435b-b18f-95f24c9e853e', true, '[{"field": "dictionary", "value": "JUEGOS_JUGUETES", "operator": "equals"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.taxonomy_rules WHERE id = '59fdfb74-1234-45aa-bbcc-d3d6610e5f05');


-- 4. Recreate evaluate_product_rules to add the Figuras de Acción guardrail checks
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
  
  -- Guardrail variables for Figuras de Acción
  v_is_peluche boolean := false;
  v_is_muneca boolean := false;
  v_is_vehiculo boolean := false;
  v_is_juguete boolean := false;
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
      -- Enforce guardrails if setting a category
      IF v_rule.action_type = 'set_category' THEN
        SELECT parent_id, name INTO v_parent_id, v_cat_name 
        FROM public.categories 
        WHERE id = v_rule.action_target_id;
        
        -- Guardrail A: Matches either the parent Funko POP category itself OR any of its subcategories
        IF v_rule.action_target_id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb' OR v_parent_id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb' THEN
          v_is_funko := (
            (
              lower(COALESCE(p_brand_name, '')) = 'funko' OR
              p_title ~* '\yfunko\y' OR
              (p_title ~* '\ypop!?\y' AND COALESCE(lower(p_brand_name) NOT IN ('figgyz', 'hasbro', 'neca', 'bandai', 'mattel', 'playmobil', 'lego', 'mcfarlane', 'hot toys', 'iron studios', 'super7', 'mezco', 'jada', 'jada toys'), true))
            ) AND NOT (
              p_title ~* '\y(kpop|poppy playtime|poppy|critters)\y'
            )
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

        -- Guardrail B: Action Figures (Figuras de Acción) cleanup
        IF v_rule.action_target_id = 'ddd41421-fb1c-423f-a282-131aba8c4373' THEN
          -- 1. Check if the product is Funko Pop
          v_is_funko := (
            (
              lower(COALESCE(p_brand_name, '')) = 'funko' OR
              p_title ~* '\yfunko\y' OR
              (p_title ~* '\ypop!?\y' AND COALESCE(lower(p_brand_name) NOT IN ('figgyz', 'hasbro', 'neca', 'bandai', 'mattel', 'playmobil', 'lego', 'mcfarlane', 'hot toys', 'iron studios', 'super7', 'mezco', 'jada', 'jada toys'), true))
            ) AND NOT (
              p_title ~* '\y(kpop|poppy playtime|poppy|critters)\y'
            )
          );

          -- 2. Check if the product is Peluche
          IF NOT v_is_funko THEN
            v_is_peluche := (p_title ~* '\y(peluche|plush|stuffed|soft toy)\y' OR p_title ~* 'muñeco de peluche');
          END IF;

          -- 3. Check if the product is Muñeca
          IF NOT v_is_funko AND NOT v_is_peluche THEN
            v_is_muneca := (p_title ~* '\y(doll|muñeca|barbie|princess doll|classic doll|disney store doll)\y');
          END IF;

          -- 4. Check if the product is Vehículo
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca THEN
            v_is_vehiculo := (p_title ~* '\y(hot wheels|autos?|cars?|vehicles?|vehículos?|racers?|diecast|escala|matchbox|majorette)\y');
          END IF;

          -- 5. Check if the product is Juego / Juguete genérico
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca AND NOT v_is_vehiculo THEN
            v_is_juguete := (
              p_title ~* '\y(juegos?|juguetes?|toys?|playsets?|sets?|boardgames?|legos?|playmobils?|nerf|beyblade|rompecabezas|puzzles?)\y'
              AND NOT (
                lower(COALESCE(p_brand_name, '')) IN ('funko', 'mcfarlane', 'neca', 'figma', 'mafex', 'super7', 'bandai', 'hasbro', 'storm collectibles', 'playmates', 'hot toys', 'iron studios', 'mezco', 'banpresto', 'medicom', 'figgyz', 'jada', 'jada toys')
                OR p_title ~* '\y(mcfarlane|neca|figma|mafex|super7|bandai|hasbro|storm collectibles|playmates|hot toys|iron studios|mezco|banpresto|medicom|figuarts|action figures?|figuras? de acción|articuladas?|articulados?|marvel legends|black series|retro collection|vintage collection|multiverse|ultimate edition|ultimates|jada)\y'
              )
            );
          END IF;

          -- Block if matches any guardrail
          IF v_is_funko OR v_is_peluche OR v_is_muneca OR v_is_vehiculo OR v_is_juguete THEN
            v_has_conflict := true;
            IF v_is_funko THEN
              v_conflict_details := 'Producto es Funko Pop real, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_peluche THEN
              v_conflict_details := 'Producto es Peluche, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_muneca THEN
              v_conflict_details := 'Producto es Muñeca, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_vehiculo THEN
              v_conflict_details := 'Producto es Vehículo, no debe asignarse a Figuras de Acción.';
            ELSE
              v_conflict_details := 'Producto es Juego o Juguete genérico, no debe asignarse a Figuras de Acción.';
            END IF;

            rule_id := v_rule.id;
            suggested_id := NULL; -- Block automatic assignment
            action_type := v_rule.action_type;
            confidence := 30; -- Low confidence
            rule_description := concat(upper(v_rule.rule_type), ' Rule (Conflict - Figuras de Acción cleanup)');
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


-- 5. DO Block to perform the safe cleanup and reclassification of existing products
DO $$
DECLARE
  v_rec RECORD;
  v_resolved_cat_id UUID;
  v_funko_subcat_id UUID;
  v_reclassified_count INTEGER := 0;
  v_prod_ids UUID[] := ARRAY[]::UUID[];
  v_prev_vals JSONB := '[]'::JSONB;
  v_metadata JSONB;
BEGIN
  -- Disable learning during batch update
  PERFORM set_config('app.disable_funko_learning', 'true', true);

  FOR v_rec IN 
    SELECT p.id, p.title, p.brand_id, b.name as brand_name, p.category_id as current_cat_id, p.metadata
    FROM public.products p
    LEFT JOIN public.brands b ON p.brand_id = b.id
    WHERE p.category_id = 'ddd41421-fb1c-423f-a282-131aba8c4373'
  LOOP
    v_resolved_cat_id := NULL;
    v_metadata := v_rec.metadata;

    -- 1. Funko POP check
    IF (lower(COALESCE(v_rec.brand_name, '')) = 'funko' OR v_rec.title ~* '\yfunko\y' OR v_rec.title ~* '\ypop!?\y') 
       AND COALESCE(lower(v_rec.brand_name) NOT IN ('figgyz', 'hasbro', 'neca', 'bandai', 'mattel', 'playmobil', 'lego', 'mcfarlane', 'hot toys', 'iron studios', 'super7', 'mezco', 'jada', 'jada toys'), true)
       AND NOT (v_rec.title ~* '\y(kpop|poppy playtime|poppy|critters)\y') THEN
       
      v_resolved_cat_id := '94c47727-f07d-4c80-b74d-eb8344c8ddeb'; -- Fallback Funko POP parent

      -- Try to find specific Funko subcategory safely
      SELECT suggested_id INTO v_funko_subcat_id 
      FROM public.evaluate_product_rules(v_rec.title, 'MLU176854', v_rec.brand_name, NULL)
      WHERE suggested_id IS NOT NULL AND suggested_id <> '94c47727-f07d-4c80-b74d-eb8344c8ddeb';
      
      IF v_funko_subcat_id IS NOT NULL THEN
        v_resolved_cat_id := v_funko_subcat_id;
      END IF;

    -- 2. Peluches check
    ELSIF v_rec.title ~* '\y(peluche|plush|stuffed|soft toy)\y' OR v_rec.title ~* 'muñeco de peluche' THEN
      v_resolved_cat_id := 'b1cdd325-1be1-47f8-a8af-bcb58fa9b403'; -- Peluches

    -- 3. Muñecas check
    ELSIF v_rec.title ~* '\y(doll|muñeca|barbie|princess doll|classic doll|disney store doll)\y' THEN
      v_resolved_cat_id := '9a089aa7-3a0c-4f23-8bbb-e7a6bbb52773'; -- Muñecas

    -- 4. Vehículos check
    ELSIF v_rec.title ~* '\y(hot wheels|autos?|cars?|vehicles?|vehículos?|racers?|diecast|escala|matchbox|majorette)\y' THEN
      v_resolved_cat_id := 'c1a368f5-0dea-49dc-95a0-6347cfbd7fd1'; -- Vehículos a Escala

    -- 5. Juegos y Juguetes check
    ELSIF (v_rec.title ~* '\y(juegos?|juguetes?|toys?|playsets?|sets?|boardgames?|legos?|playmobils?|nerf|beyblade|rompecabezas|puzzles?)\y')
         AND NOT (
           lower(COALESCE(v_rec.brand_name, '')) IN ('funko', 'mcfarlane', 'neca', 'figma', 'mafex', 'super7', 'bandai', 'hasbro', 'storm collectibles', 'playmates', 'hot toys', 'iron studios', 'mezco', 'banpresto', 'medicom', 'figgyz', 'jada', 'jada toys')
           OR v_rec.title ~* '\y(mcfarlane|neca|figma|mafex|super7|bandai|hasbro|storm collectibles|playmates|hot toys|iron studios|mezco|banpresto|medicom|figuarts|action figures?|figuras? de acción|articuladas?|articulados?|marvel legends|black series|retro collection|vintage collection|multiverse|ultimate edition|ultimates|jada)\y'
         ) THEN
      v_resolved_cat_id := 'f3436353-9149-435b-b18f-95f24c9e853e'; -- Juegos y Juguetes
      v_metadata := COALESCE(v_metadata, '{}'::jsonb) || '{"needs_manual_category_review": true}'::jsonb;
    END IF;

    -- Execute update if resolved to a new category
    IF v_resolved_cat_id IS NOT NULL AND v_resolved_cat_id <> v_rec.current_cat_id THEN
      -- Record previous values
      v_prod_ids := array_append(v_prod_ids, v_rec.id);
      v_prev_vals := v_prev_vals || jsonb_build_object(
        'id', v_rec.id,
        'field', 'category_id',
        'value', v_rec.current_cat_id::text
      );

      UPDATE public.products 
      SET category_id = v_resolved_cat_id,
          metadata = v_metadata,
          updated_at = now()
      WHERE id = v_rec.id;

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
      'figuras_accion_cleanup_reorder',
      concat('Reclassified ', v_reclassified_count, ' products out of Figuras de Acción category to their correct destinations.')
    );
  END IF;

  RAISE NOTICE 'Total reclassified products out of Figuras de Acción: %', v_reclassified_count;
END $$;
