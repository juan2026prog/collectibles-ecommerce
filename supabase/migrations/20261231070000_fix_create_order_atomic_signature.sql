-- Migration: 20261231070000_fix_create_order_atomic_signature.sql
-- Description: Unifies create_order_atomic signature to support all 32 parameters sent by create-order Edge Function and checkout.

-- 1. Drop previous overload signatures if any to ensure clean PostgREST schema cache resolution
DROP FUNCTION IF EXISTS public.create_order_atomic(
  UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, JSONB, JSONB,
  BOOLEAN, TIMESTAMPTZ, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC
);

DROP FUNCTION IF EXISTS public.create_order_atomic(
  UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, JSONB, JSONB,
  BOOLEAN, TIMESTAMPTZ, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN
);

-- 2. Create canonical create_order_atomic with complete 32 parameter set and appropriate DEFAULT values
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_customer_id UUID,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_payment_method TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT DEFAULT NULL,
  p_shipping_address JSONB DEFAULT '{}'::jsonb,
  p_affiliate_id UUID DEFAULT NULL,
  p_coupon_id UUID DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_suborders JSONB DEFAULT '[]'::jsonb,
  p_terms_accepted BOOLEAN DEFAULT false,
  p_terms_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_accepted_terms_version TEXT DEFAULT NULL,
  p_email_opt_in BOOLEAN DEFAULT false,
  p_whatsapp_opt_in BOOLEAN DEFAULT false,
  p_logistics_consent BOOLEAN DEFAULT false,
  p_display_currency TEXT DEFAULT 'UYU',
  p_display_subtotal NUMERIC DEFAULT NULL,
  p_display_shipping NUMERIC DEFAULT NULL,
  p_display_total NUMERIC DEFAULT NULL,
  p_fx_rate NUMERIC DEFAULT NULL,
  p_fx_rate_source TEXT DEFAULT NULL,
  p_shipping_weight_kg NUMERIC DEFAULT NULL,
  p_shipping_cost_ars NUMERIC DEFAULT NULL,
  p_shipping_cost_usd NUMERIC DEFAULT NULL,
  p_mbe_service_type TEXT DEFAULT NULL,
  p_shipping_weight_real_kg NUMERIC DEFAULT NULL,
  p_shipping_weight_volumetric_kg NUMERIC DEFAULT NULL,
  p_shipping_weight_chargeable_kg NUMERIC DEFAULT NULL,
  p_shipping_rule_applied TEXT DEFAULT NULL,
  p_is_shipping_quote_required BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  
  -- Counter & Handy Invoice
  v_counter_val INTEGER;
  v_handy_invoice_num INTEGER := NULL;
  v_country TEXT;
  v_caller_role TEXT;
