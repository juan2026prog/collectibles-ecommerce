-- Production function snapshot with an additional explicit manual-reconciliation guard.
-- Applies prospectively; it does not restore an already released reservation or modify any existing order.
-- Keep the existing release, expiration, preorder and suborder handling unchanged.
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- A Handy callback pending manual verification is NOT an unpaid/abandoned order.
    AND o.reconciliation_status IS DISTINCT FROM 'pending_reconciliation'
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_attempts pa
      WHERE pa.order_id=o.id
        AND pa.normalized_status='manual_verification_required'
    )
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
    -- A Handy callback pending manual verification is NOT an unpaid/abandoned order.
    AND o.reconciliation_status IS DISTINCT FROM 'pending_reconciliation'
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_attempts pa
      WHERE pa.order_id=o.id
        AND pa.normalized_status='manual_verification_required'
    )
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
    AND COALESCE(o.payment_status, '') NOT IN ('approved', 'paid', 'accredited')
    -- A Handy callback pending manual verification is NOT an unpaid/abandoned order.
    AND o.reconciliation_status IS DISTINCT FROM 'pending_reconciliation'
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_attempts pa
      WHERE pa.order_id=o.id
        AND pa.normalized_status='manual_verification_required'
    );

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
$function$
;
