-- Migration: Fix public.get_product_buybox RPC to match real vendor schema
-- Fixes references to non-existent columns (vpv.vendor_id, vpv.unit_price, vpv.shipping_cost, vpv.status)
-- Accurately joins vendor_product_variants -> vendor_products -> vendors -> vendor_stores

CREATE OR REPLACE FUNCTION public.get_product_buybox(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_variant RECORD;
    v_product RECORD;
    v_base_store RECORD;
    v_first_variant_id TEXT := NULL;
    v_first_winner JSONB := NULL;
    v_first_other_options JSONB := '[]'::jsonb;
    v_has_variants BOOLEAN := false;
BEGIN
    -- Fetch parent product record
    SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
    IF NOT FOUND THEN
        RETURN '{}'::jsonb;
    END IF;

    FOR v_variant IN 
        SELECT id, inventory_count, price_adjustment 
        FROM public.product_variants 
        WHERE product_id = p_product_id AND is_active = true
        ORDER BY created_at ASC
    LOOP
        v_has_variants := true;
        DECLARE
            v_variant_result JSONB := NULL;
        BEGIN
            -- CASE 1: Primary inventory has stock
            IF COALESCE(v_variant.inventory_count, 0) > 0 THEN
                IF v_product.vendor_id IS NULL THEN
                    -- Collectibles is official owner and has stock
                    SELECT jsonb_build_object(
                        'winner', jsonb_build_object(
                            'vendor_id', NULL,
                            'vendor_name', 'Collectibles',
                            'vendor_store_id', NULL,
                            'vendor_store_slug', NULL,
                            'vendor_store_logo', NULL,
                            'vendor_store_badges', '[]'::jsonb,
                            'price', (COALESCE(v_product.base_price, 0) + COALESCE(v_variant.price_adjustment, 0)),
                            'price_adjustment', v_variant.price_adjustment,
                            'stock', v_variant.inventory_count,
                            'is_collectibles', true,
                            'decision_reason', 'Collectibles es el vendedor oficial y tiene stock disponible.'
                        ),
                        'other_options', '[]'::jsonb
                    ) INTO v_variant_result;
                ELSE
                    -- Vendor is owner. Verify owning vendor is active!
                    SELECT 
                        vs.id, 
                        COALESCE(vs.store_name, v.company_name, v.store_name, 'Vendedor') AS store_name,
                        vs.slug, 
                        vs.logo_url,
                        v.status AS vendor_status,
                        COALESCE(
                          (SELECT jsonb_agg(jsonb_build_object('id', b.id, 'badge_key', b.badge_key, 'label', b.label, 'color_class', b.color_class, 'description', b.description))
                           FROM public.vendor_store_badge_assignments ba
                           JOIN public.vendor_store_badges b ON b.id = ba.badge_id
                           WHERE ba.vendor_store_id = vs.id AND ba.status = 'active' AND ba.approved_by IS NOT NULL),
                          '[]'::jsonb
                        ) AS vendor_store_badges
                    INTO v_base_store
                    FROM public.vendors v
                    LEFT JOIN public.vendor_stores vs ON (vs.id = v_product.vendor_store_id OR (v_product.vendor_store_id IS NULL AND vs.vendor_id = v.id))
                    WHERE v.id = v_product.vendor_id
                    ORDER BY vs.created_at ASC
                    LIMIT 1;

                    -- If owning vendor is active, owning vendor wins
                    IF v_base_store.vendor_status = 'active' THEN
                        SELECT jsonb_build_object(
                            'winner', jsonb_build_object(
                                'vendor_id', v_product.vendor_id,
                                'vendor_name', COALESCE(v_base_store.store_name, 'Vendedor'),
                                'vendor_store_id', v_base_store.id,
                                'vendor_store_slug', v_base_store.slug,
                                'vendor_store_logo', v_base_store.logo_url,
                                'vendor_store_badges', COALESCE(v_base_store.vendor_store_badges, '[]'::jsonb),
                                'price', (COALESCE(v_product.base_price, 0) + COALESCE(v_variant.price_adjustment, 0)),
                                'price_adjustment', v_variant.price_adjustment,
                                'stock', v_variant.inventory_count,
                                'is_collectibles', false,
                                'decision_reason', 'Vendedor propietario del producto con stock disponible.'
                            ),
                            'other_options', '[]'::jsonb
                        ) INTO v_variant_result;
                    ELSE
                        -- Owning vendor is inactive -> cannot win!
                        v_variant_result := NULL;
                    END IF;
                END IF;
            END IF;

            -- CASE 2: No winner yet (either inventory_count <= 0 or owning vendor was inactive)
            -- Evaluate competing vendor listings from vendor_product_variants joined with vendor_products
            IF v_variant_result IS NULL OR v_variant_result->>'winner' IS NULL THEN
                WITH vendor_competitors AS (
                    SELECT 
                        vpv.id AS vpv_id,
                        v.id AS vendor_id,
                        vs.id AS vendor_store_id,
                        COALESCE(vs.store_name, v.company_name, v.store_name, 'Vendedor') AS vendor_name,
                        vs.slug AS vendor_store_slug,
                        vs.logo_url AS vendor_store_logo,
                        COALESCE(
                          (SELECT jsonb_agg(jsonb_build_object('id', b.id, 'badge_key', b.badge_key, 'label', b.label, 'color_class', b.color_class, 'description', b.description))
                           FROM public.vendor_store_badge_assignments ba
                           JOIN public.vendor_store_badges b ON b.id = ba.badge_id
                           WHERE ba.vendor_store_id = vs.id AND ba.status = 'active' AND ba.approved_by IS NOT NULL),
                          '[]'::jsonb
                        ) AS vendor_store_badges,
                        (vp.price + COALESCE(vpv.price_adjustment, 0)) AS total_price,
                        vpv.inventory_count AS stock
                    FROM public.vendor_product_variants vpv
                    JOIN public.vendor_products vp ON vp.id = vpv.vendor_product_id
                    JOIN public.vendors v ON v.id = vp.vendor_id
                    LEFT JOIN public.vendor_stores vs ON vs.vendor_id = v.id AND vs.status = 'active'
                    WHERE vpv.variant_id = v_variant.id 
                      AND vp.status = 'active'
                      AND v.status = 'active'
                      AND COALESCE(vpv.inventory_count, 0) > 0
                ),
                scored_competitors AS (
                    SELECT 
                        *,
                        MIN(total_price) OVER () AS min_price,
                        MAX(total_price) OVER () AS max_price,
                        MAX(stock) OVER () AS max_stock
                    FROM vendor_competitors
                ),
                final_scored AS (
                    SELECT 
                        *,
                        (CASE WHEN max_price = min_price THEN 70.0 
                         ELSE 70.0 * (1.0 - ((total_price - min_price) / NULLIF(max_price - min_price, 0))) END) AS price_score,
                        
                        (CASE WHEN max_stock = 0 THEN 0.0
                         ELSE 30.0 * (stock::numeric / NULLIF(max_stock::numeric, 0)) END) AS stock_score
                    FROM scored_competitors
                ),
                ranked AS (
                    SELECT 
                        *,
                        (COALESCE(price_score, 0) + COALESCE(stock_score, 0)) AS final_score
                    FROM final_scored
                    ORDER BY (COALESCE(price_score, 0) + COALESCE(stock_score, 0)) DESC, total_price ASC, stock DESC
                )
                SELECT jsonb_build_object(
                    'winner', (
                        SELECT jsonb_build_object(
                            'vpv_id', vpv_id,
                            'vendor_id', vendor_id,
                            'vendor_name', vendor_name,
                            'vendor_store_id', vendor_store_id,
                            'vendor_store_slug', vendor_store_slug,
                            'vendor_store_logo', vendor_store_logo,
                            'vendor_store_badges', vendor_store_badges,
                            'price', total_price,
                            'stock', stock,
                            'has_logistics', false,
                            'final_score', final_score,
                            'is_collectibles', false,
                            'decision_reason', 'Ganador por puntuación: Precio competitivo y stock disponible.'
                        )
                        FROM ranked LIMIT 1
                    ),
                    'other_options', (
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'vpv_id', vpv_id,
                                'vendor_id', vendor_id,
                                'vendor_name', vendor_name,
                                'vendor_store_id', vendor_store_id,
                                'vendor_store_slug', vendor_store_slug,
                                'vendor_store_logo', vendor_store_logo,
                                'vendor_store_badges', vendor_store_badges,
                                'price', total_price,
                                'stock', stock,
                                'has_logistics', false,
                                'final_score', final_score
                            )
                        ), '[]'::jsonb)
                        FROM ranked OFFSET 1
                    )
                ) INTO v_variant_result;

                IF v_variant_result IS NULL OR v_variant_result->>'winner' IS NULL THEN
                    v_variant_result := jsonb_build_object(
                        'winner', NULL,
                        'other_options', '[]'::jsonb
                    );
                END IF;
            END IF;

            -- Track first variant processed for top-level convenience
            IF v_first_variant_id IS NULL THEN
                v_first_variant_id := v_variant.id::text;
                v_first_winner := v_variant_result->'winner';
                v_first_other_options := v_variant_result->'other_options';
            END IF;

            v_result := jsonb_set(v_result, ARRAY[v_variant.id::text], v_variant_result);
        END;
    END LOOP;

    -- Handle products without active variants (fallback to metadata stock if available)
    IF NOT v_has_variants THEN
        DECLARE
            v_meta_initial NUMERIC := NULLIF(v_product.metadata->>'initial_quantity', '')::numeric;
            v_meta_sold NUMERIC := COALESCE(NULLIF(v_product.metadata->>'sold_quantity', '')::numeric, 0);
            v_meta_stock NUMERIC := CASE WHEN v_meta_initial IS NOT NULL THEN GREATEST(0, v_meta_initial - v_meta_sold) ELSE NULL END;
        BEGIN
            IF v_meta_stock IS NOT NULL AND v_meta_stock > 0 THEN
                v_result := jsonb_build_object(
                    'winner', jsonb_build_object(
                        'vendor_id', NULL,
                        'vendor_name', 'Collectibles',
                        'vendor_store_id', NULL,
                        'vendor_store_slug', NULL,
                        'vendor_store_logo', NULL,
                        'vendor_store_badges', '[]'::jsonb,
                        'price', COALESCE(v_product.base_price, 0),
                        'price_adjustment', 0,
                        'stock', v_meta_stock,
                        'is_collectibles', true,
                        'decision_reason', 'Collectibles es el vendedor oficial y tiene stock en metadata disponible.'
                    ),
                    'other_options', '[]'::jsonb
                );
            ELSE
                v_result := jsonb_build_object(
                    'winner', NULL,
                    'other_options', '[]'::jsonb
                );
            END IF;
            RETURN v_result;
        END;
    END IF;

    -- Also provide top-level winner and other_options for the product's primary variant
    IF v_first_variant_id IS NOT NULL THEN
        v_result := jsonb_set(v_result, ARRAY['winner'], COALESCE(v_first_winner, 'null'::jsonb));
        v_result := jsonb_set(v_result, ARRAY['other_options'], COALESCE(v_first_other_options, '[]'::jsonb));
    END IF;

    RETURN v_result;
END;
$function$;

-- Ensure anon role can query active shipping providers on guest checkout
GRANT SELECT ON public.shipping_providers TO anon;