BEGIN
  -- 1. Enforce execution role: service_role, postgres, supabase_admin, or admin profile
  v_caller_role := current_setting('role', true);
  IF v_caller_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
      RAISE EXCEPTION 'Access denied: create_order_atomic must be called via backend service_role or admin.';
    END IF;
  END IF;

  -- 2. Financial Invariants
  IF p_total_amount < 0 THEN
    RAISE EXCEPTION 'Invalid total amount: %', p_total_amount;
  END IF;

  IF NOT p_terms_accepted THEN
    RAISE EXCEPTION 'Terms and conditions must be accepted';
  END IF;

  -- Extract country from shipping address
  v_country := LOWER(COALESCE(p_shipping_address->>'country', 'uruguay'));

  -- Verify stock for all items FIRST (within transaction, locking variants and counting active reservations)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
      PERFORM 1 FROM public.product_variants WHERE id = (v_item->>'variant_id')::uuid FOR UPDATE;

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

  -- Reservation minutes
  SELECT (CASE WHEN value ~ '^[0-9]+$' THEN value::integer ELSE NULL END) INTO v_reservation_minutes
  FROM public.site_settings
  WHERE key = 'payment_reservation_minutes_' || p_payment_method;
  
  IF v_reservation_minutes IS NULL THEN
    IF p_payment_method = 'manual' THEN
      v_reservation_minutes := 1440;
    ELSE
      v_reservation_minutes := 30;
    END IF;
  END IF;
  
  v_reserved_until := now() + (v_reservation_minutes || ' minutes')::interval;

  -- Generate atomic order number with daily counter (AR-YYYYMMDD-XXXX or COL-YYYYMMDD-XXXX)
  INSERT INTO public.daily_order_counters (day, counter)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (day)
  DO UPDATE SET counter = daily_order_counters.counter + 1
  RETURNING counter INTO v_counter_val;

  IF v_country = 'argentina' OR v_country = 'ar' THEN
    v_order_number := 'AR-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_counter_val::text, 4, '0');
  ELSE
    v_order_number := 'COL-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_counter_val::text, 4, '0');
  END IF;

  -- Generate Handy Invoice Number if Handy payment method
  IF LOWER(p_payment_method) = 'handy' THEN
    v_handy_invoice_num := nextval('public.handy_invoice_seq');
  END IF;

  -- Consolidate financial totals from suborders
  IF p_suborders IS NOT NULL AND jsonb_array_length(p_suborders) > 0 THEN
    FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
    LOOP
      v_subtotal_products := v_subtotal_products + COALESCE((v_suborder->>'product_subtotal')::numeric, 0.00);
      v_total_shipping := v_total_shipping + COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00);
      v_total_discounts := v_total_discounts + COALESCE((v_suborder->>'discount_total')::numeric, 0.00);
      
      IF v_shipping_provider IS NULL AND v_suborder->>'shipping_provider' IS NOT NULL THEN
        v_shipping_provider := v_suborder->>'shipping_provider';
      END IF;
    END LOOP;
  ELSE
    v_subtotal_products := p_total_amount;
  END IF;

  -- Customer name
  v_cust_first_name := p_shipping_address->>'first_name';
  v_cust_last_name := p_shipping_address->>'last_name';
  v_customer_name := TRIM(COALESCE(v_cust_first_name, '') || ' ' || COALESCE(v_cust_last_name, ''));
  IF v_customer_name = '' THEN
    v_customer_name := 'Cliente';
  END IF;

  -- Insert master order
  INSERT INTO public.orders (
    customer_id, order_number, total_amount, currency, status, payment_status,
    payment_method, payment_provider, customer_email, customer_phone, customer_name,
    shipping_address, billing_address, affiliate_id, coupon_id,
    shipping_provider, terms_accepted, terms_accepted_at,
    accepted_terms_version, subtotal_products, total_shipping, total_discounts,
    preorder_status, logistics_consent,
    display_currency, display_subtotal, display_shipping, display_total,
    payment_currency, payment_subtotal, payment_shipping, payment_total,
    fx_rate, fx_rate_source, fx_rate_timestamp,
    handy_invoice_number, shipping_weight_kg, shipping_cost_ars, shipping_cost_usd,
    mbe_service_type, shipping_weight_real_kg, shipping_weight_volumetric_kg,
    shipping_weight_chargeable_kg, shipping_rule_applied, is_shipping_quote_required
  ) VALUES (
    p_customer_id, v_order_number, p_total_amount, p_currency, 'awaiting_payment', 'not_started',
    p_payment_method, p_payment_method, p_customer_email, p_customer_phone, v_customer_name,
    p_shipping_address, p_shipping_address, p_affiliate_id, p_coupon_id,
    v_shipping_provider, p_terms_accepted, p_terms_accepted_at,
    p_accepted_terms_version, v_subtotal_products, v_total_shipping, v_total_discounts,
    'not_applicable', p_logistics_consent,
    COALESCE(p_display_currency, p_currency), COALESCE(p_display_subtotal, v_subtotal_products), COALESCE(p_display_shipping, v_total_shipping), COALESCE(p_display_total, p_total_amount),
    p_currency, v_subtotal_products, v_total_shipping, p_total_amount,
    p_fx_rate, p_fx_rate_source, CASE WHEN p_fx_rate IS NOT NULL THEN now() ELSE NULL END,
    v_handy_invoice_num, p_shipping_weight_kg, p_shipping_cost_ars, p_shipping_cost_usd,
    p_mbe_service_type, p_shipping_weight_real_kg, p_shipping_weight_volumetric_kg,
    p_shipping_weight_chargeable_kg, p_shipping_rule_applied, p_is_shipping_quote_required
  )
  RETURNING id INTO v_order_id;

  -- Insert suborders & order_items
  IF p_suborders IS NOT NULL AND jsonb_array_length(p_suborders) > 0 THEN
    FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
    LOOP
      DECLARE
        v_suborder_number TEXT;
        v_vendor_id UUID;
        v_vendor_store_id UUID;
        v_is_collectibles BOOLEAN;
        v_suborder_id UUID;
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
        v_is_collectibles := COALESCE((v_suborder->>'is_collectibles_order')::boolean, false);
        
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
          COALESCE((v_suborder->>'product_subtotal')::numeric, 0.00), v_suborder->>'shipping_method', 
          v_suborder->>'shipping_provider', COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00), 'pending',
          COALESCE((v_suborder->>'marketplace_commission_rate')::numeric, 0.00), COALESCE((v_suborder->>'marketplace_fee')::numeric, 0.00),
          0.00,
          COALESCE((v_suborder->>'vendor_gross_amount')::numeric, 0.00), COALESCE((v_suborder->>'vendor_net_amount')::numeric, 0.00),
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

        FOR v_item IN 
          SELECT * FROM jsonb_array_elements(p_items) AS item
          WHERE (item->>'vendor_id' = v_vendor_id::text) 
             OR (v_vendor_id IS NULL AND (item->>'vendor_id' IS NULL OR item->>'vendor_id' = ''))
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
            COALESCE(v_item->>'product_name', v_item->>'title', 'Producto'),
            v_item->>'sku',
            COALESCE((v_item->>'discount_total')::numeric, 0.00),
            COALESCE((v_item->>'final_total')::numeric, (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer)
          ) RETURNING id INTO v_order_item_id;

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
              order_item_id, product_id, customer_id, status, estimated_arrival
            ) VALUES (
              v_order_item_id, (v_item->>'product_id')::uuid, p_customer_id, 'awaiting_payment', now() + interval '30 days'
            );
          END IF;

          IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
            INSERT INTO public.stock_reservations (
              order_id, variant_id, quantity, reserved_until, status
            ) VALUES (
              v_order_id, (v_item->>'variant_id')::uuid, (v_item->>'quantity')::integer, v_reserved_until, 'active'
            );
          END IF;
        END LOOP;

      END;
    END LOOP;
  ELSE
    -- Single order items insert
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.order_items (
        order_id, product_id, variant_id, vendor_id, vendor_store_id,
        quantity, unit_price, total_price, product_name, sku, discount_total, final_total
      ) VALUES (
        v_order_id,
        (v_item->>'product_id')::uuid,
        NULLIF(v_item->>'variant_id', '')::uuid,
        NULLIF(v_item->>'vendor_id', '')::uuid,
        NULLIF(v_item->>'vendor_store_id', '')::uuid,
        (v_item->>'quantity')::integer,
        (v_item->>'unit_price')::numeric,
        (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer,
        COALESCE(v_item->>'product_name', v_item->>'title', 'Producto'),
        v_item->>'sku',
        COALESCE((v_item->>'discount_total')::numeric, 0.00),
        COALESCE((v_item->>'final_total')::numeric, (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer)
      ) RETURNING id INTO v_order_item_id;

      IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
        INSERT INTO public.stock_reservations (
          order_id, variant_id, quantity, reserved_until, status
        ) VALUES (
          v_order_id, (v_item->>'variant_id')::uuid, (v_item->>'quantity')::integer, v_reserved_until, 'active'
        );
      END IF;
    END LOOP;
  END IF;

  IF v_has_any_preorder THEN
    UPDATE public.orders SET preorder_status = 'awaiting_payment' WHERE id = v_order_id;
  END IF;

  INSERT INTO public.customer_consents (email, phone, email_marketing_opt_in, whatsapp_opt_in, logistics_consent_opt_in)
  VALUES (p_customer_email, p_customer_phone, p_email_opt_in, p_whatsapp_opt_in, p_logistics_consent)
  ON CONFLICT (email) DO UPDATE
  SET phone = EXCLUDED.phone,
      email_marketing_opt_in = EXCLUDED.email_marketing_opt_in,
      whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
      logistics_consent_opt_in = EXCLUDED.logistics_consent_opt_in,
      updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', p_total_amount,
    'currency', p_currency,
    'reserved_until', v_reserved_until
  );
END;
$$;

-- 3. Restrict execution permissions strictly to service_role and postgres
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(
  UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, JSONB, JSONB,
  BOOLEAN, TIMESTAMPTZ, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order_atomic(
  UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, JSONB, JSONB,
  BOOLEAN, TIMESTAMPTZ, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN
) TO service_role, postgres;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
