-- 1. Create stock_reservations table
CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reserved_until TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for stock_reservations
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all reservations" ON public.stock_reservations;
CREATE POLICY "Admins can manage all reservations" ON public.stock_reservations
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Users can view own reservations" ON public.stock_reservations;
CREATE POLICY "Users can view own reservations" ON public.stock_reservations
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = order_id AND (customer_id = auth.uid() OR customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())))
  );

-- 2. Add preorder_status to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preorder_status TEXT DEFAULT 'not_applicable';

-- 3. Function to release expired reservations
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS VOID AS $$
DECLARE
  v_res RECORD;
BEGIN
  -- Loop active expired reservations
  FOR v_res IN 
    SELECT DISTINCT order_id 
    FROM public.stock_reservations
    WHERE status = 'active' AND reserved_until < now()
  LOOP
    -- 1. Release reservations
    UPDATE public.stock_reservations
    SET status = 'released', updated_at = now()
    WHERE order_id = v_res.order_id AND status = 'active';

    -- 2. Expire order if it's still awaiting payment
    UPDATE public.orders
    SET status = 'expired',
        payment_status = 'expired',
        updated_at = now()
    WHERE id = v_res.order_id AND status = 'awaiting_payment';

    -- 3. Expire preorder_items
    UPDATE public.preorder_items
    SET status = 'expired', updated_at = now()
    WHERE order_item_id IN (
      SELECT id FROM public.order_items WHERE order_id = v_res.order_id
    ) AND status = 'awaiting_payment';
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to confirm payment atomically (consolidates reservations and decrements stock)
CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(p_order_id UUID, p_payment_provider TEXT, p_payment_ref TEXT)
RETURNS VOID AS $$
DECLARE
  v_res RECORD;
  v_has_preorder BOOLEAN := false;
BEGIN
  -- 1. Lock the order and update status
  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = 'approved',
      payment_provider = p_payment_provider,
      payment_provider_reference = p_payment_ref,
      payment_id = p_payment_ref,
      payment_processed_at = now(),
      updated_at = now()
  WHERE id = p_order_id AND status = 'awaiting_payment';

  -- 2. Complete reservations and decrement stock physically
  FOR v_res IN 
    SELECT * FROM public.stock_reservations 
    WHERE order_id = p_order_id AND status = 'active'
  LOOP
    UPDATE public.stock_reservations
    SET status = 'completed', updated_at = now()
    WHERE id = v_res.id;

    UPDATE public.product_variants
    SET inventory_count = inventory_count - v_res.quantity
    WHERE id = v_res.variant_id;
  END LOOP;

  -- 3. Update preorder items status to confirmed
  UPDATE public.preorder_items
  SET status = 'confirmed', updated_at = now()
  WHERE order_item_id IN (
    SELECT id FROM public.order_items WHERE order_id = p_order_id
  ) AND status = 'awaiting_payment';

  -- 4. Check if order has any preorder items and update order preorder_status
  SELECT EXISTS (
    SELECT 1 FROM public.preorder_items pi
    JOIN public.order_items oi ON pi.order_item_id = oi.id
    WHERE oi.order_id = p_order_id
  ) INTO v_has_preorder;

  IF v_has_preorder THEN
    UPDATE public.orders
    SET preorder_status = 'confirmed', updated_at = now()
    WHERE id = p_order_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Recreate create_order_atomic to use reservations
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
  
  -- Reservation fields
  v_reservation_minutes INTEGER;
  v_reserved_until TIMESTAMPTZ;
  v_is_preorder BOOLEAN := false;
  v_has_any_preorder BOOLEAN := false;
  v_order_item_id UUID;
