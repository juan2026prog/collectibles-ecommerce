-- Migration: Figuras de Acción Specific Title Cleanup and Price Trigger Fix
-- Date: 2026-07-04

-- 1. Recreate trigger function ml_sync_master_stock_on_update to fix the "new" has no field "price" error
CREATE OR REPLACE FUNCTION public.ml_sync_master_stock_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_link RECORD;
    v_changed_fields JSONB := '{}'::jsonb;
BEGIN
    -- Anti-Loop: If skip flag is true, reset it and do not sync back to ML
    IF NEW.skip_ml_sync = true THEN
        NEW.skip_ml_sync := false;
        RETURN NEW;
    END IF;

    -- Determine what changed
    IF NEW.inventory_count IS DISTINCT FROM OLD.inventory_count THEN
        v_changed_fields := v_changed_fields || jsonb_build_object('inventory_count', NEW.inventory_count);
    END IF;
    
    -- Corrected: Use price_adjustment instead of price
    IF NEW.price_adjustment IS DISTINCT FROM OLD.price_adjustment THEN
        v_changed_fields := v_changed_fields || jsonb_build_object('price_adjustment', NEW.price_adjustment);
    END IF;

    -- Only act if stock or price changed
    IF v_changed_fields <> '{}'::jsonb THEN
        FOR v_link IN 
            SELECT * FROM public.ml_catalog_links
            WHERE variant_id = NEW.id
              AND vendor_product_variant_id IS NULL
        LOOP
            IF (v_changed_fields ? 'inventory_count' AND v_link.sync_stock = true) OR
               (v_changed_fields ? 'price_adjustment' AND v_link.sync_price = true) THEN
                
                INSERT INTO public.ml_sync_queue (
                    product_id,
                    variant_id,
                    ml_item_id,
                    seller_id,
                    action,
                    payload,
                    status,
                    retry_count
                ) VALUES (
                    v_link.product_id,
                    v_link.variant_id,
                    v_link.ml_item_id,
                    v_link.seller_id,
                    'sync_to_ml',
                    v_changed_fields,
                    'pending',
                    0
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$function$;


-- 2. Recreate trigger function sync_vendor_variant_to_master to remove the invalid updated_at reference
CREATE OR REPLACE FUNCTION public.sync_vendor_variant_to_master()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE public.product_variants pv
    SET 
        inventory_count = NEW.inventory_count,
        price_adjustment = NEW.price_adjustment,
        skip_ml_sync = NEW.skip_ml_sync
    FROM public.ml_catalog_links cl
    WHERE cl.variant_id = pv.id
      AND cl.vendor_product_variant_id = NEW.id
      -- Only update if there is a difference to prevent infinite trigger loops
      AND (pv.inventory_count IS DISTINCT FROM NEW.inventory_count 
           OR pv.price_adjustment IS DISTINCT FROM NEW.price_adjustment
           OR pv.skip_ml_sync IS DISTINCT FROM NEW.skip_ml_sync);

    RETURN NEW;
END;
$function$;


-- 3. Recreate evaluate_product_rules with specific title guardrails
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
  v_is_home_decor boolean := false;
  v_is_ropa_acc boolean := false;
  v_is_cromos boolean := false;
  v_is_llaveros boolean := false;
  v_is_tcg boolean := false;
  v_is_juguete boolean := false;
  v_is_specific_blocked boolean := false;
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
          
          -- Check if related to DC
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

          -- 2. Check if the product is Peluche (plural-aware)
          IF NOT v_is_funko THEN
            v_is_peluche := (p_title ~* '\y(peluches?|plush(y|ies?)?|stuffed|soft toys?)\y' OR p_title ~* 'muñeco de peluche');
          END IF;

          -- 3. Check if the product is Muñeca (plural-aware)
          IF NOT v_is_funko AND NOT v_is_peluche THEN
            v_is_muneca := (p_title ~* '\y(dolls?|muñecas?|barbie|princess dolls?|classic dolls?|disney store dolls?)\y');
          END IF;

          -- 4. Check if the product is Vehículo
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca THEN
            v_is_vehiculo := (p_title ~* '\y(hot wheels|autos?|cars?|vehicles?|vehículos?|racers?|diecast|escala|matchbox|majorette)\y');
          END IF;

          -- 5. Check if the product is Home & Decor
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca AND NOT v_is_vehiculo THEN
            v_is_home_decor := (p_title ~* '\y(lámparas?|portavelas?|inciensos?)\y');
          END IF;

          -- 6. Check if the product is Ropa & Accesorios
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca AND NOT v_is_vehiculo AND NOT v_is_home_decor THEN
            v_is_ropa_acc := (p_title ~* '\y(pulseras?|anillos?|reloj(es)?|gorros?|remeras?|camisetas?|buzos?|medias?|carteras?|billeteras?|collares?)\y' AND NOT (p_title ~* '\y(figuras?|muñecos?|action figures?|articulado|articulada)\y'));
          END IF;

          -- 7. Check if the product is Cromos / Figuritas
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca AND NOT v_is_vehiculo AND NOT v_is_home_decor AND NOT v_is_ropa_acc THEN
            v_is_cromos := (p_title ~* '\y(figuritas?|sobres? de figuritas|cromos?)\y');
          END IF;

          -- 8. Check if the product is Llaveros
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca AND NOT v_is_vehiculo AND NOT v_is_home_decor AND NOT v_is_ropa_acc AND NOT v_is_cromos THEN
            v_is_llaveros := (p_title ~* '\y(llaveros?|keychains?)\y');
          END IF;

          -- 9. Check if the product is TCG & Boardgames
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca AND NOT v_is_vehiculo AND NOT v_is_home_decor AND NOT v_is_ropa_acc AND NOT v_is_cromos AND NOT v_is_llaveros THEN
            v_is_tcg := (p_title ~* '\y(yugioh|yu-gi-oh|pokemon tcg|pokémon tcg|tcg|magic the gathering|mtg|boardgames?|juegos? de mesa)\y' AND NOT (p_title ~* '\y(figuritas?|sobres?|cromos?)\y'));
          END IF;

          -- 10. Check if the product is Juego / Juguete genérico
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca AND NOT v_is_vehiculo AND NOT v_is_home_decor AND NOT v_is_ropa_acc AND NOT v_is_cromos AND NOT v_is_llaveros AND NOT v_is_tcg THEN
            v_is_juguete := (
              p_title ~* '\y(juegos?|juguetes?|toys?|playsets?|sets?|boardgames?|legos?|playmobils?|nerfs?|beyblades?|rompecabezas|puzzles?)\y'
              AND NOT (
                lower(COALESCE(p_brand_name, '')) IN ('funko', 'mcfarlane', 'neca', 'figma', 'mafex', 'super7', 'bandai', 'hasbro', 'storm collectibles', 'playmates', 'hot toys', 'iron studios', 'mezco', 'banpresto', 'medicom', 'figgyz', 'jada', 'jada toys')
                OR p_title ~* '\y(mcfarlane|neca|figma|mafex|super7|bandai|hasbro|storm collectibles|playmates|hot toys|iron studios|mezco|banpresto|medicom|figuarts|action figures?|figuras? de acción|articuladas?|articulados?|marvel legends|black series|retro collection|vintage collection|multiverse|ultimate edition|ultimates|jada)\y'
              )
            );
          END IF;

          -- 11. Check specific blocked keywords
          IF NOT v_is_funko AND NOT v_is_peluche AND NOT v_is_muneca AND NOT v_is_vehiculo AND NOT v_is_home_decor AND NOT v_is_ropa_acc AND NOT v_is_cromos AND NOT v_is_llaveros AND NOT v_is_tcg AND NOT v_is_juguete THEN
            v_is_specific_blocked := (p_title ~* '\y(Voces Anonimas|Yu-Gi-Oh! Valiant Smashers|Beyblade X|Figgyz|Popera|Iron Studios|Heroclix)\y');
          END IF;

          -- Block if matches any guardrail
          IF v_is_funko OR v_is_peluche OR v_is_muneca OR v_is_vehiculo OR v_is_home_decor OR v_is_ropa_acc OR v_is_cromos OR v_is_llaveros OR v_is_tcg OR v_is_juguete OR v_is_specific_blocked THEN
            v_has_conflict := true;
            IF v_is_funko THEN
              v_conflict_details := 'Producto es Funko Pop real, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_peluche THEN
              v_conflict_details := 'Producto es Peluche, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_muneca THEN
              v_conflict_details := 'Producto es Muñeca, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_vehiculo THEN
              v_conflict_details := 'Producto es Vehículo, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_home_decor THEN
              v_conflict_details := 'Producto es Decorativo de Hogar, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_ropa_acc THEN
              v_conflict_details := 'Producto es Ropa o Accesorio, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_cromos THEN
              v_conflict_details := 'Producto es Cromo o Figurita, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_llaveros THEN
              v_conflict_details := 'Producto es Llavero, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_tcg THEN
              v_conflict_details := 'Producto es TCG o Juego de mesa, no debe asignarse a Figuras de Acción.';
            ELSIF v_is_specific_blocked THEN
              v_conflict_details := 'Producto contiene palabra clave bloqueada para Figuras de Acción (Voces Anonimas, Yugioh, Beyblade X, Figgyz, Popera, Iron Studios, Heroclix).';
            ELSE
              v_conflict_details := 'Producto es Juego o Juguete genérico, no debe asignarse a Figuras de Acción.';
            END IF;

            rule_id := v_rule.id;
            suggested_id := NULL; -- Block automatic assignment
            action_type := v_rule.action_type;
            confidence := 30; -- Low confidence
            rule_description := concat(upper(v_rule.rule_type), ' Rule (Conflict - Figuras de Acción cleanup v3)');
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


-- 4. DO Block to safely clean up and reclassify specific products currently in Figuras de Acción
DO $$
DECLARE
  v_rec RECORD;
  v_resolved_cat_id UUID;
  v_reclassified_count INTEGER := 0;
  v_prod_ids UUID[] := ARRAY[]::UUID[];
  v_prev_vals JSONB := '[]'::JSONB;
  v_metadata JSONB;
  v_source_dec text;
  v_term text;
BEGIN
  -- Disable learning during batch update
  PERFORM set_config('app.disable_funko_learning', 'true', true);

  FOR v_rec IN 
    SELECT p.id, p.title, p.brand_id, b.name as brand_name, p.category_id as current_cat_id, p.metadata
    FROM public.products p
    LEFT JOIN public.brands b ON p.brand_id = b.id
    WHERE p.category_id = 'ddd41421-fb1c-423f-a282-131aba8c4373'
    AND p.title ~* 'Voces Anonimas|Yu-Gi-Oh! Valiant Smashers|Beyblade X|Figgyz|Popera|Iron Studios|Heroclix'
  LOOP
    v_resolved_cat_id := NULL;
    v_metadata := v_rec.metadata;
    v_source_dec := '';
    v_term := '';

    -- 1. Voces Anonimas
    IF v_rec.title ~* '\yVoces Anonimas\y' THEN
      v_resolved_cat_id := 'f3436353-9149-435b-b18f-95f24c9e853e'; -- Juegos y Juguetes fallback review
      v_metadata := COALESCE(v_metadata, '{}'::jsonb) || '{"needs_manual_category_review": true}'::jsonb;
      v_term := 'Voces Anonimas';
      v_source_dec := 'Reclassified Voces Anonimas as Juegos y Juguetes (needs review).';

    -- 2. Yu-Gi-Oh! Valiant Smashers - Sobre de cartas
    ELSIF v_rec.title ~* '\yYu-Gi-Oh! Valiant Smashers\y' THEN
      v_resolved_cat_id := 'f899100f-6983-4b46-8fb0-7961baef5c4e'; -- Cromos / Figuritas
      v_term := 'Yu-Gi-Oh! Valiant Smashers';
      v_source_dec := 'Reclassified Yu-Gi-Oh! Valiant Smashers as Cromos / Figuritas.';

    -- 3. Beyblade X
    ELSIF v_rec.title ~* '\yBeyblade X\y' THEN
      v_resolved_cat_id := 'f3436353-9149-435b-b18f-95f24c9e853e'; -- Juegos y Juguetes
      v_term := 'Beyblade X';
      v_source_dec := 'Reclassified Beyblade X as Juegos y Juguetes.';

    -- 4. Figgyz
    ELSIF v_rec.title ~* '\yFiggyz\y' THEN
      v_resolved_cat_id := 'f3436353-9149-435b-b18f-95f24c9e853e'; -- Juegos y Juguetes
      v_term := 'Figgyz';
      v_source_dec := 'Reclassified Figgyz as Juegos y Juguetes.';

    -- 5. Popera
    ELSIF v_rec.title ~* '\yPopera\y' THEN
      v_resolved_cat_id := 'f3436353-9149-435b-b18f-95f24c9e853e'; -- Juegos y Juguetes
      v_term := 'Popera';
      v_source_dec := 'Reclassified Popera as Juegos y Juguetes.';

    -- 6. Iron Studios
    ELSIF v_rec.title ~* '\yIron Studios\y' THEN
      v_resolved_cat_id := '0f5f33ba-8326-48bd-b61d-ec2a484bd5d4'; -- Esculturas y Estatuas
      v_term := 'Iron Studios';
      v_source_dec := 'Reclassified Iron Studios as Esculturas y Estatuas.';

    -- 7. Heroclix
    ELSIF v_rec.title ~* '\yHeroclix\y' THEN
      v_resolved_cat_id := '6e659b91-5130-4f20-9ddb-609410b9f84c'; -- TCG & Boardgames
      v_term := 'Heroclix';
      v_source_dec := 'Reclassified Heroclix as TCG & Boardgames.';
    END IF;

    -- Update product category and metadata
    IF v_resolved_cat_id IS NOT NULL AND v_resolved_cat_id <> v_rec.current_cat_id THEN
      v_prod_ids := array_append(v_prod_ids, v_rec.id);
      
      -- Suffix manual category review flags
      v_metadata := COALESCE(v_metadata, '{}'::jsonb) || '{"previous_category_cleanup": "figuras_accion_specific_title_cleanup"}'::jsonb;

      v_prev_vals := v_prev_vals || jsonb_build_object(
        'id', v_rec.id,
        'title', v_rec.title,
        'field', 'category_id',
        'previous_value', v_rec.current_cat_id::text,
        'new_value', v_resolved_cat_id::text,
        'term', v_term,
        'decision', v_source_dec
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
      'figuras_accion_specific_title_cleanup',
      concat('Reclassified ', v_reclassified_count, ' specific mismatched products (Voces Anonimas, Yugioh, Beyblade X, Figgyz, Popera, Iron Studios, Heroclix) out of Figuras de Acción category.')
    );
  END IF;

  RAISE NOTICE 'Total specific reclassified products: %', v_reclassified_count;
END $$;
