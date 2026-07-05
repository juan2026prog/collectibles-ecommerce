-- ══════════════════════════════════════════════════════════════
-- MARKETPLACE P3 HOTFIX: Vendor Financial Adjustments & Manual Status
-- ══════════════════════════════════════════════════════════════

-- 1. Create vendor_financial_adjustments table
CREATE TABLE IF NOT EXISTS public.vendor_financial_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES public.refunds(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('refund_debit', 'chargeback_debit', 'manual_credit', 'manual_debit')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0.00),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_to_liquidation_id UUID REFERENCES public.vendor_liquidations(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for vendor_financial_adjustments
ALTER TABLE public.vendor_financial_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all adjustments" ON public.vendor_financial_adjustments;
CREATE POLICY "Admins can manage all adjustments" ON public.vendor_financial_adjustments
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Vendors can view their own adjustments" ON public.vendor_financial_adjustments;
CREATE POLICY "Vendors can view their own adjustments" ON public.vendor_financial_adjustments
  FOR SELECT TO authenticated USING (auth.uid() = vendor_id);

-- 2. Modify refunds table check constraint to support manual_refund_required status
ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_status_check CHECK (
  status IN ('pending', 'processing', 'completed', 'partial', 'failed', 'rejected', 'manual_refund_required')
);

-- 3. Modify payments table check constraint to support manual_refund_required status
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (
  status IN ('pending', 'redirected', 'approved', 'rejected', 'cancelled', 'refunded', 'partially_refunded', 'refund_pending', 'refund_failed', 'failed', 'manual_refund_required')
);

-- 4. Recreate generate_vendor_liquidations to support automatic adjustments deduction
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

  -- Loop through each vendor that has eligible suborders OR pending adjustments
  FOR v_vendor_id IN 
    SELECT DISTINCT vendor_id FROM (
      -- Vendors with eligible suborders
      SELECT DISTINCT s.vendor_id 
      FROM public.order_suborders s
      JOIN public.orders o ON o.id = s.parent_order_id
      WHERE s.vendor_id IS NOT NULL
        AND s.is_collectibles_order = false
        AND o.status = 'paid'
        AND o.payment_status = 'approved'
        AND s.shipping_status = 'delivered'
        AND s.delivered_at <= now() - INTERVAL '48 hours'
        AND s.liquidation_status = 'pending'
        AND s.status NOT IN ('cancelled', 'refunded', 'partially_refunded')
        AND NOT EXISTS (
          SELECT 1 FROM public.order_disputes d
          WHERE d.order_id = s.parent_order_id
            AND d.vendor_id = s.vendor_id
            AND d.status = 'open'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.payment_disputes pd
          WHERE pd.order_id = s.parent_order_id
            AND pd.vendor_id = s.vendor_id
            AND pd.status = 'open'
        )
      UNION
      -- Vendors with pending adjustments
      SELECT DISTINCT vendor_id
      FROM public.vendor_financial_adjustments
      WHERE status = 'pending'
    ) AS active_vendors
  LOOP
    -- Initialize variables
    v_gross_sales := 0.00;
    v_shipping_collected := 0.00;
    v_marketplace_fees := 0.00;
    v_payment_fees := 0.00;
    v_net_amount := 0.00;

    -- Calculate totals for this vendor's eligible suborders (if any)
    SELECT 
      COALESCE(SUM(s.product_subtotal), 0.00),
      COALESCE(SUM(s.shipping_cost), 0.00),
      COALESCE(SUM(s.marketplace_fee), 0.00),
      COALESCE(SUM(s.payment_fee_share), 0.00),
      COALESCE(SUM(s.vendor_net_amount), 0.00)
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
      AND s.status NOT IN ('cancelled', 'refunded', 'partially_refunded')
      AND NOT EXISTS (
        SELECT 1 FROM public.order_disputes d
        WHERE d.order_id = s.parent_order_id
          AND d.vendor_id = s.vendor_id
          AND d.status = 'open'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_disputes pd
        WHERE pd.order_id = s.parent_order_id
          AND pd.vendor_id = s.vendor_id
          AND pd.status = 'open'
      );

    -- Calculate adjustments for this vendor
    DECLARE
      v_net_adjustment NUMERIC(10,2) := 0.00;
    BEGIN
      -- Sum adjustments: credits add, debits subtract
      SELECT COALESCE(SUM(
        CASE 
          WHEN type = 'manual_credit' THEN amount
          ELSE -amount
        END
      ), 0.00)
      INTO v_net_adjustment
      FROM public.vendor_financial_adjustments
      WHERE vendor_id = v_vendor_id AND status = 'pending';
      
      -- Apply adjustment
      v_net_amount := v_net_amount + v_net_adjustment;
      
      -- If there are no eligible suborders AND net_adjustment is zero, we do not create a liquidation
      IF v_net_adjustment = 0.00 AND v_gross_sales = 0.00 THEN
         CONTINUE;
      END IF;

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
        v_net_adjustment,
        v_net_amount,
        'eligible',
        v_wednesday
      )
      RETURNING id INTO v_liq_id;

      -- Update all pending adjustments to applied
      UPDATE public.vendor_financial_adjustments
      SET status = 'applied',
          applied_to_liquidation_id = v_liq_id,
          applied_at = now(),
          updated_at = now()
      WHERE vendor_id = v_vendor_id AND status = 'pending';
      
      -- Link suborders and create liquidation items (if any)
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
          AND s.status NOT IN ('cancelled', 'refunded', 'partially_refunded')
          AND NOT EXISTS (
            SELECT 1 FROM public.order_disputes d
            WHERE d.order_id = s.parent_order_id
              AND d.vendor_id = s.vendor_id
              AND d.status = 'open'
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.payment_disputes pd
            WHERE pd.order_id = s.parent_order_id
              AND pd.vendor_id = s.vendor_id
              AND pd.status = 'open'
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
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'liquidations_generated', v_count,
    'suborders_processed', v_suborder_count,
    'payment_date', v_wednesday
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
