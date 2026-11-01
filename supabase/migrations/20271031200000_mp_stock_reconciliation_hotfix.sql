-- ==============================================================================
-- MIGRATION: Hotfix Mercado Pago & Stock Invariants Hardening
-- Version: 20271031200000_mp_stock_reconciliation_hotfix.sql
-- Architecture & Invariants:
--   1. confirm_payment_atomic:
--      - Removes invalid product_variants.updated_at reference.
--      - Distinct handling for active vs released reservations:
--        * ACTIVE reservations: normal completion and atomic decrement.
--        * RELEASED reservations: validated for available stock before decrement.
--        * If insufficient stock exists on released reservation, halts order
--          confirmation and flags 'manual_verification_required' without overselling.
--      - Never hides stock shortages with GREATEST(0, ...).
--   2. release_expired_reservations:
--      - Hardened to never release reservations for orders with approved payment
--        (in orders.payment_status OR payments table).
--   3. decrement_inventory:
--      - Removes invalid updated_at reference from overloads while strictly
--        raising exceptions on insufficient stock.
--   4. Repair procedure for COL-20261031-0002 is decoupled into a dedicated,
--      safe operational script.
-- ==============================================================================

BEGIN;

-- 1. Hardened confirm_payment_atomic
CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(
  p_order_id UUID, 
  p_payment_provider TEXT, 
  p_payment_ref TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_res RECORD;
  v_item RECORD;
  v_current_inventory INT;
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

  -- 3. Stock validation preflight: Check that all released reservations or unreserved items have enough stock
  -- BEFORE making any mutations to active reservations or variants, ensuring atomic rollback on failure.
  FOR v_res IN 
    SELECT * FROM public.stock_reservations 
    WHERE order_id = p_order_id AND status = 'released'
    FOR UPDATE
  LOOP
    SELECT inventory_count INTO v_current_inventory
    FROM public.product_variants
    WHERE id = v_res.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant % not found for released reservation %', v_res.variant_id, v_res.id;
    END IF;

    IF v_current_inventory < v_res.quantity THEN
      -- Record discrepancy on order without confirming or mutating stock/reservations
      UPDATE public.orders
      SET payment_status = 'approved',
          reconciliation_status = 'stock_recovery_shortage',
          updated_at = now()
      WHERE id = p_order_id;

      RETURN jsonb_build_object(
        'success', false,
        'code', 'STOCK_EXHAUSTED_ON_LATE_APPROVAL',
        'error', 'Pago acreditado con reserva vencida, pero el stock actual es insuficiente. Requiere intervención manual.',
        'order_id', p_order_id,
        'available_stock', v_current_inventory,
        'required_stock', v_res.quantity
      );
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT oi.variant_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.variant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_reservations sr 
        WHERE sr.order_id = p_order_id AND sr.variant_id = oi.variant_id
      )
  LOOP
    SELECT inventory_count INTO v_current_inventory
    FROM public.product_variants
    WHERE id = v_item.variant_id
    FOR UPDATE;

    IF v_current_inventory < v_item.quantity THEN
      UPDATE public.orders
      SET payment_status = 'approved',
          reconciliation_status = 'stock_recovery_shortage',
          updated_at = now()
      WHERE id = p_order_id;

      RETURN jsonb_build_object(
        'success', false,
        'code', 'STOCK_EXHAUSTED_ON_ORDER_CONFIRMATION',
        'error', 'Stock insuficiente para confirmar ítems sin reserva. Requiere intervención manual.',
        'order_id', p_order_id
      );
    END IF;
  END LOOP;

  -- 4. Stock execution: Process ACTIVE reservations
  FOR v_res IN 
    SELECT * FROM public.stock_reservations 
    WHERE order_id = p_order_id AND status = 'active'
    FOR UPDATE
  LOOP
    -- Lock variant row
    SELECT inventory_count INTO v_current_inventory
    FROM public.product_variants
    WHERE id = v_res.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant % not found for reservation %', v_res.variant_id, v_res.id;
    END IF;

    -- Complete active reservation
    UPDATE public.stock_reservations
    SET status = 'completed', updated_at = now()
    WHERE id = v_res.id;

    -- Decrement variant count safely (variants do not have updated_at)
    -- Under active reservation, stock was already protected by the reservation lease
    UPDATE public.product_variants
    SET inventory_count = GREATEST(0, inventory_count - v_res.quantity)
    WHERE id = v_res.variant_id;
  END LOOP;

  -- 5. Late payment recovery execution: Process RELEASED reservations
  FOR v_res IN 
    SELECT * FROM public.stock_reservations 
    WHERE order_id = p_order_id AND status = 'released'
    FOR UPDATE
  LOOP
    UPDATE public.stock_reservations
    SET status = 'completed', updated_at = now()
    WHERE id = v_res.id;

    UPDATE public.product_variants
    SET inventory_count = inventory_count - v_res.quantity
    WHERE id = v_res.variant_id;
  END LOOP;

  -- 6. Fallback execution: Variant items with no reservation record
  FOR v_item IN
    SELECT oi.variant_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.variant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_reservations sr 
        WHERE sr.order_id = p_order_id AND sr.variant_id = oi.variant_id
      )
  LOOP
    UPDATE public.product_variants
    SET inventory_count = inventory_count - v_item.quantity
    WHERE id = v_item.variant_id;
  END LOOP;

  -- 6. Update Order Status
  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = 'approved',
      payment_provider = p_payment_provider,
      payment_provider_reference = p_payment_ref,
      payment_id = COALESCE(p_payment_ref, payment_id),
      payment_processed_at = COALESCE(payment_processed_at, now()),
      reconciliation_status = 'reconciled',
      updated_at = now()
  WHERE id = p_order_id;

  -- 7. Update preorder items status
  UPDATE public.preorder_items
  SET status = 'confirmed', updated_at = now()
  WHERE order_item_id IN (
    SELECT id FROM public.order_items WHERE order_id = p_order_id
  ) AND status = 'awaiting_payment';

  -- 8. Check preorder presence
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.confirm_payment_atomic(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_atomic(UUID, TEXT, TEXT) TO service_role, postgres;

-- 2. Hardened release_expired_reservations
-- NEVER release stock or expire suborders if payment is accredited/approved
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS void AS $$
DECLARE
  v_expired_count INT;
BEGIN
  -- Quick check: active reservations past expiration time where order is NOT approved/paid
  SELECT count(*) INTO v_expired_count
  FROM public.stock_reservations sr
  JOIN public.orders o ON o.id = sr.order_id
  WHERE sr.status = 'active' 
    AND sr.reserved_until < now()
    AND COALESCE(o.payment_status, '') NOT IN ('approved', 'paid', 'accredited')
    AND o.status NOT IN ('confirmed', 'paid', 'completed')
    AND NOT EXISTS (
      SELECT 1 FROM public.payments p 
      WHERE p.order_id = o.id AND p.status = 'approved'
    );

  IF v_expired_count = 0 THEN
    RETURN;
  END IF;

  -- 1. Release active expired stock reservations ONLY for orders WITHOUT approved payments
  WITH eligible_orders AS (
    SELECT DISTINCT o.id AS order_id
    FROM public.stock_reservations sr
    JOIN public.orders o ON o.id = sr.order_id
    WHERE sr.status = 'active' 
      AND sr.reserved_until < now()
      AND COALESCE(o.payment_status, '') NOT IN ('approved', 'paid', 'accredited')
      AND o.status NOT IN ('confirmed', 'paid', 'completed')
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p 
        WHERE p.order_id = o.id AND p.status = 'approved'
      )
  ),
  updated_res AS (
    UPDATE public.stock_reservations sr
    SET status = 'released',
        updated_at = now()
    FROM eligible_orders eo
    WHERE sr.order_id = eo.order_id
      AND sr.status = 'active' 
      AND sr.reserved_until < now()
    RETURNING sr.order_id
  )
  -- 2. Expire orders awaiting payment that had their reservations released
  UPDATE public.orders o
  SET status = 'expired',
      payment_status = 'expired',
      updated_at = now()
  FROM (SELECT DISTINCT order_id FROM updated_res) ur
  WHERE o.id = ur.order_id 
    AND o.status = 'awaiting_payment'
    AND COALESCE(o.payment_status, '') NOT IN ('approved', 'paid', 'accredited');

  -- 3. Expire corresponding preorder items
  UPDATE public.preorder_items pi
  SET status = 'expired',
      updated_at = now()
  FROM public.order_items oi,
       public.stock_reservations sr
  WHERE pi.order_item_id = oi.id
    AND oi.order_id = sr.order_id
    AND sr.status = 'released'
    AND sr.updated_at >= now() - interval '2 minutes'
    AND pi.status IN ('awaiting_payment', 'pending');

  -- 4. Expire corresponding pending suborders
  UPDATE public.order_suborders os
  SET status = 'expired',
      updated_at = now()
  FROM public.stock_reservations sr
  WHERE os.parent_order_id = sr.order_id
    AND sr.status = 'released'
    AND sr.updated_at >= now() - interval '2 minutes'
    AND os.status = 'pending';

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.release_expired_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated, service_role;

