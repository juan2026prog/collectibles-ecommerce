-- Fix create_order_atomic to persist vendor_id in order_items
-- Also fixes 'price' mapping which was previously looking for 'unit_price'

DROP FUNCTION IF EXISTS public.create_order_atomic(
  uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, boolean, timestamp with time zone, text
);

DROP FUNCTION IF EXISTS public.create_order_atomic(
  uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, boolean, timestamp with time zone, text, boolean, boolean
);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
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
  p_terms_accepted boolean DEFAULT false,
  p_terms_accepted_at timestamp with time zone DEFAULT NULL,
  p_accepted_terms_version text DEFAULT NULL,
  p_email_opt_in boolean DEFAULT false,
  p_whatsapp_opt_in boolean DEFAULT false
)
RETURNS jsonb AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_variant_stock integer;
  v_shipping_provider text := NULL;
BEGIN
  -- 1. Verify stock for all items FIRST (within the transaction)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
      SELECT inventory_count INTO v_variant_stock
      FROM product_variants
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

  -- 2. Create the order
  INSERT INTO orders (
    customer_id, total_amount, currency, status,
    payment_method, customer_email, customer_phone,
    shipping_address, affiliate_id, coupon_id,
    shipping_provider, terms_accepted, terms_accepted_at,
    accepted_terms_version
  ) VALUES (
    p_customer_id, p_total_amount, p_currency, 'pending',
    p_payment_method, p_customer_email, p_customer_phone,
    p_shipping_address, p_affiliate_id, p_coupon_id,
    v_shipping_provider, p_terms_accepted, p_terms_accepted_at,
    p_accepted_terms_version
  )
  RETURNING id INTO v_order_id;

  -- 3. Insert all order items (same transaction)
  INSERT INTO order_items (order_id, product_id, variant_id, vendor_id, quantity, unit_price, total_price)
  SELECT
    v_order_id,
    (item->>'product_id')::uuid,
    NULLIF(item->>'variant_id', '')::uuid,
    NULLIF(item->>'vendor_id', '')::uuid,
    (item->>'quantity')::integer,
    COALESCE((item->>'price')::numeric, (item->>'unit_price')::numeric, 0),
    COALESCE((item->>'price')::numeric, (item->>'unit_price')::numeric, 0) * (item->>'quantity')::integer
  FROM jsonb_array_elements(p_items) AS item;

  -- 4. Mark abandoned checkout as converted if exists
  UPDATE abandoned_checkouts
  SET status = 'converted', updated_at = now()
  WHERE email = p_customer_email AND status = 'abandoned';

  -- 5. Upsert customer consents
  INSERT INTO customer_consents (email, phone, email_marketing_opt_in, whatsapp_opt_in)
  VALUES (p_customer_email, p_customer_phone, p_email_opt_in, p_whatsapp_opt_in)
  ON CONFLICT (email) DO UPDATE SET
    phone = EXCLUDED.phone,
    email_marketing_opt_in = EXCLUDED.email_marketing_opt_in,
    whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
    updated_at = now();

  -- 6. Return the created order details
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'status', 'pending',
    'total_amount', p_total_amount,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
