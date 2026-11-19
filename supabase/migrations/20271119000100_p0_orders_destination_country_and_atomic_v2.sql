-- =============================================================================
-- Migration: 20271119000100_p0_orders_destination_country_and_atomic_v2.sql
-- Purpose:
--   1. Add additive, backward-compatible `destination_country_code` column
--      to `public.orders` and `public.order_suborders` (DEFAULT 'UY').
--      Note: A single `destination_country_code` (ISO-2 matching
--      `international_markets.country_code`) cleanly represents both the
--      shipping destination and commercial market without duplicating columns.
--   2. Extend `public.create_order_atomic_v2` with optional trailing parameter
--      `p_destination_country_code text DEFAULT NULL` (100% compatible with
--      existing 33-argument callers) and persist `destination_country_code`.
--   3. Preserves all existing idempotency, stock reservation, group_key,
--      Handy invoice sequence, and Uruguay checkout behavior.
--
-- Historical Backfill Policy:
--   NO automatic backfill is executed here. Review ambiguous historical rows
--   first using the commented dry-run query at the bottom of this file.
--
-- Safe Non-Destructive Rollback Plan (NEVER drops columns that may hold order data):
--   1. Restore 33-arg `create_order_atomic_v2` from `20271102090000_atomic_order_idempotency.sql`
--      (keeping `destination_country_code` column and all persisted values intact).
--   2. Optionally drop only the secondary index if needed:
--      DROP INDEX IF EXISTS idx_orders_destination_country_status_created;
--   3. DO NOT execute `ALTER TABLE ... DROP COLUMN destination_country_code`.
-- =============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS destination_country_code text NOT NULL DEFAULT 'UY';

ALTER TABLE public.order_suborders
  ADD COLUMN IF NOT EXISTS destination_country_code text NOT NULL DEFAULT 'UY';

CREATE INDEX IF NOT EXISTS idx_orders_destination_country_status_created
  ON public.orders (destination_country_code, status, created_at DESC);

-- Drop old 33-arg signature cleanly before creating the 34-arg (with DEFAULT NULL) signature
-- so PostgREST/RPC resolution never encounters an overload ambiguity.
DROP FUNCTION IF EXISTS public.create_order_atomic_v2(
  uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, jsonb,
  boolean, timestamp with time zone, text, boolean, boolean, boolean,
  text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, text, boolean, text
);

