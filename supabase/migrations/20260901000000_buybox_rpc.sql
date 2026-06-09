-- ==============================================================================
-- MARKETPLACE P1.7: BUY BOX V2 ALGORITHM
-- ==============================================================================

-- Funciones para calcular la "Buy Box" por producto (evaluando cada SKU/variante).
-- Regla 1: Si Collectibles (product_variants original) tiene stock, gana siempre.
-- Regla 2: Si no, compiten los vendors en vendor_product_variants.
-- Pesos: 60% Precio, 25% Stock, 15% Logistica.

CREATE OR REPLACE FUNCTION public.get_product_buybox(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_variant RECORD;
BEGIN
    -- Recorremos todas las variantes (SKUs) del producto
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
                        'vendor_name', 'Collectibles Uruguay',
                        'price_adjustment', v_variant.price_adjustment,
                        'stock', v_variant.inventory_count,
                        'is_collectibles', true
                    ),
                    'other_options', '[]'::jsonb
                ) INTO v_variant_result;
            ELSE
                -- Si Collectibles NO tiene stock, compiten los vendors
                WITH vendor_competitors AS (
                    SELECT 
                        vpv.id AS vpv_id,
                        v.id AS vendor_id,
                        v.store_name AS vendor_name,
                        vp.price + vpv.price_adjustment AS total_price,
                        vpv.inventory_count AS stock,
                        (SELECT count(*) > 0 FROM public.vendor_shipping_connections vsc 
                         WHERE vsc.vendor_id = v.id AND vsc.connection_status = 'connected' AND vsc.provider IN ('dac', 'soydelivery', 'ues', 'mirtrans', 'pedidosya')
                        ) AS has_logistics
                    FROM public.vendor_product_variants vpv
                    JOIN public.vendor_products vp ON vp.id = vpv.vendor_product_id
                    JOIN public.vendors v ON v.id = vp.vendor_id
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
                            'price', total_price,
                            'stock', stock,
                            'has_logistics', has_logistics,
                            'final_score', final_score,
                            'is_collectibles', false
                        )
                        FROM ranked LIMIT 1
                    ),
                    'other_options', (
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'vpv_id', vpv_id,
                                'vendor_id', vendor_id,
                                'vendor_name', vendor_name,
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

            -- Añadimos la respuesta de esta variante al JSON global
            v_result := jsonb_set(v_result, ARRAY[v_variant.id::text], v_variant_result);
        END;
    END LOOP;

    RETURN v_result;
END;
$$;
