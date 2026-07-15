-- Migration: Figuras de Acción Mismatched Reclassification using Strict Guardrails
-- Date: 2026-07-15

DO $$
DECLARE
  v_rec RECORD;
  v_resolved_cat_id UUID;
  v_reclassified_count INTEGER := 0;
  v_prod_ids UUID[] := ARRAY[]::UUID[];
  v_prev_vals JSONB := '[]'::JSONB;
  v_metadata JSONB;
  v_decision text;
BEGIN
  -- Disable learning during batch update
  PERFORM set_config('app.disable_funko_learning', 'true', true);

  FOR v_rec IN 
    SELECT p.id, p.title, p.brand_id, b.name as brand_name, p.category_id as current_cat_id, p.metadata, p.ml_category_id
    FROM public.products p
    LEFT JOIN public.brands b ON p.brand_id = b.id
    WHERE p.category_id = 'ddd41421-fb1c-423f-a282-131aba8c4373'
  LOOP
    -- Evaluate if it's mismatched (fails strict guardrail)
    IF (
      -- Excluded
      (
        v_rec.title ~* '\y(funko|pop!?|figgyz|popera|peluches?|plush(y|ies?)?|stuffed|soft toys?|dolls?|muñecas?|barbie|princess dolls?|classic dolls?|disney store dolls?|beyblades?|yugioh|yu-gi-oh|cards?|cartas?|sobres?|boosters?|heroclix|iron studios|statues?|estatuas?|vehicles?|vehículos?|hot wheels|majorette|autos?|cars?|diecast|escala|matchbox|llaveros?|keychains?|voces an[óo]nimas|moncolle|alajeros?)\y'
        OR lower(COALESCE(v_rec.brand_name, '')) IN ('funko', 'figgyz', 'popera', 'iron studios', 'hot wheels', 'majorette', 'moncolle')
      )
      OR NOT (
        -- Has positive signal
        v_rec.title ~* '\y(action figures?|figuras? de acci[óo]n|articulated figures?|figuras? articuladas?)\y'
        OR v_rec.title ~* '\y(marvel legends|black series|s\.?h\.? ?figuarts|myth cloth|mafex|figma|revoltech|neca|mcfarlane|super7|play arts|mezco|g\.?i\.? ?joe classified|motu origins|masters of the universe|motu|figuarts|nendoroid|retro collection|vintage collection|multiverse|ultimate edition|ultimates)\y'
        OR (v_rec.title ~* '\y(transformers)\y' AND v_rec.title ~* '\y(figuras?|figures?|action|articulada?s?)\y')
        OR
        (
          (
            lower(COALESCE(v_rec.brand_name, '')) IN ('neca', 'mcfarlane', 'figma', 'mafex', 'super7', 'mezco', 'bandai', 'hasbro', 'jakks pacific', 'dc collectibles', 'dc direct', 'playmates', 'playmates toys', 'medicom', 'medicom toy', 'medicos', 'medicos entertainment', 'jada', 'jada toys', 'storm collectibles', 'toy biz', 'diamond select', 'hot toys', 'boss fight studio', 'boss fight', 'kenner', 'mattel')
            OR v_rec.title ~* '\y(hasbro|kenner|mattel|bandai|neca|mcfarlane|figma|mafex|super7|playmates|mezco|hot toys|revoltech|kotobukiya|kaiyodo|storm collectibles|diamond select|toy biz|jada toys|jakks pacific|boss fight)\y'
          )
          AND (v_rec.title ~* '\y(figuras?|figures?|mu[ñn]ecos?|toys?)\y' OR v_rec.ml_category_id = 'MLU176854')
        )
        OR
        (
          v_rec.title ~* '\y(marvel|x-?men|spiders?-?man|batman|superman|wonder woman|joker|avengers|star wars|transformers|g\.?i\.? ?joe|power rangers|he-man|motu|saint seiya|dragon ball|dbz|naruto|one piece|demon slayer|my hero academia|evangelion|gundam|macross|robotech|alien|predator|terminator|robocop|spawn|tmnt|tortugas ninja)\y'
          AND (v_rec.title ~* '\y(figuras?|figures?|mu[ñn]ecos?)\y' OR v_rec.ml_category_id = 'MLU176854')
        )
        OR
        (
          v_rec.title ~* '\y(marvel|x-?men|xmen|star wars|transformers|he-man|motu|g\.?i\.? ?joe|saint seiya)\y'
          AND v_rec.title ~* '\y(tas\d*|retro|vintage|classics?)\y'
        )
      )
    ) THEN
      -- Resolve correct category
      v_resolved_cat_id := NULL;
      v_metadata := v_rec.metadata;
      v_decision := '';

      -- 1. Alajeros / Incensios / Lámparas -> Home & Decor
      IF v_rec.title ~* '\y(alajeros?|inciensos?|l[áa]mparas?)\y' THEN
        v_resolved_cat_id := '8c8e5b0b-9b1e-46e3-980a-db6e4d5156cd';
        v_decision := 'Reclassified Home & Decor items.';
        
      -- 2. Llaveros -> Llaveros
      ELSIF v_rec.title ~* '\y(llaveros?|keychains?)\y' THEN
        v_resolved_cat_id := '78e5cb29-946b-4bd3-91e4-ded4c06573b7';
        v_decision := 'Reclassified Llaveros.';

      -- 3. Cromos / Cartas / Figuritas -> Cromos / Figuritas
      ELSIF v_rec.title ~* '\y(figuritas?|sobres?|cartas?|cards?|cromos?|boosters?)\y' THEN
        v_resolved_cat_id := 'f899100f-6983-4b46-8fb0-7961baef5c4e';
        v_decision := 'Reclassified Cromos / Figuritas.';

      -- 4. Peluches -> Peluches
      ELSIF v_rec.title ~* '\y(peluches?|plush(y|ies?)?|stuffed|soft toys?)\y' OR v_rec.title ~* 'muñeco de peluche' THEN
        v_resolved_cat_id := 'b1cdd325-1be1-47f8-a8af-bcb58fa9b403';
        v_decision := 'Reclassified Peluches.';

      -- 5. Muñecas -> Muñecas
      ELSIF v_rec.title ~* '\y(muñecas?|barbie|dolls?)\y' THEN
        v_resolved_cat_id := '9a089aa7-3a0c-4f23-8bbb-e7a6bbb52773';
        v_decision := 'Reclassified Muñecas.';

      -- 6. Vehículos -> Vehículos a Escala
      ELSIF v_rec.title ~* '\y(hot wheels|majorette|autos?|cars?|escala|matchbox)\y' THEN
        v_resolved_cat_id := 'c1a368f5-0dea-49dc-95a0-6347cfbd7fd1';
        v_decision := 'Reclassified Vehículos a Escala.';

      -- 7. TCG -> TCG & Boardgames
      ELSIF v_rec.title ~* '\y(yugioh|yu-gi-oh|pokemon tcg|boardgames?|juegos? de mesa)\y' THEN
        v_resolved_cat_id := '6e659b91-5130-4f20-9ddb-609410b9f84c';
        v_decision := 'Reclassified TCG & Boardgames.';

      -- 8. Fallback to Juegos y Juguetes (with manual review flag)
      ELSE
        v_resolved_cat_id := 'f3436353-9149-435b-b18f-95f24c9e853e';
        v_metadata := COALESCE(v_metadata, '{}'::jsonb) || '{"needs_manual_category_review": true}'::jsonb;
        v_decision := 'Reclassified generic Juegos y Juguetes (marked for manual review).';
      END IF;

      IF v_resolved_cat_id IS NOT NULL AND v_resolved_cat_id <> v_rec.current_cat_id THEN
        v_prod_ids := array_append(v_prod_ids, v_rec.id);
        
        v_metadata := COALESCE(v_metadata, '{}'::jsonb) || '{"previous_category_cleanup": "figuras_accion_strict_guardrail_cleanup"}'::jsonb;

        v_prev_vals := v_prev_vals || jsonb_build_object(
          'id', v_rec.id,
          'title', v_rec.title,
          'field', 'category_id',
          'previous_value', v_rec.current_cat_id::text,
          'new_value', v_resolved_cat_id::text,
          'decision', v_decision
        );

        -- Update product category and metadata
        UPDATE public.products 
        SET category_id = v_resolved_cat_id,
            metadata = v_metadata,
            updated_at = now()
        WHERE id = v_rec.id;

        -- Recalculate duplicates
        PERFORM public.recalculate_product_duplicates(v_rec.id);
        
        v_reclassified_count := v_reclassified_count + 1;
      END IF;
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
      'figuras_accion_strict_guardrail_cleanup',
      concat('Reclassified ', v_reclassified_count, ' mismatched products out of Figuras de Acción category using refined guardrails.')
    );
  END IF;

  RAISE NOTICE 'Total reclassified mismatched products: %', v_reclassified_count;
END $$;
