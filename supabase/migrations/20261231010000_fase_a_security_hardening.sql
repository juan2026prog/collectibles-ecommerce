-- ═══════════════════════════════════════════════════════════════════════════════
-- COLLECTIBLES 2026 — FASE A: SECURITY, PAYMENTS, PERMISSIONS & PRIVACY HARDENING
-- Migration: 20261231010000_fase_a_security_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. BLOQUE A1: FINANCIAL RPCs HARDENING & PRIVILEGE REVOCATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop obsolete overloaded create_order_atomic signatures
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, jsonb, boolean, timestamp with time zone, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, jsonb, boolean, timestamp with time zone, text, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, jsonb, boolean, timestamp with time zone, text, boolean, boolean, boolean, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric);

-- Drop previous confirm_payment_atomic to allow return type update
DROP FUNCTION IF EXISTS public.confirm_payment_atomic(uuid, text, text);

-- Hardened confirm_payment_atomic with internal invariant and authorization validation
CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(
  p_order_id UUID, 
  p_payment_provider TEXT, 
  p_payment_ref TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_res RECORD;
  v_has_preorder BOOLEAN := false;
  v_current_status TEXT;
  v_current_payment_status TEXT;
  v_caller_role TEXT;
BEGIN
  -- 1. Enforce caller authorization (service_role, postgres, or authenticated admin)
  v_caller_role := current_setting('role', true);
  IF v_caller_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
      RAISE EXCEPTION 'Access denied: Execution of confirm_payment_atomic requires service_role or admin privileges.';
    END IF;
  END IF;

  -- 2. Lock the order row and verify state invariants
  SELECT status, payment_status 
  INTO v_current_status, v_current_payment_status
  FROM public.orders 
  WHERE id = p_order_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Invariant: do not re-confirm already confirmed orders or cancelled/expired orders
  IF v_current_status IN ('confirmed', 'paid', 'completed') AND v_current_payment_status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Order was already confirmed', 'order_id', p_order_id);
  END IF;

  IF v_current_status IN ('cancelada', 'cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Cannot confirm payment on cancelled or refunded order %', p_order_id;
  END IF;

  -- 3. Update Order Status
  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = 'approved',
      payment_provider = p_payment_provider,
      payment_provider_reference = p_payment_ref,
      payment_id = COALESCE(p_payment_ref, payment_id),
      payment_processed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  -- 4. Complete stock reservations and decrement physical inventory
  FOR v_res IN 
    SELECT * FROM public.stock_reservations 
    WHERE order_id = p_order_id AND status = 'active'
  LOOP
    UPDATE public.stock_reservations
    SET status = 'completed', updated_at = now()
    WHERE id = v_res.id;

    UPDATE public.product_variants
    SET inventory_count = GREATEST(0, inventory_count - v_res.quantity),
        updated_at = now()
    WHERE id = v_res.variant_id;
  END LOOP;

  -- 5. Update preorder items status
  UPDATE public.preorder_items
  SET status = 'confirmed', updated_at = now()
  WHERE order_item_id IN (
    SELECT id FROM public.order_items WHERE order_id = p_order_id
  ) AND status = 'awaiting_payment';

  -- 6. Check preorder presence
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

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'confirmed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke and Grant
REVOKE EXECUTE ON FUNCTION public.confirm_payment_atomic(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_atomic(UUID, TEXT, TEXT) TO service_role, postgres;

-- Canonical create_order_atomic
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
  v_caller_role TEXT;
BEGIN
  -- 1. Enforce execution role: service_role or admin
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke and Grant
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, JSONB, JSONB, BOOLEAN, TIMESTAMPTZ, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, JSONB, JSONB, BOOLEAN, TIMESTAMPTZ, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC) TO service_role, postgres;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. BLOQUE A2: SITE SETTINGS & PUBLIC CONFIG POSITIVE WHITELIST
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure site_settings is strictly admin/service_role only
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_select_all" ON public.site_settings;
DROP POLICY IF EXISTS "Public can read non-secret settings" ON public.site_settings;
DROP POLICY IF EXISTS "settings_admin" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_admin_service" ON public.site_settings;

CREATE POLICY "site_settings_admin_service" ON public.site_settings
  FOR ALL
  USING (
    (current_setting('role'::text, true) IN ('service_role', 'postgres'))
    OR (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  )
  WITH CHECK (
    (current_setting('role'::text, true) IN ('service_role', 'postgres'))
    OR (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  );

-- Clean up any residual sensitive keys from public_site_config
DELETE FROM public.public_site_config
WHERE key IN (
  'payments_mercadopago_access_token',
  'payments_dlocal_go_api_key',
  'payments_dlocal_go_secret_key',
  'payments_dlocal_go_smartfields_key',
  'payments_paypal_client_id',
  'payments_paypal_client_secret',
  'payments_paypal_secret_key',
  'mercadolibre_access_token',
  'mercadolibre_client_id',
  'mercadolibre_client_secret',
  'shipping_soydelivery_api_key',
  'shipping_soydelivery_api_id',
  'shipping_soydelivery_negocio_clave',
  'shipping_soydelivery_negocio_id',
  'whatsapp_token',
  'whatsapp_phone_id',
  'whatsapp_webhook_secret',
  'resend_api_key',
  'zinc_api_key',
  'openai_api_key'
) OR key LIKE '%token%' OR key LIKE '%secret%' OR key LIKE '%key%' OR key LIKE '%password%';

-- Re-populate public_site_config ONLY from an explicit positive whitelist
CREATE OR REPLACE FUNCTION public.sync_public_site_config()
RETURNS VOID AS $$
BEGIN
  -- Insert/update only known safe frontend keys
  INSERT INTO public.public_site_config (key, value, value_json, updated_at)
  SELECT key, value, value_json, COALESCE(updated_at, now())
  FROM public.site_settings
  WHERE key IN (
    'store_name',
    'store_tagline',
    'currency',
    'currency_symbol',
    'free_shipping_threshold',
    'default_shipping_rate',
    'marketplace_enabled',
    'meta_pixel_id',
    'theme_color_primary',
    'social_instagram_url',
    'social_instagram_enabled',
    'social_whatsapp_url',
    'social_whatsapp_enabled',
    'seo_site_title',
    'seo_site_description',
    'appearance_logo',
    'appearance_favicon',
    'appearance_announcement_text',
    'appearance_announcement_bg',
    'appearance_announcement_speed',
    'appearance_footer_text',
    'appearance_footer_html',
    'appearance_menu_json',
    'appearance_footer_menu_json',
    'appearance_home_layout_json',
    'home_featured_drops_json',
    'home_upcoming_drops_json',
    'home_preorders_json',
    'home_trending_config_json',
    'home_campaign_banner_json',
    'home_mini_banners_json',
    'home_categories_config_json',
    'payments_paypal_enabled',
    'payments_mercadopago_enabled',
    'payments_dlocal_go_enabled',
    'shipping_soydelivery_enabled',
    'ai_search_enabled',
    'ai_search_conversational_enabled',
    'collector_vault_enabled',
    'vault_external_items_enabled',
    'vault_public_collections_enabled'
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        value_json = EXCLUDED.value_json,
        updated_at = EXCLUDED.updated_at;
        
  -- Remove any non-whitelisted keys from public_site_config
  DELETE FROM public.public_site_config
  WHERE key NOT IN (
    'store_name',
    'store_tagline',
    'currency',
    'currency_symbol',
    'free_shipping_threshold',
    'default_shipping_rate',
    'marketplace_enabled',
    'meta_pixel_id',
    'theme_color_primary',
    'social_instagram_url',
    'social_instagram_enabled',
    'social_whatsapp_url',
    'social_whatsapp_enabled',
    'seo_site_title',
    'seo_site_description',
    'appearance_logo',
    'appearance_favicon',
    'appearance_announcement_text',
    'appearance_announcement_bg',
    'appearance_announcement_speed',
    'appearance_footer_text',
    'appearance_footer_html',
    'appearance_menu_json',
    'appearance_footer_menu_json',
    'appearance_home_layout_json',
    'home_featured_drops_json',
    'home_upcoming_drops_json',
    'home_preorders_json',
    'home_trending_config_json',
    'home_campaign_banner_json',
    'home_mini_banners_json',
    'home_categories_config_json',
    'payments_paypal_enabled',
    'payments_mercadopago_enabled',
    'payments_dlocal_go_enabled',
    'shipping_soydelivery_enabled',
    'ai_search_enabled',
    'ai_search_conversational_enabled',
    'collector_vault_enabled',
    'vault_external_items_enabled',
    'vault_public_collections_enabled'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run sync immediately
SELECT public.sync_public_site_config();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. BLOQUE A3: SHIPPING PROVIDERS & SAFE PUBLIC DELIVERY PROVIDERS VIEW
-- ═══════════════════════════════════════════════════════════════════════════════

-- Lock down shipping_providers table (admins & service_role only)
ALTER TABLE public.shipping_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can select active shipping providers" ON public.shipping_providers;
DROP POLICY IF EXISTS "Admins manage shipping providers" ON public.shipping_providers;
DROP POLICY IF EXISTS "shipping_providers_admin_service" ON public.shipping_providers;

CREATE POLICY "shipping_providers_admin_service" ON public.shipping_providers
  FOR ALL
  USING (
    (current_setting('role'::text, true) IN ('service_role', 'postgres'))
    OR (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  )
  WITH CHECK (
    (current_setting('role'::text, true) IN ('service_role', 'postgres'))
    OR (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true))
  );

-- Recreate delivery_providers VIEW to strictly hide credentials
DROP VIEW IF EXISTS public.delivery_providers CASCADE;
CREATE OR REPLACE VIEW public.delivery_providers AS
  SELECT
    id,
    code AS provider_key,
    name AS provider_name,
    is_active,
    environment,
    created_at,
    updated_at
  FROM public.shipping_providers
  WHERE is_active = true;

GRANT SELECT ON public.delivery_providers TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. BLOQUE A7: ORDERS & ORDER ITEMS RLS HARDENING (NO PUBLIC READ / INSERTS)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public order read" ON public.orders;
DROP POLICY IF EXISTS "Public order creation" ON public.orders;
DROP POLICY IF EXISTS "Customers can view orders by email" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert their own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
DROP POLICY IF EXISTS "orders_select_vendor" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_all" ON public.orders;

-- 1. Customers view own orders
CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT TO authenticated
  USING (
    (customer_id = auth.uid()) OR (user_id = auth.uid())
  );

-- 2. Vendors view orders that have their suborders
CREATE POLICY "orders_select_vendor" ON public.orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.order_suborders os
      WHERE os.parent_order_id = orders.id AND os.vendor_id = auth.uid()
    )
  );

-- 3. Admins full management
CREATE POLICY "orders_admin_all" ON public.orders
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Order Items RLS Hardening
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public items read" ON public.order_items;
DROP POLICY IF EXISTS "Public items creation" ON public.order_items;
DROP POLICY IF EXISTS "Users can view their own order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins can manage all order items" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_vendor" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_all" ON public.order_items;

CREATE POLICY "order_items_select_own" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.orders 
      WHERE customer_id = auth.uid() OR user_id = auth.uid()
    )
  );

CREATE POLICY "order_items_select_vendor" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    vendor_id = auth.uid() 
    OR suborder_id IN (SELECT id FROM public.order_suborders WHERE vendor_id = auth.uid())
  );

CREATE POLICY "order_items_admin_all" ON public.order_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. BLOQUE A10: STORAGE SHIPPING LABELS HARDENING (PRIVATE ONLY)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure bucket is marked private
UPDATE storage.buckets
SET public = false
WHERE id = 'shipping-labels';

-- Drop the universal public read policy
DROP POLICY IF EXISTS "Shipping Labels are universally readable" ON storage.objects;
DROP POLICY IF EXISTS "Customers view own shipping labels storage" ON storage.objects;
DROP POLICY IF EXISTS "Vendors manage own shipping labels storage" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage Shipping Labels" ON storage.objects;
DROP POLICY IF EXISTS "shipping_labels_admin_all" ON storage.objects;
DROP POLICY IF EXISTS "shipping_labels_vendor_access" ON storage.objects;
DROP POLICY IF EXISTS "shipping_labels_customer_select" ON storage.objects;

-- Admins full access to shipping-labels
CREATE POLICY "shipping_labels_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'shipping-labels' AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
    )
  )
  WITH CHECK (
    bucket_id = 'shipping-labels' AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
    )
  );

-- Vendors view/manage their own shipping labels
CREATE POLICY "shipping_labels_vendor_access" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'shipping-labels' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.shipments s
        JOIN public.order_suborders os ON s.suborder_id = os.id
        WHERE os.vendor_id = auth.uid() AND (s.label_storage_path = objects.name OR s.shipping_label_url LIKE '%' || objects.name || '%')
      )
    )
  );

-- Customers view labels for their shipments
CREATE POLICY "shipping_labels_customer_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'shipping-labels' AND (
      EXISTS (
        SELECT 1 FROM public.shipments s
        JOIN public.orders o ON s.order_id = o.id
        WHERE o.customer_id = auth.uid() AND (s.label_storage_path = objects.name OR s.shipping_label_url LIKE '%' || objects.name || '%')
      )
    )
  );

COMMIT;