CREATE OR REPLACE FUNCTION public.create_order_atomic_v2(
  p_customer_id uuid,
  p_total_amount numeric,
  p_currency text,
  p_payment_method text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_affiliate_id uuid,
  p_coupon_id uuid,
  p_items jsonb,
  p_suborders jsonb,
  p_terms_accepted boolean,
  p_terms_accepted_at timestamp with time zone,
  p_accepted_terms_version text,
  p_email_opt_in boolean,
  p_whatsapp_opt_in boolean,
  p_logistics_consent boolean,
  p_display_currency text,
  p_display_subtotal numeric,
  p_display_shipping numeric,
  p_display_total numeric,
  p_fx_rate numeric,
  p_fx_rate_source text,
  p_shipping_weight_kg numeric,
  p_shipping_cost_ars numeric,
  p_shipping_cost_usd numeric,
  p_mbe_service_type text,
  p_shipping_weight_real_kg numeric,
  p_shipping_weight_volumetric_kg numeric,
  p_shipping_weight_chargeable_kg numeric,
  p_shipping_rule_applied text,
  p_is_shipping_quote_required boolean,
  p_checkout_request_key text,
  p_destination_country_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_suborder JSONB;
  v_suborder_idx INTEGER := 0;
  v_suborder_id UUID;
  v_variant_stock INTEGER;
  v_shipping_provider TEXT := NULL;

  v_subtotal_products NUMERIC := 0;
  v_total_shipping NUMERIC := 0;
  v_total_discounts NUMERIC := 0;
  v_has_international BOOLEAN := false;

  v_reservation_minutes INTEGER;
  v_reserved_until TIMESTAMPTZ;
  v_counter_val BIGINT;
  v_order_item_id UUID;
  v_is_preorder BOOLEAN := false;
  v_has_any_preorder BOOLEAN := false;

  v_handy_invoice_num BIGINT := NULL;

  v_cust_first_name TEXT;
  v_cust_last_name TEXT;
  v_customer_name TEXT;

  v_country TEXT;
  v_dest_country_code TEXT := 'UY';
  v_caller_role TEXT;

  v_expected_items_count INTEGER := 0;
  v_inserted_items_count INTEGER := 0;

  v_existing_attempt RECORD;
  v_existing_order RECORD;
  v_idempotency_key TEXT;
BEGIN
  -- 1. Control de Acceso Efectivo: service_role, postgres, supabase_admin o admin verificado
  v_caller_role := current_setting('role', true);
  IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
      RAISE EXCEPTION 'Access denied: create_order_atomic_v2 must be called via backend service_role or admin.';
    END IF;
  END IF;

  -- 2. Invariante de seguridad: Aceptación obligatoria de términos y condiciones
  IF NOT p_terms_accepted THEN
    RAISE EXCEPTION 'TERMS_NOT_ACCEPTED: Debes aceptar los términos y condiciones para crear la orden.';
  END IF;

  -- 3. Invariante financiera: Rechazo de total negativo
  IF p_total_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL: El total de la orden no puede ser negativo.';
  END IF;

  -- 4. Idempotencia Atómica en la misma transacción PostgreSQL
  IF p_checkout_request_key IS NOT NULL AND TRIM(p_checkout_request_key) != '' THEN
    v_idempotency_key := 'create_order:' || TRIM(p_checkout_request_key);

    SELECT pa.id, pa.order_id, pa.user_id, pa.metadata
    INTO v_existing_attempt
    FROM public.payment_attempts pa
    WHERE pa.idempotency_key = v_idempotency_key
    LIMIT 1;

    IF v_existing_attempt.id IS NOT NULL THEN
      SELECT * INTO v_existing_order FROM public.orders WHERE id = v_existing_attempt.order_id;

      IF v_existing_order.id IS NOT NULL THEN
        IF p_customer_id IS NOT NULL AND v_existing_order.customer_id IS NOT NULL THEN
          IF v_existing_order.customer_id != p_customer_id THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Clave de solicitud asignada a otro usuario.';
          END IF;
        ELSIF LOWER(TRIM(COALESCE(v_existing_order.customer_email, ''))) != LOWER(TRIM(COALESCE(p_customer_email, ''))) THEN
          RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Clave de solicitud asignada a otro email de comprador.';
        END IF;

        RETURN jsonb_build_object(
          'success', true,
          'idempotent_replay', true,
          'order_id', v_existing_order.id,
          'order_number', v_existing_order.order_number,
          'total_amount', v_existing_order.total_amount,
          'currency', v_existing_order.currency,
          'destination_country_code', COALESCE(v_existing_order.destination_country_code, 'UY'),
          'status', v_existing_order.status,
          'payment_status', v_existing_order.payment_status,
          'is_international', COALESCE(v_existing_order.is_international, false),
          'reserved_until', NULL
        );
      END IF;
    END IF;
  END IF;

  -- 5. Validación transaccional bidireccional estricta de group_key
  IF p_suborders IS NOT NULL AND jsonb_array_length(p_suborders) > 0 THEN
    SELECT COALESCE(SUM((s->>'items_count')::integer), 0) INTO v_expected_items_count
    FROM jsonb_array_elements(p_suborders) AS s;

    IF v_expected_items_count != jsonb_array_length(p_items) THEN
      RAISE EXCEPTION 'INTEGRITY_MISMATCH: La suma de items de las subórdenes (%) no coincide con la cantidad total de artículos (%).',
        v_expected_items_count, jsonb_array_length(p_items);
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_suborders) AS so
        WHERE (
          (v_item->>'group_key' IS NOT NULL AND so->>'group_key' = v_item->>'group_key')
          OR
          (v_item->>'group_key' IS NULL AND (
            (NULLIF(v_item->>'vendor_id', '') IS NOT NULL AND so->>'vendor_id' = v_item->>'vendor_id')
            OR
            (NULLIF(v_item->>'vendor_id', '') IS NULL AND (so->>'vendor_id' IS NULL OR so->>'vendor_id' = ''))
          ))
        )
      ) THEN
        RAISE EXCEPTION 'INTEGRITY_ERROR: El artículo % con group_key "%" no corresponde a ninguna suborden generada.',
          COALESCE(v_item->>'product_name', v_item->>'product_id', 'Desconocido'),
          COALESCE(v_item->>'group_key', 'null');
      END IF;
    END LOOP;
  ELSE
    v_expected_items_count := jsonb_array_length(p_items);
  END IF;

  -- Deterministic destination country resolution (explicit ISO-2 parameter preferred)
  v_country := LOWER(TRIM(COALESCE(p_shipping_address->>'country', '')));
  IF v_country = '' THEN
    v_country := LOWER(TRIM(COALESCE(p_shipping_address->>'department', 'uruguay')));
  END IF;

  IF p_destination_country_code IS NOT NULL AND LENGTH(TRIM(p_destination_country_code)) = 2 THEN
    v_dest_country_code := UPPER(TRIM(p_destination_country_code));
  ELSIF v_country IN ('argentina', 'ar') THEN
    v_dest_country_code := 'AR';
  ELSIF v_country IN ('chile', 'cl') THEN
    v_dest_country_code := 'CL';
  ELSIF v_country IN ('peru', 'perú', 'pe') THEN
    v_dest_country_code := 'PE';
  ELSIF v_country IN ('mexico', 'méxico', 'mx') THEN
    v_dest_country_code := 'MX';
  ELSIF v_country IN ('colombia', 'co') THEN
    v_dest_country_code := 'CO';
  ELSIF v_country IN ('ecuador', 'ec') THEN
    v_dest_country_code := 'EC';
  ELSIF v_country IN ('brasil', 'brazil', 'br') THEN
    v_dest_country_code := 'BR';
  ELSE
    v_dest_country_code := 'UY';
  END IF;

  -- Stock check & lock
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

  INSERT INTO public.daily_order_counters (day, counter)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (day)
  DO UPDATE SET counter = daily_order_counters.counter + 1
  RETURNING counter INTO v_counter_val;

  IF v_dest_country_code = 'AR' THEN
    v_order_number := 'AR-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_counter_val::text, 4, '0');
  ELSIF v_dest_country_code = 'UY' THEN
    v_order_number := 'COL-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_counter_val::text, 4, '0');
  ELSE
    v_order_number := v_dest_country_code || '-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_counter_val::text, 4, '0');
  END IF;

  IF LOWER(p_payment_method) = 'handy' THEN
    v_handy_invoice_num := nextval('public.handy_invoice_seq');
  END IF;

  v_cust_first_name := p_shipping_address->>'first_name';
  v_cust_last_name := p_shipping_address->>'last_name';
  v_customer_name := TRIM(COALESCE(v_cust_first_name, '') || ' ' || COALESCE(v_cust_last_name, ''));
  IF v_customer_name = '' THEN
    v_customer_name := 'Cliente';
  END IF;

  IF p_suborders IS NOT NULL AND jsonb_array_length(p_suborders) > 0 THEN
    FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
    LOOP
      v_subtotal_products := v_subtotal_products + COALESCE((v_suborder->>'product_subtotal')::numeric, 0.00);
      v_total_shipping := v_total_shipping + COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00);
      v_total_discounts := v_total_discounts + COALESCE((v_suborder->>'discount_total')::numeric, 0.00);

      IF COALESCE((v_suborder->>'is_international')::boolean, false) = true THEN
        v_has_international := true;
      END IF;

      IF v_shipping_provider IS NULL AND v_suborder->>'shipping_provider' IS NOT NULL THEN
        v_shipping_provider := v_suborder->>'shipping_provider';
      END IF;
    END LOOP;
  ELSE
    v_subtotal_products := p_total_amount;
  END IF;

  IF v_shipping_provider IS NULL AND p_shipping_address ? 'shipping_method' THEN
    IF (p_shipping_address->>'shipping_method') IN ('dac_agency', 'dac_home') THEN
      v_shipping_provider := 'dac';
    ELSIF (p_shipping_address->>'shipping_method') IN ('skypostal', 'mbe') THEN
      v_shipping_provider := 'skypostal';
    ELSIF (p_shipping_address->>'shipping_method') = 'cadeteria' THEN
      v_shipping_provider := 'cadeteria';
    ELSIF (p_shipping_address->>'shipping_method') = 'pickup' THEN
      v_shipping_provider := 'pickup';
    ELSE
      v_shipping_provider := 'custom';
    END IF;
  END IF;

  IF NOT v_has_international AND p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_items) AS itm
      JOIN public.international_products ip ON ip.id = (itm->>'product_id')::uuid
    ) INTO v_has_international;
  END IF;

  -- 6. Insert Order with destination_country_code
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
    shipping_weight_chargeable_kg, shipping_rule_applied, is_shipping_quote_required,
    is_international, destination_country_code
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
    p_shipping_weight_chargeable_kg, p_shipping_rule_applied, p_is_shipping_quote_required,
    v_has_international, v_dest_country_code
  ) RETURNING id INTO v_order_id;

  -- 7. Insert Suborders and Items with group_key exact matching
  IF p_suborders IS NOT NULL AND jsonb_array_length(p_suborders) > 0 THEN
    FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
    LOOP
      DECLARE
        v_suborder_number TEXT;
        v_suborder_group_key TEXT;
        v_vendor_id UUID;
        v_vendor_store_id UUID;
        v_is_collectibles BOOLEAN;
        v_is_suborder_intl BOOLEAN;
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

        v_suborder_group_key := v_suborder->>'group_key';
        v_vendor_id := NULLIF(v_suborder->>'vendor_id', '')::uuid;
        v_vendor_store_id := NULLIF(v_suborder->>'vendor_store_id', '')::uuid;
        v_is_collectibles := COALESCE((v_suborder->>'is_collectibles_order')::boolean, false);
        v_is_suborder_intl := COALESCE((v_suborder->>'is_international')::boolean, false);

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
          seller_type, shipping_mode, pickup_type, agency_id, agency_name, dispatch_address_id, internal_reference, vendor_policy_snapshot,
          is_international, destination_country_code
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
          v_seller_type, v_shipping_mode, v_pickup_type, v_agency_id, v_agency_name, v_dispatch_address_id, v_internal_reference, COALESCE(v_suborder->'vendor_policy_snapshot', '{}'::jsonb),
          v_is_suborder_intl, v_dest_country_code
        ) RETURNING id INTO v_suborder_id;

        FOR v_item IN
          SELECT * FROM jsonb_array_elements(p_items) AS item
          WHERE (
            (v_suborder_group_key IS NOT NULL AND item->>'group_key' = v_suborder_group_key)
            OR
            (v_suborder_group_key IS NULL AND (
              (v_vendor_id IS NOT NULL AND item->>'vendor_id' = v_vendor_id::text)
              OR
              (v_vendor_id IS NULL AND (item->>'vendor_id' IS NULL OR item->>'vendor_id' = ''))
            ))
          )
        LOOP
          v_inserted_items_count := v_inserted_items_count + 1;

          INSERT INTO public.order_items (
            order_id, suborder_id, product_id, variant_id, vendor_id, vendor_store_id,
            quantity, unit_price, total_price, product_name, sku, discount_total, final_total
          ) VALUES (
            v_order_id, v_suborder_id,
            (v_item->>'product_id')::uuid,
            NULLIF(v_item->>'variant_id', '')::uuid,
            v_vendor_id,
            NULLIF(v_item->>'vendor_store_id', '')::uuid,
            (v_item->>'quantity')::integer,
            (v_item->>'unit_price')::numeric,
            COALESCE((v_item->>'total_price')::numeric, (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer),
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

    IF v_inserted_items_count != v_expected_items_count THEN
      RAISE EXCEPTION 'INTEGRITY_MISMATCH: Se esperaban % líneas de artículos pero se asignaron %.',
        v_expected_items_count, v_inserted_items_count;
    END IF;
  ELSE
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_inserted_items_count := v_inserted_items_count + 1;

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
        COALESCE((v_item->>'total_price')::numeric, (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer),
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

    IF v_inserted_items_count != v_expected_items_count THEN
      RAISE EXCEPTION 'INTEGRITY_MISMATCH: Se esperaban % líneas de artículos pero se asignaron %.',
        v_expected_items_count, v_inserted_items_count;
    END IF;
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

  IF v_idempotency_key IS NOT NULL THEN
    INSERT INTO public.payment_attempts (
      order_id, user_id, provider, payment_method_type, attempt_number,
      amount, currency, normalized_status, provider_status, idempotency_key,
      initiated_at, metadata
    ) VALUES (
      v_order_id, p_customer_id, p_payment_method, p_payment_method, 1,
      p_total_amount, p_currency, 'initiated', 'order_created', v_idempotency_key,
      now(), jsonb_build_object('checkout_request_key', TRIM(p_checkout_request_key))
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', p_total_amount,
    'currency', p_currency,
    'destination_country_code', v_dest_country_code,
    'is_international', v_has_international,
    'reserved_until', v_reserved_until
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic_v2(
  uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, jsonb,
  boolean, timestamp with time zone, text, boolean, boolean, boolean,
  text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, text, boolean, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order_atomic_v2(
  uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, jsonb,
  boolean, timestamp with time zone, text, boolean, boolean, boolean,
  text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric,
  text, numeric, numeric, numeric, text, boolean, text, text
) TO service_role;

-- =============================================================================
-- MANUAL HISTORICAL BACKFILL (COMMENTED OUT — DO NOT RUN WITHOUT OWNER REVIEW)
-- Step 1 (Dry-run):
--   SELECT order_number, COALESCE(shipping_address->>'country','NULL') AS ship_country, currency, status
--   FROM public.orders
--   WHERE order_number LIKE 'AR-%' OR LOWER(COALESCE(shipping_address->>'country','')) IN ('argentina','ar');
-- Step 2 (Controlled backfill after approval):
--   UPDATE public.orders
--   SET destination_country_code = 'AR'
--   WHERE destination_country_code = 'UY'
--     AND (order_number LIKE 'AR-%' OR LOWER(COALESCE(shipping_address->>'country','')) IN ('argentina','ar'));
-- =============================================================================
