-- ==============================================================================
-- MARKETPLACE P2.1: VALIDATION FIXES & BUY BOX V2 REASON
-- ==============================================================================

-- 1. FASE 1: Auditoría de Facturación
ALTER TABLE public.order_suborders
  ADD COLUMN IF NOT EXISTS invoice_status TEXT DEFAULT 'pending' CHECK (invoice_status IN ('pending', 'emitted', 'error', 'not_required')),
  ADD COLUMN IF NOT EXISTS invoice_reference TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMPTZ;

-- 2. FASE 8: Validación de Estados (Sincronización padre-hija)
CREATE OR REPLACE FUNCTION public.sync_parent_order_status()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_id UUID;
  v_total_suborders INT;
  v_shipped_count INT;
  v_delivered_count INT;
  v_cancelled_count INT;
BEGIN
  v_parent_id := NEW.parent_order_id;

  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'shipped' OR status = 'delivered'),
    COUNT(*) FILTER (WHERE status = 'delivered'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO 
    v_total_suborders,
    v_shipped_count,
    v_delivered_count,
    v_cancelled_count
  FROM public.order_suborders
  WHERE parent_order_id = v_parent_id;

  -- Logic for parent status
  IF v_total_suborders > 0 THEN
    IF v_cancelled_count = v_total_suborders THEN
      UPDATE public.orders SET status = 'cancelled' WHERE id = v_parent_id;
    ELSIF v_delivered_count = v_total_suborders THEN
      UPDATE public.orders SET status = 'delivered', shipping_status = 'delivered' WHERE id = v_parent_id;
    ELSIF v_shipped_count = v_total_suborders THEN
      UPDATE public.orders SET status = 'shipped', shipping_status = 'shipped' WHERE id = v_parent_id;
    ELSIF v_shipped_count > 0 OR v_delivered_count > 0 THEN
      UPDATE public.orders SET status = 'partially_shipped', shipping_status = 'partially_shipped' WHERE id = v_parent_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_parent_order_status ON public.order_suborders;
CREATE TRIGGER trg_sync_parent_order_status
  AFTER UPDATE OF status ON public.order_suborders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_parent_order_status();


-- 3. FASE 9: Liquidaciones Automáticas
-- Ejecutar barrido de Miércoles: payment_status = paid, shipping = delivered + 48hs, sin reclamos.
CREATE OR REPLACE FUNCTION public.generate_weekly_vendor_liquidations()
RETURNS VOID AS $$
DECLARE
  v_suborder RECORD;
  v_liquidation_id UUID;
  v_period_start TIMESTAMPTZ := date_trunc('week', now() - INTERVAL '1 week');
  v_period_end TIMESTAMPTZ := date_trunc('week', now());
BEGIN
  -- Iterate over all eligible suborders
  FOR v_suborder IN 
    SELECT s.*, o.payment_status 
    FROM public.order_suborders s
    JOIN public.orders o ON o.id = s.parent_order_id
    WHERE s.liquidation_status = 'pending'
      AND s.status = 'delivered'
      AND s.delivered_at <= now() - INTERVAL '48 hours'
      AND o.payment_status = 'paid'
      AND s.vendor_id IS NOT NULL
  LOOP
    -- 1. Get or create a pending liquidation batch for the vendor
    SELECT id INTO v_liquidation_id 
    FROM public.vendor_liquidations 
    WHERE vendor_id = v_suborder.vendor_id AND status = 'pending'
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.vendor_liquidations (vendor_id, period_start, period_end, status)
      VALUES (v_suborder.vendor_id, v_period_start, v_period_end, 'pending')
      RETURNING id INTO v_liquidation_id;
    END IF;

    -- 2. Insert item into batch
    INSERT INTO public.vendor_liquidation_items (
      liquidation_id, suborder_id, gross_amount, product_subtotal, shipping_amount, marketplace_fee, payment_fee_share, net_amount
    ) VALUES (
      v_liquidation_id, v_suborder.id, v_suborder.vendor_gross_amount, v_suborder.product_subtotal, v_suborder.shipping_cost, v_suborder.marketplace_fee, v_suborder.payment_fee_share, v_suborder.vendor_net_amount
    );

    -- 3. Update liquidation totals
    UPDATE public.vendor_liquidations
    SET 
      gross_sales = gross_sales + v_suborder.vendor_gross_amount,
      shipping_collected = shipping_collected + v_suborder.shipping_cost,
      marketplace_fees = marketplace_fees + v_suborder.marketplace_fee,
      payment_fees = payment_fees + v_suborder.payment_fee_share,
      net_amount = net_amount + v_suborder.vendor_net_amount,
      updated_at = now()
    WHERE id = v_liquidation_id;

    -- 4. Mark suborder as included in batch
    UPDATE public.order_suborders
    SET liquidation_status = 'included_in_batch',
        liquidation_id = v_liquidation_id,
        updated_at = now()
    WHERE id = v_suborder.id;

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. BUY BOX V2: Añadir Regla 5 (Auditoría de decisión)
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
                        'vendor_name', 'Collectibles Uruguay',
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
