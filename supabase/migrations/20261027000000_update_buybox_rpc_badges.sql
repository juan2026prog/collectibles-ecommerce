-- Migration: Update get_product_buybox to support brand store resolution and store badges
-- Date: 2026-06-25

BEGIN;

CREATE OR REPLACE FUNCTION public.get_product_buybox(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_variant RECORD;
BEGIN
    FOR v_variant IN 
        SELECT id, inventory_count, price_adjustment 
        FROM public.product_variants 
        WHERE product_id = p_product_id AND is_active = true
    LOOP
        DECLARE
            v_collectibles_wins BOOLEAN := false;
            v_variant_result JSONB;
        BEGIN
            IF v_variant.inventory_count > 0 THEN
                v_collectibles_wins := true;
            END IF;

            IF v_collectibles_wins THEN
                SELECT jsonb_build_object(
                    'winner', jsonb_build_object(
                        'vendor_id', NULL,
                        'vendor_name', 'Collectibles',
                        'vendor_store_id', NULL,
                        'vendor_store_slug', NULL,
                        'vendor_store_logo', NULL,
                        'vendor_store_badges', '[]'::jsonb,
                        'price_adjustment', v_variant.price_adjustment,
                        'stock', v_variant.inventory_count,
                        'is_collectibles', true,
                        'decision_reason', 'Collectibles es el vendedor oficial y tiene stock disponible.'
                    ),
                    'other_options', '[]'::jsonb
                ) INTO v_variant_result;
            ELSE
                WITH vendor_competitors AS (
                    SELECT 
                        vpv.id AS vpv_id,
                        v.id AS vendor_id,
                        COALESCE(brand_store.id, default_store.id) AS vendor_store_id,
                        COALESCE(brand_store.store_name, default_store.store_name, v.store_name) AS vendor_name,
                        COALESCE(brand_store.slug, default_store.slug) AS vendor_store_slug,
                        COALESCE(brand_store.logo_url, default_store.logo_url) AS vendor_store_logo,
                        COALESCE(
                          (SELECT jsonb_agg(jsonb_build_object('id', b.id, 'badge_key', b.badge_key, 'label', b.label, 'color_class', b.color_class, 'description', b.description))
                           FROM public.vendor_store_badge_assignments ba
                           JOIN public.vendor_store_badges b ON b.id = ba.badge_id
                           WHERE ba.vendor_store_id = COALESCE(brand_store.id, default_store.id)),
                          '[]'::jsonb
                        ) AS vendor_store_badges,
                        vp.price + vpv.price_adjustment AS total_price,
                        vpv.inventory_count AS stock,
                        (SELECT count(*) > 0 FROM public.vendor_shipping_connections vsc 
                         WHERE vsc.vendor_id = v.id AND vsc.connection_status = 'connected' AND vsc.provider IN ('dac', 'soydelivery', 'ues', 'mirtrans', 'pedidosya')
                        ) AS has_logistics
                    FROM public.vendor_product_variants vpv
                    JOIN public.product_variants pv ON pv.id = vpv.variant_id
                    JOIN public.products p ON p.id = pv.product_id
                    JOIN public.vendor_products vp ON vp.id = vpv.vendor_product_id
                    JOIN public.vendors v ON v.id = vp.vendor_id
                    LEFT JOIN LATERAL (
                        SELECT vs.id, vs.store_name, vs.slug, vs.logo_url
                        FROM public.vendor_stores vs
                        JOIN public.vendor_store_brands vsb ON vsb.vendor_store_id = vs.id
                        WHERE vs.vendor_id = v.id AND vsb.brand_id = p.brand_id
                        LIMIT 1
                    ) brand_store ON true
                    LEFT JOIN LATERAL (
                        SELECT vs.id, vs.store_name, vs.slug, vs.logo_url
                        FROM public.vendor_stores vs
                        WHERE vs.vendor_id = v.id
                        ORDER BY vs.created_at ASC
                        LIMIT 1
                    ) default_store ON true
                    WHERE vpv.variant_id = v_variant.id
                      AND vp.status = 'active'
                      AND v.status = 'active'
                      AND v.kyc_status = 'approved'
                      AND vpv.inventory_count > 0
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
                        (CASE WHEN max_price = min_price THEN 60.0 
                         ELSE 60.0 * (1.0 - ((total_price - min_price) / (max_price - min_price))) END) AS price_score,
                        
                        (CASE WHEN max_stock = 0 THEN 0.0
                         ELSE 25.0 * (stock::numeric / max_stock::numeric) END) AS stock_score,
                         
                        (CASE WHEN has_logistics THEN 15.0 ELSE 0.0 END) AS logistics_score
                    FROM scored_competitors
                ),
                ranked AS (
                    SELECT 
                        *,
                        (price_score + stock_score + logistics_score) AS final_score
                    FROM final_scored
                    ORDER BY (price_score + stock_score + logistics_score) DESC, total_price ASC
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
                            'has_logistics', has_logistics,
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
                                'has_logistics', has_logistics,
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

            v_result := jsonb_set(v_result, ARRAY[v_variant.id::text], v_variant_result);
        END;
    END LOOP;

    RETURN v_result;
END;
$$;

COMMIT;