BEGIN
  -- Verify stock for all items FIRST (within the transaction, counting active reservations)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
      -- Lock the variant row to prevent concurrent modifications
      PERFORM 1 FROM public.product_variants WHERE id = (v_item->>'variant_id')::uuid FOR UPDATE;

      -- Calculate available stock = physical stock - active reservations
      SELECT (
        inventory_count - COALESCE(
          (SELECT SUM(quantity) FROM public.stock_reservations WHERE variant_id = (v_item->>'variant_id')::uuid AND status = 'active' AND reserved_until > now()), 
          0
        )
      ) INTO v_variant_stock
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid;
      
      IF v_variant_stock < (v_item->>'quantity')::integer THEN
        RAISE EXCEPTION 'Stock insuficiente para la variante %: disponible %, solicitado %', 
          v_item->>'variant_id', v_variant_stock, v_item->>'quantity';
      END IF;
    END IF;
  END LOOP;

  -- Get reservation minutes from site_settings or use defaults
  SELECT (CASE WHEN value ~ '^[0-9]+$' THEN value::integer ELSE NULL END) INTO v_reservation_minutes
  FROM public.site_settings
  WHERE key = 'payment_reservation_minutes_' || p_payment_method;
  
  IF v_reservation_minutes IS NULL THEN
    IF p_payment_method = 'manual' THEN
      v_reservation_minutes := 1440; -- 24 hours
    ELSE
      v_reservation_minutes := 30; -- 30 minutes
    END IF;
  END IF;
  
  v_reserved_until := now() + (v_reservation_minutes || ' minutes')::interval;

  -- 1. Generate unique order number (COL-YYYYMMDD-XXXX)
  SELECT 'COL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(coalesce(count(*)+1, 1)::text, 4, '0')
  INTO v_order_number
  FROM public.orders
  WHERE created_at::date = now()::date;

  -- 2. Consolidate financial totals from suborders
  FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
  LOOP
    v_subtotal_products := v_subtotal_products + COALESCE((v_suborder->>'product_subtotal')::numeric, 0.00);
    v_total_shipping := v_total_shipping + COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00);
    v_total_discounts := v_total_discounts + COALESCE((v_suborder->>'discount_total')::numeric, 0.00);
    
    IF v_shipping_provider IS NULL AND v_suborder->>'shipping_provider' IS NOT NULL THEN
      v_shipping_provider := v_suborder->>'shipping_provider';
    END IF;
  END LOOP;

  -- 3. Resolve customer name
  v_cust_first_name := p_shipping_address->>'first_name';
  v_cust_last_name := p_shipping_address->>'last_name';
  v_customer_name := TRIM(COALESCE(v_cust_first_name, '') || ' ' || COALESCE(v_cust_last_name, ''));
  IF v_customer_name = '' THEN
    v_customer_name := 'Cliente';
  END IF;

  -- 4. Create master order (initial status: awaiting_payment, payment_status: not_started)
  INSERT INTO public.orders (
    customer_id, order_number, total_amount, currency, status, payment_status,
    payment_method, payment_provider, customer_email, customer_phone, customer_name,
    shipping_address, billing_address, affiliate_id, coupon_id,
    shipping_provider, terms_accepted, terms_accepted_at,
    accepted_terms_version, subtotal_products, total_shipping, total_discounts,
    preorder_status
  ) VALUES (
    p_customer_id, v_order_number, p_total_amount, p_currency, 'awaiting_payment', 'not_started',
    p_payment_method, p_payment_method, p_customer_email, p_customer_phone, v_customer_name,
    p_shipping_address, p_shipping_address, p_affiliate_id, p_coupon_id,
    v_shipping_provider, p_terms_accepted, p_terms_accepted_at,
    p_accepted_terms_version, v_subtotal_products, v_total_shipping, v_total_discounts,
    'not_applicable' -- will be updated if any preorder item is present
  )
  RETURNING id INTO v_order_id;

  -- 5. Create suborders and linked items
  FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
  LOOP
    DECLARE
      v_suborder_number TEXT;
      v_vendor_id UUID;
      v_vendor_store_id UUID;
      v_vendor_store_name TEXT;
      v_is_collectibles BOOLEAN;
      
      -- New logistical fields
      v_seller_type TEXT;
      v_shipping_mode TEXT;
      v_pickup_type TEXT;
      v_agency_id UUID;
      v_agency_name TEXT;
      v_dispatch_address_id UUID;
      v_internal_reference TEXT;
    BEGIN
      v_suborder_number := v_order_number || '-' || chr(65 + v_suborder_idx);
      v_suborder_idx := v_suborder_idx + 1;
      
      v_vendor_id := NULLIF(v_suborder->>'vendor_id', '')::uuid;
      v_vendor_store_id := NULLIF(v_suborder->>'vendor_store_id', '')::uuid;
      v_vendor_store_name := v_suborder->>'vendor_store_name';
      v_is_collectibles := COALESCE((v_suborder->>'is_collectibles_order')::boolean, false);
      
      -- Resolve new logistical fields from JSON
      v_seller_type := COALESCE(v_suborder->>'seller_type', CASE WHEN v_is_collectibles THEN 'platform' ELSE 'vendor' END);
      v_shipping_mode := v_suborder->>'shipping_mode';
      v_pickup_type := v_suborder->>'pickup_type';
      v_agency_id := NULLIF(v_suborder->>'agency_id', '')::uuid;
      v_agency_name := v_suborder->>'agency_name';
      v_dispatch_address_id := NULLIF(v_suborder->>'dispatch_address_id', '')::uuid;
      v_internal_reference := COALESCE(v_suborder->>'internal_reference', v_suborder_number);

      INSERT INTO public.order_suborders (
        parent_order_id, suborder_number, vendor_id, vendor_name, vendor_store_id, vendor_store_name, is_collectibles_order,
        product_subtotal, shipping_method, shipping_provider, shipping_cost, shipping_status,
        marketplace_commission_rate, marketplace_fee, payment_fee_share, vendor_gross_amount,
        vendor_net_amount, liquidation_status, status, discount_total,
        shipping_charged_to_customer, shipping_provider_cost, shipping_paid_by, shipping_billing_mode,
        shipping_margin, shipping_provider_invoice_status,
        seller_type, shipping_mode, pickup_type, agency_id, agency_name, dispatch_address_id, internal_reference
      ) VALUES (
        v_order_id, v_suborder_number, v_vendor_id, v_suborder->>'vendor_name', v_vendor_store_id, v_suborder->>'vendor_store_name', v_is_collectibles,
        (v_suborder->>'product_subtotal')::numeric, v_suborder->>'shipping_method', 
        v_suborder->>'shipping_provider', (v_suborder->>'shipping_cost')::numeric, 'pending',
        (v_suborder->>'marketplace_commission_rate')::numeric, (v_suborder->>'marketplace_fee')::numeric,
        0.00,
        (v_suborder->>'vendor_gross_amount')::numeric, (v_suborder->>'vendor_net_amount')::numeric,
        'pending', 'pending', COALESCE((v_suborder->>'discount_total')::numeric, 0.00),
        COALESCE((v_suborder->>'shipping_charged_to_customer')::numeric, 0.00),
        COALESCE((v_suborder->>'shipping_provider_cost')::numeric, 0.00),
        COALESCE(v_suborder->>'shipping_paid_by', 'collectibles'),
        COALESCE(v_suborder->>'shipping_billing_mode', 'collectibles_envios'),
        COALESCE((v_suborder->>'shipping_margin')::numeric, 0.00),
        COALESCE(v_suborder->>'shipping_provider_invoice_status', 'pending'),
        v_seller_type, v_shipping_mode, v_pickup_type, v_agency_id, v_agency_name, v_dispatch_address_id, v_internal_reference
      )
      RETURNING id INTO v_suborder_id;

      -- Insert items belonging to this suborder
      FOR v_item IN 
        SELECT * FROM jsonb_array_elements(p_items) AS item
        WHERE (item->>'vendor_id' = v_vendor_id::text) 
           OR (v_vendor_id IS NULL AND item->>'vendor_id' IS NULL)
      LOOP
        INSERT INTO public.order_items (
          order_id, suborder_id, product_id, variant_id, vendor_id, vendor_store_id,
          quantity, unit_price, total_price, product_name, sku, discount_total, final_total
        ) VALUES (
          v_order_id,
          v_suborder_id,
          (v_item->>'product_id')::uuid,
          NULLIF(v_item->>'variant_id', '')::uuid,
          v_vendor_id,
          NULLIF(v_item->>'vendor_store_id', '')::uuid,
          (v_item->>'quantity')::integer,
          (v_item->>'unit_price')::numeric,
          (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer,
          v_item->>'product_name',
          v_item->>'sku',
          COALESCE((v_item->>'discount_total')::numeric, 0.00),
          COALESCE((v_item->>'final_total')::numeric, 0.00)
        ) RETURNING id INTO v_order_item_id;

        -- Check if it is a preorder item
        SELECT EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.id = (v_item->>'product_id')::uuid
            AND (
              p.badge ILIKE '%preorder%' 
              OR p.badge ILIKE '%preventa%'
              OR EXISTS (
                SELECT 1 FROM public.badges b 
                WHERE (b.id::text = p.badge OR b.slug = p.badge)
                  AND (b.slug ILIKE '%preorder%' OR b.label ILIKE '%preorder%' OR b.label ILIKE '%preventa%')
              )
            )
        ) INTO v_is_preorder;

        IF v_is_preorder THEN
          v_has_any_preorder := true;
          
          INSERT INTO public.preorder_items (
            order_item_id,
            product_id,
            customer_id,
            status,
            estimated_arrival
          ) VALUES (
            v_order_item_id,
            (v_item->>'product_id')::uuid,
            p_customer_id,
            'awaiting_payment',
            now() + interval '30 days'
          );
        END IF;

        -- Create temporary stock reservation instead of physical decrement
        IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
          INSERT INTO public.stock_reservations (
            order_id,
            variant_id,
            quantity,
            reserved_until
          ) VALUES (
            v_order_id,
            (v_item->>'variant_id')::uuid,
            (v_item->>'quantity')::integer,
            v_reserved_until
          );
        END IF;
      END LOOP;

    END;
  END LOOP;

  -- If any preorder is present, update order preorder_status to awaiting_payment
  IF v_has_any_preorder THEN
    UPDATE public.orders
    SET preorder_status = 'awaiting_payment'
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