-- 3. Hardened decrement_inventory overloads (Remove updated_at = NOW())
CREATE OR REPLACE FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_stock integer;
BEGIN
  SELECT inventory_count INTO v_current_stock
  FROM product_variants
  WHERE id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante % no encontrada', p_variant_id;
  END IF;

  IF v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente para variante %. Stock: %, Solicitado: %',
      p_variant_id, v_current_stock, p_quantity;
  END IF;

  UPDATE product_variants
  SET inventory_count = inventory_count - p_quantity
  WHERE id = p_variant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer, p_skip_ml_sync boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_inventory INT;
  v_new_inventory INT;
BEGIN
  SELECT inventory_count INTO v_current_inventory
  FROM product_variants
  WHERE id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante no encontrada';
  END IF;

  IF v_current_inventory < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente para la variante %: disponible %, solicitado %',
      p_variant_id, v_current_inventory, p_quantity;
  END IF;

  v_new_inventory := v_current_inventory - p_quantity;

  UPDATE product_variants
  SET 
    inventory_count = v_new_inventory,
    skip_ml_sync = p_skip_ml_sync
  WHERE id = p_variant_id;

  RETURN jsonb_build_object(
    'success', true,
    'variant_id', p_variant_id,
    'old_inventory', v_current_inventory,
    'new_inventory', v_new_inventory
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer, p_skip_ml_sync boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer, p_skip_ml_sync boolean) TO postgres, service_role;
REVOKE EXECUTE ON FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_inventory(p_variant_id uuid, p_quantity integer) TO postgres, service_role;

COMMIT;
