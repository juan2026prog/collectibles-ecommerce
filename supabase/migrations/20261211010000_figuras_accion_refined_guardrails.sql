-- Migration: Figuras de Acción Refined Guardrails with Action Figure Brands and Exclusions
-- Date: 2026-07-15

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
  v_is_excluded boolean := false;
  v_has_positive_signal boolean := false;
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

        -- Guardrail B: Action Figures (Figuras de Acción) cleanup - Refined positive signals & exclusions
        IF v_rule.action_target_id = 'ddd41421-fb1c-423f-a282-131aba8c4373' THEN
          -- 1. Check exclusions
          v_is_excluded := (
            p_title ~* '\y(funko|pop!?|figgyz|popera|peluches?|plush(y|ies?)?|stuffed|soft toys?|dolls?|muñecas?|barbie|princess dolls?|classic dolls?|disney store dolls?|beyblades?|yugioh|yu-gi-oh|cards?|cartas?|sobres?|boosters?|heroclix|iron studios|statues?|estatuas?|vehicles?|vehículos?|hot wheels|majorette|autos?|cars?|diecast|escala|matchbox|llaveros?|keychains?|voces an[óo]nimas|moncolle|alajeros?)\y'
            OR lower(COALESCE(p_brand_name, '')) IN ('funko', 'figgyz', 'popera', 'iron studios', 'hot wheels', 'majorette', 'moncolle')
          );
          
          -- 2. Check positive signals
          v_has_positive_signal := (
            p_title ~* '\y(action figures?|figuras? de acci[óo]n|articulated figures?|figuras? articuladas?)\y'
            OR p_title ~* '\y(marvel legends|black series|s\.?h\.? ?figuarts|myth cloth|mafex|figma|revoltech|neca|mcfarlane|super7|play arts|mezco|g\.?i\.? ?joe classified|motu origins|masters of the universe|motu)\y'
            OR (p_title ~* '\y(transformers)\y' AND p_title ~* '\y(figuras?|figures?|action|articulada?s?)\y')
            OR
            (
              lower(COALESCE(p_brand_name, '')) IN ('neca', 'mcfarlane', 'figma', 'mafex', 'super7', 'mezco', 'bandai', 'hasbro', 'jakks pacific', 'dc collectibles', 'dc direct', 'playmates', 'playmates toys', 'medicom', 'medicom toy', 'medicos', 'medicos entertainment', 'jada', 'jada toys', 'storm collectibles', 'toy biz', 'diamond select', 'hot toys')
              AND (p_title ~* '\y(figuras?|figures?)\y' OR p_ml_category_id = 'MLU176854')
            )
          );

          -- Block if excluded or no positive signal
          IF v_is_excluded OR NOT v_has_positive_signal THEN
            v_has_conflict := true;
            IF v_is_excluded THEN
              v_conflict_details := 'Producto excluido por marca o palabra clave (Funko, Peluche, Muñeca, Beyblade, Yu-Gi-Oh, Carta, Heroclix, Iron Studios, Estatua, Vehículo, Llavero, Voces Anónimas, Moncolle, Alajero).';
            ELSE
              v_conflict_details := 'Producto no contiene señal positiva fuerte para Figuras de Acción (Marvel Legends, Black Series, SH Figuarts, Myth Cloth, Mafex, Figma, NECA, McFarlane, etc. o marcas asociadas).';
            END IF;

            rule_id := v_rule.id;
            suggested_id := NULL; -- Block automatic assignment
            action_type := v_rule.action_type;
            confidence := 30; -- Low confidence
            rule_description := concat(upper(v_rule.rule_type), ' Rule (Conflict - Figuras de Acción refined guardrail)');
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
