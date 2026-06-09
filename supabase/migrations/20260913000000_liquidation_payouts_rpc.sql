-- ══════════════════════════════════════════════════════════════
-- MARKETPLACE P2: Weekly Liquidation RPC Functions
-- ══════════════════════════════════════════════════════════════

-- 1. generate_vendor_liquidations
CREATE OR REPLACE FUNCTION public.generate_vendor_liquidations(p_admin_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_vendor_id UUID;
  v_liq_id UUID;
  v_suborder RECORD;
  v_gross_sales NUMERIC(10,2);
  v_shipping_collected NUMERIC(10,2);
  v_marketplace_fees NUMERIC(10,2);
  v_payment_fees NUMERIC(10,2);
  v_net_amount NUMERIC(10,2);
  v_count INTEGER := 0;
  v_suborder_count INTEGER := 0;
  v_wednesday DATE;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND is_admin = true) THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de administrador.';
  END IF;

  -- Calculate next scheduled payment date (next Wednesday)
  v_wednesday := CASE 
    WHEN EXTRACT(ISODOW FROM now()) = 3 THEN CURRENT_DATE
    ELSE CURRENT_DATE + ((3 - EXTRACT(ISODOW FROM now()) + 7)::integer % 7)
  END;

  -- Loop through each vendor that has eligible suborders
  FOR v_vendor_id IN 
    SELECT DISTINCT s.vendor_id 
    FROM public.order_suborders s
    JOIN public.orders o ON o.id = s.parent_order_id
    WHERE s.vendor_id IS NOT NULL
      AND s.is_collectibles_order = false
      -- parent order status is paid
      AND o.status = 'paid'
      AND o.payment_status = 'approved'
      -- shipping_status is delivered
      AND s.shipping_status = 'delivered'
      AND s.delivered_at <= now() - INTERVAL '48 hours'
      -- liquidation_status is pending
      AND s.liquidation_status = 'pending'
      -- not cancelled or refunded
      AND s.status NOT IN ('cancelled', 'refunded')
      -- no active claims
      AND NOT EXISTS (
        SELECT 1 FROM public.order_disputes d
        WHERE d.order_id = s.parent_order_id
          AND d.vendor_id = s.vendor_id
          AND d.status = 'open'
      )
  LOOP
    -- Calculate totals for this vendor's eligible suborders
    SELECT 
      SUM(s.product_subtotal),
      SUM(s.shipping_cost),
      SUM(s.marketplace_fee),
      SUM(s.payment_fee_share),
      SUM(s.vendor_net_amount)
    INTO 
      v_gross_sales,
      v_shipping_collected,
      v_marketplace_fees,
      v_payment_fees,
      v_net_amount
    FROM public.order_suborders s
    JOIN public.orders o ON o.id = s.parent_order_id
    WHERE s.vendor_id = v_vendor_id
      AND s.is_collectibles_order = false
      AND o.status = 'paid'
      AND o.payment_status = 'approved'
      AND s.shipping_status = 'delivered'
      AND s.delivered_at <= now() - INTERVAL '48 hours'
      AND s.liquidation_status = 'pending'
      AND s.status NOT IN ('cancelled', 'refunded')
      AND NOT EXISTS (
        SELECT 1 FROM public.order_disputes d
        WHERE d.order_id = s.parent_order_id
          AND d.vendor_id = s.vendor_id
          AND d.status = 'open'
      );

    -- Create a liquidation record
    INSERT INTO public.vendor_liquidations (
      vendor_id,
      period_start,
      period_end,
      gross_sales,
      shipping_collected,
      marketplace_fees,
      payment_fees,
      adjustments,
      net_amount,
      status,
      scheduled_payment_date
    ) VALUES (
      v_vendor_id,
      COALESCE((SELECT MAX(period_end) FROM public.vendor_liquidations WHERE vendor_id = v_vendor_id), now() - INTERVAL '1 year'),
      now(),
      v_gross_sales,
      v_shipping_collected,
      v_marketplace_fees,
      v_payment_fees,
      0.00,
      v_net_amount,
      'eligible',
      v_wednesday
    )
    RETURNING id INTO v_liq_id;

    -- Link suborders and create liquidation items
    FOR v_suborder IN 
      SELECT s.id, s.vendor_gross_amount, s.product_subtotal, s.shipping_cost, s.marketplace_fee, s.payment_fee_share, s.vendor_net_amount
      FROM public.order_suborders s
      JOIN public.orders o ON o.id = s.parent_order_id
      WHERE s.vendor_id = v_vendor_id
        AND s.is_collectibles_order = false
        AND o.status = 'paid'
        AND o.payment_status = 'approved'
        AND s.shipping_status = 'delivered'
        AND s.delivered_at <= now() - INTERVAL '48 hours'
        AND s.liquidation_status = 'pending'
        AND s.status NOT IN ('cancelled', 'refunded')
        AND NOT EXISTS (
          SELECT 1 FROM public.order_disputes d
          WHERE d.order_id = s.parent_order_id
            AND d.vendor_id = s.vendor_id
            AND d.status = 'open'
        )
    LOOP
      -- Insert into liquidation items
      INSERT INTO public.vendor_liquidation_items (
        liquidation_id,
        suborder_id,
        gross_amount,
        product_subtotal,
        shipping_amount,
        marketplace_fee,
        payment_fee_share,
        net_amount
      ) VALUES (
        v_liq_id,
        v_suborder.id,
        v_suborder.vendor_gross_amount,
        v_suborder.product_subtotal,
        v_suborder.shipping_cost,
        v_suborder.marketplace_fee,
        v_suborder.payment_fee_share,
        v_suborder.vendor_net_amount
      );

      -- Update suborder status to included_in_batch
      UPDATE public.order_suborders
      SET liquidation_status = 'included_in_batch',
          liquidation_id = v_liq_id,
          updated_at = now()
      WHERE id = v_suborder.id;

      v_suborder_count := v_suborder_count + 1;
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'liquidations_generated', v_count,
    'suborders_processed', v_suborder_count,
    'payment_date', v_wednesday
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. mark_liquidation_as_paid
CREATE OR REPLACE FUNCTION public.mark_liquidation_as_paid(p_admin_id UUID, p_liquidation_id UUID, p_reference TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND is_admin = true) THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de administrador.';
  END IF;

  -- Update liquidation record
  UPDATE public.vendor_liquidations
  SET status = 'paid',
      paid_at = now(),
      payment_reference = p_reference,
      updated_at = now()
  WHERE id = p_liquidation_id;

  -- Update linked suborders status to paid
  UPDATE public.order_suborders
  SET liquidation_status = 'paid',
      updated_at = now()
  WHERE liquidation_id = p_liquidation_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
