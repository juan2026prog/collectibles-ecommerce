-- ============================================================
-- SECURITY FIXES MIGRATION
-- Fixes: admin promotion trigger, atomic checkout RPC,
-- idempotent webhook processing, inventory race conditions
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FIX 1: ADMIN PROMOTION TRIGGER
-- The previous trigger blocks service_role from promoting admins
-- because auth.uid() returns NULL in service_role context.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_self_admin_promotion()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow service_role (Edge Functions, Supabase Dashboard) to bypass
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block non-admins from self-promoting to admin
  IF NEW.is_admin = true AND OLD.is_admin = false THEN
    IF NOT (SELECT is_admin FROM profiles WHERE id = auth.uid()) THEN
      RAISE EXCEPTION 'No tiene permisos para promover a administrador.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────
-- FIX 2: ATOMIC CHECKOUT RPC
-- Replaces the two-step insert in checkout-handler with a
-- single atomic transaction. Prevents ghost orders.
-- ────────────────────────────────────────────────────────────
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

  -- 2. Create the order
  INSERT INTO orders (
    customer_id, total_amount, currency, status,
    payment_method, customer_email, customer_phone,
    shipping_address, affiliate_id, coupon_id
  ) VALUES (
    p_customer_id, p_total_amount, p_currency, 'pending',
    p_payment_method, p_customer_email, p_customer_phone,
    p_shipping_address, p_affiliate_id, p_coupon_id
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


-- ────────────────────────────────────────────────────────────
-- FIX 3: IDEMPOTENT WEBHOOK PROCESSING
-- Add a processed_at column to orders to prevent double-processing
-- of the same webhook (dLocal, MercadoPago, PayPal).
-- ────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_processed_at timestamptz;

-- Index for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_orders_payment_processed
  ON orders(payment_id, payment_processed_at);


-- ────────────────────────────────────────────────────────────
-- FIX 4: INVENTORY DECREMENT WITH PROPER LOCKING
-- Replace the naive decrement with a version that uses
-- SELECT FOR UPDATE to prevent race conditions.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decrement_inventory(p_variant_id uuid, p_quantity integer)
RETURNS void AS $$
DECLARE
  v_current_stock integer;
BEGIN
  -- Lock the row to prevent concurrent decrements
  SELECT inventory_count INTO v_current_stock
  FROM product_variants
  WHERE id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante % no encontrada', p_variant_id;
  END IF;

  IF v_current_stock < p_quantity THEN
    RAISE WARNING 'Stock insuficiente para variante %. Stock: %, Solicitado: %. Decrementando a 0.',
      p_variant_id, v_current_stock, p_quantity;
  END IF;

  UPDATE product_variants
  SET inventory_count = GREATEST(inventory_count - p_quantity, 0)
  WHERE id = p_variant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
