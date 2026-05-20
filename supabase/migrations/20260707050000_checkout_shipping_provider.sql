-- Update create_order_atomic to automatically set shipping_provider on order creation
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_customer_id uuid,
  p_total_amount numeric,
  p_currency text,
  p_payment_method text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_affiliate_id uuid,
  p_coupon_id uuid,
  p_items jsonb -- Array of {product_id, variant_id, quantity, unit_price}
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
  IF p_shipping_address->>'shipping_method' = 'delivery' THEN
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
    shipping_provider
  ) VALUES (
    p_customer_id, p_total_amount, p_currency, 'pending',
    p_payment_method, p_customer_email, p_customer_phone,
    p_shipping_address, p_affiliate_id, p_coupon_id,
    v_shipping_provider
  )
  RETURNING id INTO v_order_id;

  -- 3. Insert all order items (same transaction)
  INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total_price)
  SELECT
    v_order_id,
    (item->>'product_id')::uuid,
    NULLIF(item->>'variant_id', '')::uuid,
    (item->>'quantity')::integer,
    (item->>'unit_price')::numeric,
    (item->>'unit_price')::numeric * (item->>'quantity')::integer
  FROM jsonb_array_elements(p_items) AS item;

  -- 4. Return the created order details
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'status', 'pending',
    'total_amount', p_total_amount,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
