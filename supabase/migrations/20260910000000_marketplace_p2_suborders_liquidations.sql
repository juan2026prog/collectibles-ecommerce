-- ══════════════════════════════════════════════════════════════
-- MARKETPLACE P2: Schema for Suborders and Weekly Liquidations
-- ══════════════════════════════════════════════════════════════

-- 1. Create sequences for numbers
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS public.suborder_number_seq START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS public.liquidation_number_seq START WITH 1001;

-- 2. Alter orders table to support consolidated financial fields
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE DEFAULT 'ORDER-' || nextval('public.order_number_seq'),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS subtotal_products NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_shipping NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_payment_fee NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_discounts NUMERIC(10,2) DEFAULT 0.00;

-- Update existing orders to ensure they have an order number if null
UPDATE public.orders 
SET order_number = 'ORDER-' || nextval('public.order_number_seq')
WHERE order_number IS NULL;

-- 3. Create vendor liquidations table
CREATE TABLE IF NOT EXISTS public.vendor_liquidations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  liquidation_number TEXT NOT NULL UNIQUE DEFAULT 'LIQ-' || nextval('public.liquidation_number_seq'),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  gross_sales NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  shipping_collected NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  marketplace_fees NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  payment_fees NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  adjustments NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  net_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'eligible', 'included_in_batch', 'paid', 'blocked', 'cancelled')),
  scheduled_payment_date DATE,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create suborders table
CREATE TABLE IF NOT EXISTS public.order_suborders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  suborder_number TEXT NOT NULL UNIQUE DEFAULT 'SUB-' || nextval('public.suborder_number_seq'),
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  vendor_name TEXT,
  is_collectibles_order BOOLEAN NOT NULL DEFAULT false,
  product_subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  shipping_method TEXT,
  shipping_provider TEXT,
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  shipping_status TEXT NOT NULL DEFAULT 'pending',
  tracking_number TEXT,
  tracking_url TEXT,
  marketplace_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  marketplace_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  payment_fee_share NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  vendor_gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  vendor_net_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  liquidation_status TEXT NOT NULL DEFAULT 'pending' CHECK (liquidation_status IN ('pending', 'eligible', 'included_in_batch', 'paid', 'blocked', 'cancelled')),
  liquidation_id UUID REFERENCES public.vendor_liquidations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'claim_open')),
  delivered_at TIMESTAMPTZ,
  eligible_for_liquidation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Alter order_items to support suborders
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS final_total NUMERIC(10,2) DEFAULT 0.00;

-- 6. Create vendor liquidation items table
CREATE TABLE IF NOT EXISTS public.vendor_liquidation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidation_id UUID NOT NULL REFERENCES public.vendor_liquidations(id) ON DELETE CASCADE,
  suborder_id UUID NOT NULL REFERENCES public.order_suborders(id) ON DELETE CASCADE,
  gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  product_subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  shipping_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  marketplace_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  payment_fee_share NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  net_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. RLS Policies
ALTER TABLE public.order_suborders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_liquidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_liquidation_items ENABLE ROW LEVEL SECURITY;

