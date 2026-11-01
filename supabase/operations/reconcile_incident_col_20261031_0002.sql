-- ==============================================================================
-- OPERATIONAL REPAIR SCRIPT: Incident COL-20261031-0002 Stock Correction
-- Target Order: 95c110c1-942c-48ef-9f9a-5e4eec6c1f00
-- Target Variant: 4528dd85-c3e3-41d0-99ed-95fc0656844d
-- Guarantee: Single execution, transactional lock, idempotent replay defense.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_target_order_id UUID := '95c110c1-942c-48ef-9f9a-5e4eec6c1f00';
  v_target_variant_id UUID := '4528dd85-c3e3-41d0-99ed-95fc0656844d';
  v_res RECORD;
  v_order RECORD;
  v_current_inventory INT;
BEGIN
  -- 1. Inspect and lock order row
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_target_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % does not exist.', v_target_order_id;
  END IF;

  IF v_order.status <> 'confirmed' OR v_order.payment_status <> 'approved' THEN
    RAISE EXCEPTION 'Order % is in status % / %, expected confirmed / approved.',
      v_target_order_id, v_order.status, v_order.payment_status;
  END IF;

  -- 2. Inspect and lock the released stock reservation row
  SELECT * INTO v_res 
  FROM public.stock_reservations 
  WHERE order_id = v_target_order_id 
    AND status = 'released' 
    AND variant_id = v_target_variant_id
  FOR UPDATE;

  -- If reservation was already completed by previous execution, exit safely
  IF NOT FOUND THEN
    SELECT status INTO v_res FROM public.stock_reservations WHERE order_id = v_target_order_id;
    RAISE NOTICE 'Reservation for order % is already in status %. Stock was already reconciled. No action taken.', 
      v_target_order_id, v_res.status;
    RETURN;
  END IF;

  -- 3. Inspect and lock variant inventory
  SELECT inventory_count INTO v_current_inventory
  FROM public.product_variants
  WHERE id = v_target_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant % does not exist.', v_target_variant_id;
  END IF;

  IF v_current_inventory < v_res.quantity THEN
    RAISE EXCEPTION 'Insufficient stock to reconcile variant % (current: %, needed: %).',
      v_target_variant_id, v_current_inventory, v_res.quantity;
  END IF;

  -- 4. Reconcile stock deduction exactly 1 unit
  UPDATE public.product_variants
  SET inventory_count = inventory_count - v_res.quantity
  WHERE id = v_target_variant_id;

  -- 5. Mark reservation as completed to prevent duplicate reconciliation
  UPDATE public.stock_reservations
  SET status = 'completed', updated_at = now()
  WHERE id = v_res.id;

  RAISE NOTICE 'SUCCESS: Order % reconciled. Variant % inventory decremented from % to %. Reservation % completed.',
    v_target_order_id, v_target_variant_id, v_current_inventory, (v_current_inventory - v_res.quantity), v_res.id;
END $$;

COMMIT;
