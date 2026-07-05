-- ══════════════════════════════════════════════════════════════
-- MARKETPLACE P3: Refunds, Disputes, and Payout Protection Schema
-- ══════════════════════════════════════════════════════════════

-- 1. Modify payments table: add refund columns and update status check constraint
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider_refund_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_date TIMESTAMPTZ;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (
  status IN ('pending', 'redirected', 'approved', 'rejected', 'cancelled', 'refunded', 'partially_refunded', 'refund_pending', 'refund_failed', 'failed')
);

-- 2. Modify order_suborders status check constraint to support 'partially_refunded' and add discount_total
ALTER TABLE public.order_suborders ADD COLUMN IF NOT EXISTS discount_total NUMERIC(10,2) DEFAULT 0.00;

ALTER TABLE public.order_suborders DROP CONSTRAINT IF EXISTS order_suborders_status_check;
ALTER TABLE public.order_suborders ADD CONSTRAINT order_suborders_status_check CHECK (
  status IN ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'partially_refunded', 'claim_open')
);

-- 3. Recreate create_order_atomic to support discount_total in order_suborders
DROP FUNCTION IF EXISTS public.create_order_atomic(
  uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, jsonb, boolean, timestamp with time zone, text, boolean, boolean
);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_customer_id UUID,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_payment_method TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_shipping_address JSONB,
  p_affiliate_id UUID,
  p_coupon_id UUID,
  p_items JSONB,
  p_suborders JSONB,
  p_terms_accepted BOOLEAN DEFAULT false,
  p_terms_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_accepted_terms_version TEXT DEFAULT NULL,
  p_email_opt_in BOOLEAN DEFAULT false,
  p_whatsapp_opt_in BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_suborder JSONB;
  v_suborder_idx INTEGER := 0;
  v_suborder_id UUID;
  v_variant_stock INTEGER;
  v_shipping_provider TEXT := NULL;
  
  -- Financial consolidations
  v_subtotal_products NUMERIC := 0;
  v_total_shipping NUMERIC := 0;
  v_total_discounts NUMERIC := 0;
  
  v_cust_first_name TEXT;
  v_cust_last_name TEXT;
  v_customer_name TEXT;
