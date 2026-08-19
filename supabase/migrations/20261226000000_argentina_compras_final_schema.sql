-- Migration: Argentina Purchase Flow Final Schema and Atomic RPC Update
-- Date: 2026-12-26

-- 1. Add financial, display, FX, and Handy columns to public.orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS display_currency TEXT DEFAULT 'UYU';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS display_subtotal NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS display_shipping NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS display_total NUMERIC;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_currency TEXT DEFAULT 'UYU';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_subtotal NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_shipping NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_total NUMERIC;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fx_rate NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fx_rate_source TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fx_rate_timestamp TIMESTAMPTZ;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handy_invoice_number INTEGER;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_weight_kg NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_cost_ars NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_cost_usd NUMERIC;

-- 2. Create independent 32-bit sequence for Handy Invoice Numbers (< 2,147,483,647)
CREATE SEQUENCE IF NOT EXISTS public.handy_invoice_seq START WITH 68150001;

-- 3. Create public.international_shipping_weight_tiers table
CREATE TABLE IF NOT EXISTS public.international_shipping_weight_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL DEFAULT 'AR',
    min_weight_kg NUMERIC NOT NULL,
    max_weight_kg NUMERIC NOT NULL,
    rate_usd NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on international_shipping_weight_tiers
ALTER TABLE public.international_shipping_weight_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select international_shipping_weight_tiers" ON public.international_shipping_weight_tiers;
CREATE POLICY "Anyone can select international_shipping_weight_tiers" ON public.international_shipping_weight_tiers
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins manage international_shipping_weight_tiers" ON public.international_shipping_weight_tiers;
CREATE POLICY "Admins manage international_shipping_weight_tiers" ON public.international_shipping_weight_tiers
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- Seed initial weight tiers for Argentina (AR)
INSERT INTO public.international_shipping_weight_tiers (country_code, min_weight_kg, max_weight_kg, rate_usd)
VALUES 
    ('AR', 0.000, 0.500, 18.00),
    ('AR', 0.501, 1.000, 25.00),
    ('AR', 1.001, 2.000, 35.00),
    ('AR', 2.001, 3.000, 48.00),
    ('AR', 3.001, 5.000, 65.00),
    ('AR', 5.001, 10.000, 95.00)
ON CONFLICT DO NOTHING;

-- 4. Recreate create_order_atomic function to support Argentina AR- prefix, Handy invoice sequence, FX freeze and display currency fields
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
  p_shipping_cost_usd NUMERIC DEFAULT NULL
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
  
  -- Counter & Handy Invoice
  v_counter_val INTEGER;
  v_handy_invoice_num INTEGER := NULL;
  v_country TEXT;
BEGIN
  -- Extract country from shipping address
  v_country := LOWER(COALESCE(p_shipping_address->>'country', 'uruguay'));

  -- Verify stock for all items FIRST (within transaction, counting active reservations)
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
  FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
  LOOP
    v_subtotal_products := v_subtotal_products + COALESCE((v_suborder->>'product_subtotal')::numeric, 0.00);
    v_total_shipping := v_total_shipping + COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00);
    v_total_discounts := v_total_discounts + COALESCE((v_suborder->>'discount_total')::numeric, 0.00);
    
    IF v_shipping_provider IS NULL AND v_suborder->>'shipping_provider' IS NOT NULL THEN
      v_shipping_provider := v_suborder->>'shipping_provider';
    END IF;
  END LOOP;

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
    handy_invoice_number, shipping_weight_kg, shipping_cost_ars, shipping_cost_usd
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
    v_handy_invoice_num, p_shipping_weight_kg, p_shipping_cost_ars, p_shipping_cost_usd
  )
  RETURNING id INTO v_order_id;

  -- Insert suborders & order_items
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
            order_id, variant_id, quantity, reserved_until
          ) VALUES (
            v_order_id, (v_item->>'variant_id')::uuid, (v_item->>'quantity')::integer, v_reserved_until
          );
        END IF;
      END LOOP;

    END;
  END LOOP;

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
    'handy_invoice_number', v_handy_invoice_num
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