-- Suborders policies
DROP POLICY IF EXISTS "Vendors can view their own suborders" ON public.order_suborders;
CREATE POLICY "Vendors can view their own suborders" ON public.order_suborders
  FOR SELECT TO authenticated USING (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "Vendors can update their own suborders" ON public.order_suborders;
CREATE POLICY "Vendors can update their own suborders" ON public.order_suborders
  FOR UPDATE TO authenticated USING (auth.uid() = vendor_id) WITH CHECK (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "Customers can view their own suborders" ON public.order_suborders;
CREATE POLICY "Customers can view their own suborders" ON public.order_suborders
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_suborders.parent_order_id
      AND orders.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage all suborders" ON public.order_suborders;
CREATE POLICY "Admins manage all suborders" ON public.order_suborders
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Liquidations policies
DROP POLICY IF EXISTS "Vendors can view their own liquidations" ON public.vendor_liquidations;
CREATE POLICY "Vendors can view their own liquidations" ON public.vendor_liquidations
  FOR SELECT TO authenticated USING (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "Admins manage all liquidations" ON public.vendor_liquidations;
CREATE POLICY "Admins manage all liquidations" ON public.vendor_liquidations
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Liquidation Items policies
DROP POLICY IF EXISTS "Vendors can view their own liquidation items" ON public.vendor_liquidation_items;
CREATE POLICY "Vendors can view their own liquidation items" ON public.vendor_liquidation_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.vendor_liquidations
      WHERE vendor_liquidations.id = vendor_liquidation_items.liquidation_id
      AND vendor_liquidations.vendor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage all liquidation items" ON public.vendor_liquidation_items;
CREATE POLICY "Admins manage all liquidation items" ON public.vendor_liquidation_items
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- 8. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_suborders_parent ON public.order_suborders(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_order_suborders_vendor ON public.order_suborders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_suborders_status ON public.order_suborders(status);
CREATE INDEX IF NOT EXISTS idx_order_suborders_liquidation ON public.order_suborders(liquidation_id);
CREATE INDEX IF NOT EXISTS idx_order_items_suborder ON public.order_items(suborder_id);
CREATE INDEX IF NOT EXISTS idx_vendor_liquidations_vendor ON public.vendor_liquidations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_liquidations_status ON public.vendor_liquidations(status);
CREATE INDEX IF NOT EXISTS idx_vendor_liquidation_items_liq ON public.vendor_liquidation_items(liquidation_id);
CREATE INDEX IF NOT EXISTS idx_vendor_liquidation_items_sub ON public.vendor_liquidation_items(suborder_id);

-- 9. Helper function: get_vendor_commission_rate
CREATE OR REPLACE FUNCTION public.get_vendor_commission_rate(p_vendor_id UUID)
RETURNS NUMERIC(5,2) AS $$
DECLARE
  v_created_at TIMESTAMPTZ;
  v_base_commission NUMERIC(5,2);
BEGIN
  -- Check if vendor exists and get created_at & base_commission_rate
  SELECT created_at, base_commission_rate
  INTO v_created_at, v_base_commission
  FROM public.vendors
  WHERE id = p_vendor_id;

  -- 1. If base_commission_rate is set explicitly on the vendor, use it
  IF v_base_commission IS NOT NULL THEN
    RETURN v_base_commission;
  END IF;

  -- 2. First 2 months of vendor: 3%
  IF v_created_at IS NOT NULL AND v_created_at > now() - INTERVAL '2 months' THEN
    RETURN 3.00;
  END IF;

  -- 3. Fallback: 5%
  RETURN 5.00;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. DROP previous signatures of create_order_atomic to prevent conflict
DROP FUNCTION IF EXISTS public.create_order_atomic(
  uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, boolean, timestamp with time zone, text, boolean, boolean
);

-- 11. Create the new create_order_atomic function supporting suborders
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
      v_is_collectibles BOOLEAN;
    BEGIN
      v_suborder_number := v_order_number || '-' || chr(65 + v_suborder_idx);
      v_suborder_idx := v_suborder_idx + 1;
      
      v_vendor_id := NULLIF(v_suborder->>'vendor_id', '')::uuid;
      v_is_collectibles := COALESCE((v_suborder->>'is_collectibles_order')::boolean, false);

      INSERT INTO public.order_suborders (
        parent_order_id, suborder_number, vendor_id, vendor_name, is_collectibles_order,
        product_subtotal, shipping_method, shipping_provider, shipping_cost, shipping_status,
        marketplace_commission_rate, marketplace_fee, payment_fee_share, vendor_gross_amount,
        vendor_net_amount, liquidation_status, status
      ) VALUES (
        v_order_id, v_suborder_number, v_vendor_id, v_suborder->>'vendor_name', v_is_collectibles,
        (v_suborder->>'product_subtotal')::numeric, v_suborder->>'shipping_method', 
        v_suborder->>'shipping_provider', (v_suborder->>'shipping_cost')::numeric, 'pending',
        (v_suborder->>'marketplace_commission_rate')::numeric, (v_suborder->>'marketplace_fee')::numeric,
        0.00,
        (v_suborder->>'vendor_gross_amount')::numeric, (v_suborder->>'vendor_net_amount')::numeric,
        'pending', 'pending'
      )
      RETURNING id INTO v_suborder_id;

      -- Insert items belonging to this suborder
      INSERT INTO public.order_items (
        order_id, suborder_id, product_id, variant_id, vendor_id, 
        quantity, unit_price, total_price, product_name, sku, discount_total, final_total
      )
      SELECT
        v_order_id,
        v_suborder_id,
        (item->>'product_id')::uuid,
        NULLIF(item->>'variant_id', '')::uuid,
        v_vendor_id,
        (item->>'quantity')::integer,
        (item->>'unit_price')::numeric,
        (item->>'unit_price')::numeric * (item->>'quantity')::integer,
        item->>'product_name',
        item->>'sku',
        COALESCE((item->>'discount_total')::numeric, 0.00),
        COALESCE((item->>'final_total')::numeric, (item->>'unit_price')::numeric)
      FROM jsonb_array_elements(p_items) AS item
      WHERE 
        (v_vendor_id IS NOT NULL AND (item->>'vendor_id')::uuid = v_vendor_id) OR
        (v_vendor_id IS NULL AND (item->>'vendor_id' IS NULL OR item->>'vendor_id' = ''));
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