BEGIN
  -- Verify stock for all items FIRST (within the transaction)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
      SELECT inventory_count INTO v_variant_stock
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid
      FOR UPDATE; -- Row-level lock to prevent race conditions

      IF v_variant_stock IS NULL THEN
        RAISE EXCEPTION 'Variante % no encontrada', v_item->>'variant_id';
      END IF;

      IF v_variant_stock < (v_item->>'quantity')::integer THEN
        RAISE EXCEPTION 'Stock insuficiente para variante %. Disponible: %, Solicitado: %',
          v_item->>'variant_id', v_variant_stock, v_item->>'quantity';
      END IF;
    END IF;
  END LOOP;

  -- Consolidate financial details from suborders
  FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
  LOOP
    v_subtotal_products := v_subtotal_products + COALESCE((v_suborder->>'product_subtotal')::numeric, 0.00);
    v_total_shipping := v_total_shipping + COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00);
    v_total_discounts := v_total_discounts + COALESCE((v_suborder->>'discount_total')::numeric, 0.00);
  END LOOP;

  -- Customer name extraction
  v_cust_first_name := COALESCE(p_shipping_address->>'first_name', '');
  v_cust_last_name := COALESCE(p_shipping_address->>'last_name', '');
  v_customer_name := TRIM(v_cust_first_name || ' ' || v_cust_last_name);

  -- Determine logistics provider from shipping address details
  IF p_shipping_address->>'shipping_method' = 'delivery' OR 
     p_shipping_address->>'shipping_method' = 'dac' OR
     p_shipping_address->>'shipping_method' = 'dac_home' OR
     p_shipping_address->>'shipping_method' = 'dac_agency' THEN
    IF p_shipping_address->>'department' = 'Montevideo' THEN
      v_shipping_provider := 'SoyDelivery';
    ELSE
      v_shipping_provider := 'DAC';
    END IF;
  END IF;

  -- Create order number using sequence
  v_order_number := 'ORDER-' || nextval('public.order_number_seq');

  -- Create the main order record
  INSERT INTO public.orders (
    customer_id, order_number, total_amount, currency, status, payment_status,
    payment_method, payment_provider, customer_email, customer_phone, customer_name,
    shipping_address, billing_data, affiliate_id, coupon_id,
    shipping_provider, terms_accepted, terms_accepted_at,
    accepted_terms_version, subtotal_products, total_shipping, total_discounts
  ) VALUES (
    p_customer_id, v_order_number, p_total_amount, p_currency, 'pending', 'pending_payment',
    p_payment_method, p_payment_method, p_customer_email, p_customer_phone, v_customer_name,
    p_shipping_address, p_shipping_address, p_affiliate_id, p_coupon_id,
    v_shipping_provider, p_terms_accepted, p_terms_accepted_at,
    p_accepted_terms_version, v_subtotal_products, v_total_shipping, v_total_discounts
  )
  RETURNING id INTO v_order_id;

  -- Create the suborders and linked items
  FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
  LOOP
    DECLARE
      v_suborder_number TEXT;
      v_vendor_id UUID;
      v_vendor_store_id UUID;
      v_vendor_store_name TEXT;
      v_is_collectibles BOOLEAN;
      v_suborder_id UUID;
    BEGIN
      v_suborder_number := v_order_number || '-' || chr(65 + v_suborder_idx);
      v_suborder_idx := v_suborder_idx + 1;
      
      v_vendor_id := NULLIF(v_suborder->>'vendor_id', '')::uuid;
      v_vendor_store_id := NULLIF(v_suborder->>'vendor_store_id', '')::uuid;
      v_vendor_store_name := v_suborder->>'vendor_store_name';
      v_is_collectibles := COALESCE((v_suborder->>'is_collectibles_order')::boolean, false);

      INSERT INTO public.order_suborders (
        parent_order_id, suborder_number, vendor_id, vendor_name, vendor_store_id, vendor_store_name, is_collectibles_order,
        product_subtotal, shipping_method, shipping_provider, shipping_cost, shipping_status,
        marketplace_commission_rate, marketplace_fee, payment_fee_share, vendor_gross_amount,
        vendor_net_amount, liquidation_status, status, discount_total
      ) VALUES (
        v_order_id, v_suborder_number, v_vendor_id, v_suborder->>'vendor_name', v_vendor_store_id, v_suborder->>'vendor_store_name', v_is_collectibles,
        (v_suborder->>'product_subtotal')::numeric, v_suborder->>'shipping_method', 
        v_suborder->>'shipping_provider', (v_suborder->>'shipping_cost')::numeric, 'pending',
        (v_suborder->>'marketplace_commission_rate')::numeric, (v_suborder->>'marketplace_fee')::numeric,
        0.00,
        (v_suborder->>'vendor_gross_amount')::numeric, (v_suborder->>'vendor_net_amount')::numeric,
        'pending', 'pending', COALESCE((v_suborder->>'discount_total')::numeric, 0.00)
      )
      RETURNING id INTO v_suborder_id;

      -- Insert items belonging to this suborder
      INSERT INTO public.order_items (
        order_id, suborder_id, product_id, variant_id, vendor_id, vendor_store_id,
        quantity, unit_price, total_price, product_name, sku, discount_total, final_total
      )
      SELECT
        v_order_id,
        v_suborder_id,
        (item->>'product_id')::uuid,
        NULLIF(item->>'variant_id', '')::uuid,
        v_vendor_id,
        NULLIF(item->>'vendor_store_id', '')::uuid,
        (item->>'quantity')::integer,
        (item->>'unit_price')::numeric,
        (item->>'unit_price')::numeric * (item->>'quantity')::integer,
        item->>'product_name',
        item->>'sku',
        COALESCE((item->>'discount_total')::numeric, 0.00),
        COALESCE((item->>'final_total')::numeric, (item->>'unit_price')::numeric)
      FROM jsonb_array_elements(p_items) AS item
      WHERE 
        (v_vendor_store_id IS NOT NULL AND (item->>'vendor_store_id')::uuid = v_vendor_store_id) OR
        (v_vendor_store_id IS NULL AND 
          (v_vendor_id IS NOT NULL AND (item->>'vendor_id')::uuid = v_vendor_id AND (item->>'vendor_store_id' IS NULL OR item->>'vendor_store_id' = ''))
        ) OR
        (v_vendor_store_id IS NULL AND v_vendor_id IS NULL AND 
          (item->>'vendor_id' IS NULL OR item->>'vendor_id' = '') AND 
          (item->>'vendor_store_id' IS NULL OR item->>'vendor_store_id' = '')
        );
    END;
  END LOOP;

  -- Mark abandoned checkout as converted if exists
  UPDATE public.abandoned_checkouts
  SET status = 'converted', updated_at = now()
  WHERE email = p_customer_email AND status = 'abandoned';

  -- Upsert customer consents
  INSERT INTO public.customer_consents (email, phone, email_marketing_opt_in, whatsapp_opt_in)
  VALUES (p_customer_email, p_customer_phone, p_email_opt_in, p_whatsapp_opt_in)
  ON CONFLICT (email) DO UPDATE SET
    phone = EXCLUDED.phone,
    email_marketing_opt_in = EXCLUDED.email_marketing_opt_in,
    whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
    updated_at = now();

  -- Return details
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'total_amount', p_total_amount,
    'items_count', jsonb_array_length(p_items),
    'suborders_count', v_suborder_idx
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create refunds table
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_refund_id TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'partial', 'failed', 'rejected')
  ),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  api_response JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for refunds
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all refunds" ON public.refunds;
CREATE POLICY "Admins can manage all refunds" ON public.refunds
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Vendors can view their own refunds" ON public.refunds;
CREATE POLICY "Vendors can view their own refunds" ON public.refunds
  FOR SELECT TO authenticated USING (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "Customers can view their own refunds" ON public.refunds;
CREATE POLICY "Customers can view their own refunds" ON public.refunds
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = refunds.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- 5. Create payment_disputes table for chargebacks
CREATE TABLE IF NOT EXISTS public.payment_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  dispute_reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'refunded')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for payment_disputes
ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all disputes" ON public.payment_disputes;
CREATE POLICY "Admins can manage all disputes" ON public.payment_disputes
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Vendors can view disputes on their suborders" ON public.payment_disputes;
CREATE POLICY "Vendors can view disputes on their suborders" ON public.payment_disputes
  FOR SELECT TO authenticated USING (auth.uid() = vendor_id);

-- 6. Create payment_audit_logs table
CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES public.refunds(id) ON DELETE SET NULL,
  provider TEXT,
  amount NUMERIC(10,2),
  api_response JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for payment_audit_logs
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins can manage payment audit logs" ON public.payment_audit_logs;
CREATE POLICY "Only admins can manage payment audit logs" ON public.payment_audit_logs
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- 7. Modify generate_vendor_liquidations function to exclude suborders with open disputes
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
      AND s.status NOT IN ('cancelled', 'refunded', 'partially_refunded')
      -- no active claims in order_disputes
      AND NOT EXISTS (
        SELECT 1 FROM public.order_disputes d
        WHERE d.order_id = s.parent_order_id
          AND d.vendor_id = s.vendor_id
          AND d.status = 'open'
      )
      -- no active disputes/chargebacks in payment_disputes
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_disputes pd
        WHERE pd.order_id = s.parent_order_id
          AND pd.vendor_id = s.vendor_id
          AND pd.status = 'open'
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
  END LOOP;

  RETURN jsonb_build_object(
    'liquidations_generated', v_count,
    'suborders_processed', v_suborder_count,
    'payment_date', v_wednesday
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
