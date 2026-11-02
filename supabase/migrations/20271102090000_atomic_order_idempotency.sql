-- Migration: 20271102090000_atomic_order_idempotency.sql
-- Implementa public.create_order_atomic_v2:
-- Mantiene intacta la función histórica de 32 parámetros public.create_order_atomic para preservar
-- todas las llamadas existentes de checkout-handler, scripts o extensiones sin riesgo de ambigüedad.
--
-- public.create_order_atomic_v2 incorpora p_checkout_request_key obligatorio (33 parámetros):
-- 1. Idempotencia atómica garantizada en una única transacción PostgreSQL.
-- 2. Si p_checkout_request_key ya existe en payment_attempts:
--    - Valida coincidencia de identidad del comprador (customer_id o email).
--    - Retorna de inmediato la orden existente con 'idempotent_replay': true.
--    - Cero órdenes huérfanas, cero doble consumo de reservas, cero alteraciones de inventario.
-- 3. Si la clave es nueva:
--    - Inserta la orden, subórdenes, items, reservas y el registro en payment_attempts con
--      idempotency_key = 'create_order:' || p_checkout_request_key.
--    - El índice único idx_payment_attempts_idempotency aborta y previene concurrencias dobles.
-- 4. Permisos estrictos: SECURITY DEFINER con search_path 'public', 'pg_temp'.
--    REVOKE ALL de PUBLIC, anon, authenticated. GRANT EXECUTE únicamente a service_role y postgres.

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
  p_checkout_request_key text
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
  
  -- Financial consolidations
  v_subtotal_products NUMERIC := 0;
  v_total_shipping NUMERIC := 0;
  v_total_discounts NUMERIC := 0;
  v_has_international BOOLEAN := false;
  
  -- Preorder & reservations
  v_reservation_minutes INTEGER;
  v_reserved_until TIMESTAMPTZ;
  v_counter_val BIGINT;
  v_order_item_id UUID;
  v_is_preorder BOOLEAN := false;
  v_has_any_preorder BOOLEAN := false;

  -- Handy payment
  v_handy_invoice_num BIGINT := NULL;
  
  -- Customer metadata
  v_cust_first_name TEXT;
  v_cust_last_name TEXT;
  v_customer_name TEXT;

  -- Country detection
  v_country TEXT;
  v_caller_role TEXT;

  -- Transactional group_key integrity check
  v_expected_items_count INTEGER := 0;
  v_inserted_items_count INTEGER := 0;

  -- Idempotency resolution
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
      -- Traer orden asociada
      SELECT * INTO v_existing_order FROM public.orders WHERE id = v_existing_attempt.order_id;
      
      IF v_existing_order.id IS NOT NULL THEN
        -- Validar identidad del comprador para evitar colisiones cruzadas
        IF p_customer_id IS NOT NULL AND v_existing_order.customer_id IS NOT NULL THEN
          IF v_existing_order.customer_id != p_customer_id THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Clave de solicitud asignada a otro usuario.';
          END IF;
        ELSIF LOWER(TRIM(COALESCE(v_existing_order.customer_email, ''))) != LOWER(TRIM(COALESCE(p_customer_email, ''))) THEN
          RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Clave de solicitud asignada a otro email de comprador.';
        END IF;

        -- Replay idempotente limpio: devuelve orden existente sin mutar inventario ni duplicar
        RETURN jsonb_build_object(
          'success', true,
          'idempotent_replay', true,
          'order_id', v_existing_order.id,
          'order_number', v_existing_order.order_number,
          'total_amount', v_existing_order.total_amount,
          'currency', v_existing_order.currency,
          'status', v_existing_order.status,
          'payment_status', v_existing_order.payment_status,
          'is_international', COALESCE(v_existing_order.is_international, false),
          'reserved_until', NULL
        );
      END IF;
    END IF;
  END IF;

  -- 5. Validación transaccional bidireccional estricta de group_key
  IF jsonb_array_length(p_suborders) > 0 THEN
    SELECT COALESCE(SUM((s->>'items_count')::integer), 0) INTO v_expected_items_count
    FROM jsonb_array_elements(p_suborders) AS s;

    IF v_expected_items_count != jsonb_array_length(p_items) THEN
      RAISE EXCEPTION 'INTEGRITY_MISMATCH: La suma de items de las subórdenes (%) no coincide con la cantidad total de artículos (%).',
        v_expected_items_count, jsonb_array_length(p_items);
    END IF;
  ELSE
    v_expected_items_count := jsonb_array_length(p_items);
  END IF;

  -- Country detection
  v_country := LOWER(TRIM(COALESCE(p_shipping_address->>'country', '')));
  IF v_country = '' THEN
    v_country := LOWER(TRIM(COALESCE(p_shipping_address->>'department', 'uruguay')));
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

  -- Check if Handy payment to auto-assign sequential numeric invoice
  IF p_payment_method = 'handy' THEN
    SELECT nextval('public.handy_invoice_seq') INTO v_handy_invoice_num;
  END IF;

  -- Customer name extraction
  v_cust_first_name := p_shipping_address->>'first_name';
  v_cust_last_name := p_shipping_address->>'last_name';
  IF v_cust_first_name IS NOT NULL OR v_cust_last_name IS NOT NULL THEN
    v_customer_name := TRIM(CONCAT(COALESCE(v_cust_first_name, ''), ' ', COALESCE(v_cust_last_name, '')));
  END IF;

  -- Auto-determine shipping provider
  IF p_shipping_address ? 'shipping_method' THEN
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

  -- Calculate financial aggregates & international flag
  SELECT 
    COALESCE(SUM((item->>'total_price')::numeric), 0),
    COALESCE(SUM((item->>'discount_total')::numeric), 0),
    BOOL_OR(COALESCE((item->>'is_international')::boolean, false) OR COALESCE((item->>'origin_country')::text = 'US', false))
  INTO v_subtotal_products, v_total_discounts, v_has_international
  FROM jsonb_array_elements(p_items) AS item;

  IF jsonb_array_length(p_suborders) > 0 THEN
    SELECT COALESCE(SUM((s->>'shipping_cost')::numeric), 0)
    INTO v_total_shipping
    FROM jsonb_array_elements(p_suborders) AS s;
  ELSE
    v_total_shipping := GREATEST(0, p_total_amount - v_subtotal_products + v_total_discounts);
  END IF;

  -- Check for preorders
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item 
    WHERE (item->>'is_preorder')::boolean = true
  ) INTO v_has_any_preorder;

  -- 6. Insert Order
  INSERT INTO public.orders (
    order_number, customer_id, total_amount, currency, payment_method,
    status, payment_status, customer_email, customer_phone, customer_name,
    shipping_address, affiliate_id, coupon_id, terms_accepted,
    terms_accepted_at, accepted_terms_version, email_marketing_opt_in,
    whatsapp_opt_in, logistics_consent_opt_in, shipping_provider,
    handy_invoice_number, subtotal_products, total_shipping, total_discounts,
    is_international, display_currency, display_subtotal, display_shipping,
    display_total, fx_rate, fx_rate_source, shipping_weight_kg,
    shipping_cost_ars, shipping_cost_usd, mbe_service_type,
    shipping_weight_real_kg, shipping_weight_volumetric_kg,
    shipping_weight_chargeable_kg, shipping_rule_applied,
    is_shipping_quote_required, created_at, updated_at
  ) VALUES (
    v_order_number, p_customer_id, p_total_amount, p_currency, p_payment_method,
    'pending', 'pending', p_customer_email, p_customer_phone, v_customer_name,
    p_shipping_address, p_affiliate_id, p_coupon_id, p_terms_accepted,
    p_terms_accepted_at, p_accepted_terms_version, p_email_opt_in,
    p_whatsapp_opt_in, p_logistics_consent, v_shipping_provider,
    v_handy_invoice_num, v_subtotal_products, v_total_shipping, v_total_discounts,
    v_has_international, p_display_currency, p_display_subtotal, p_display_shipping,
    p_display_total, p_fx_rate, p_fx_rate_source, p_shipping_weight_kg,
    p_shipping_cost_ars, p_shipping_cost_usd, p_mbe_service_type,
    p_shipping_weight_real_kg, p_shipping_weight_volumetric_kg,
    p_shipping_weight_chargeable_kg, p_shipping_rule_applied,
    p_is_shipping_quote_required, now(), now()
  ) RETURNING id INTO v_order_id;

  -- 7. Insert Suborders and Items with group_key exact matching
  IF jsonb_array_length(p_suborders) > 0 THEN
    FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
    LOOP
      v_suborder_idx := v_suborder_idx + 1;
      
      INSERT INTO public.order_suborders (
        parent_order_id, suborder_number, vendor_id, vendor_store_id,
        subtotal, shipping_cost, commission_rate, commission_amount,
        vendor_payout, status, shipping_address, shipping_method,
        origin_country, is_international, dac_suborder_tracking_code,
        dac_label_pdf_url, dac_tracking_status, tracking_number
      ) VALUES (
        v_order_id,
        v_order_number || '-S' || v_suborder_idx,
        NULLIF(v_suborder->>'vendor_id', '')::uuid,
        NULLIF(v_suborder->>'vendor_store_id', '')::uuid,
        COALESCE((v_suborder->>'subtotal')::numeric, 0.00),
        COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00),
        COALESCE((v_suborder->>'commission_rate')::numeric, 0.00),
        COALESCE((v_suborder->>'commission_amount')::numeric, 0.00),
        COALESCE((v_suborder->>'vendor_payout')::numeric, 0.00),
        'pending',
        p_shipping_address,
        v_suborder->>'shipping_method',
        COALESCE(v_suborder->>'origin_country', 'UY'),
        COALESCE((v_suborder->>'is_international')::boolean, false),
        v_suborder->>'dac_suborder_tracking_code',
        v_suborder->>'dac_label_pdf_url',
        v_suborder->>'dac_tracking_status',
        v_suborder->>'tracking_number'
      ) RETURNING id INTO v_suborder_id;

      FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
      LOOP
        IF (v_item->>'group_key') = (v_suborder->>'group_key') THEN
          v_inserted_items_count := v_inserted_items_count + 1;

          INSERT INTO public.order_items (
            order_id, suborder_id, product_id, variant_id, vendor_id, vendor_store_id,
            quantity, unit_price, total_price, product_name, sku, discount_total, final_total
          ) VALUES (
            v_order_id,
            v_suborder_id,
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
        END IF;
      END LOOP;
    END LOOP;

    IF v_inserted_items_count != v_expected_items_count THEN
      RAISE EXCEPTION 'INTEGRITY_MISMATCH: Se esperaban % líneas de artículos pero se asignaron %. Transacción abortada para evitar pedidos incompletos o duplicados.',
        v_expected_items_count, v_inserted_items_count;
    END IF;

  ELSE
    -- Single order items insert
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

  -- 8. Customer Consents
  INSERT INTO public.customer_consents (email, phone, email_marketing_opt_in, whatsapp_opt_in, logistics_consent_opt_in)
  VALUES (p_customer_email, p_customer_phone, p_email_opt_in, p_whatsapp_opt_in, p_logistics_consent)
  ON CONFLICT (email) DO UPDATE
  SET phone = EXCLUDED.phone,
      email_marketing_opt_in = EXCLUDED.email_marketing_opt_in,
      whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
      logistics_consent_opt_in = EXCLUDED.logistics_consent_opt_in,
      updated_at = now();

  -- 9. Registrar atómicamente el attempt de idempotencia dentro de la misma transacción PostgreSQL
  IF v_idempotency_key IS NOT NULL THEN
    INSERT INTO public.payment_attempts (
      order_id,
      user_id,
      provider,
      payment_method_type,
      attempt_number,
      amount,
      currency,
      normalized_status,
      provider_status,
      idempotency_key,
      initiated_at,
      metadata
    ) VALUES (
      v_order_id,
      p_customer_id,
      p_payment_method,
      p_payment_method,
      1,
      p_total_amount,
      p_currency,
      'initiated',
      'order_created',
      v_idempotency_key,
      now(),
      jsonb_build_object('checkout_request_key', TRIM(p_checkout_request_key))
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', p_total_amount,
    'currency', p_currency,
    'is_international', v_has_international,
    'reserved_until', v_reserved_until
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order_atomic_v2(uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, jsonb, boolean, timestamp with time zone, text, boolean, boolean, boolean, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, text, numeric, numeric, numeric, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic_v2(uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, jsonb, boolean, timestamp with time zone, text, boolean, boolean, boolean, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, text, numeric, numeric, numeric, text, boolean, text) TO service_role, postgres;
