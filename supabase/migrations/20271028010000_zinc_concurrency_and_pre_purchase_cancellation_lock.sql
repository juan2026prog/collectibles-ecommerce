-- 20271028010000_zinc_concurrency_and_pre_purchase_cancellation_lock.sql
-- HOTFIX DEFINITIVO: Seguridad transaccional Zinc, exclusión mutua estricta y protección financiera precompra

-- 1. Actualizar claim_international_order_item_for_zinc para verificar estado y solicitudes de cancelación confirmadas
CREATE OR REPLACE FUNCTION public.claim_international_order_item_for_zinc(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated integer := 0;
    v_item RECORD;
    v_cancelled_req RECORD;
BEGIN
    -- 1. Bloquear y verificar el ítem
    SELECT * INTO v_item
    FROM public.international_order_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Si ya no está en estado pending_purchase, no se puede reclamar
    IF v_item.purchase_status != 'pending_purchase' THEN
        RETURN false;
    END IF;

    -- 2. Verificar si existe cancelación autorizada para este ítem o suborden específica
    SELECT uor.id INTO v_cancelled_req
    FROM public.unified_order_requests uor
    JOIN public.order_items oi ON oi.order_id = uor.order_id
    WHERE oi.id = v_item.order_item_id
      AND uor.status IN ('CANCELLATION_CONFIRMED', 'APPROVED', 'REFUNDED')
      AND (
        uor.order_item_id = v_item.order_item_id
        OR (uor.order_item_id IS NULL AND uor.suborder_id = oi.suborder_id)
        OR (uor.order_item_id IS NULL AND uor.suborder_id IS NULL)
      )
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.international_order_items
        SET purchase_status = 'cancelled',
            review_reason_code = 'CANCELLED_BEFORE_CLAIM',
            updated_at = now()
        WHERE id = p_item_id;
        RETURN false;
    END IF;

    -- 3. Transicionar atómicamente a zinc_processing
    UPDATE public.international_order_items
    SET purchase_status = 'zinc_processing',
        updated_at = now()
    WHERE id = p_item_id
      AND purchase_status = 'pending_purchase';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_international_order_item_for_zinc(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_international_order_item_for_zinc(uuid) TO service_role, postgres;

-- 2. Actualizar check_and_lock_zinc_purchase_item
CREATE OR REPLACE FUNCTION public.check_and_lock_zinc_purchase_item(
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_parent_item RECORD;
  v_cancelled_req RECORD;
BEGIN
  -- Bloquear la fila del item internacional
  SELECT * INTO v_item
  FROM public.international_order_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ITEM_NOT_FOUND');
  END IF;

  -- Si el item ya fue cancelado localmente
  IF v_item.purchase_status = 'cancelled' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ALREADY_CANCELLED');
  END IF;

  -- Si ya fue enviado previamente a Zinc y tiene zinc_order_id
  IF v_item.zinc_order_id IS NOT NULL OR v_item.purchase_status IN ('zinc_order_created', 'zinc_processing', 'purchased', 'warehouse_received', 'shipped', 'delivered', 'shipped_to_courier', 'delivered_to_courier') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ALREADY_SUBMITTED_TO_ZINC', 'zinc_order_id', v_item.zinc_order_id);
  END IF;

  -- Obtener suborder_id del order_item padre para respetar ámbito parcial
  SELECT id, order_id, suborder_id INTO v_parent_item
  FROM public.order_items
  WHERE id = v_item.order_item_id;

  -- Comprobar si existe una solicitud de cancelación autorizada para este artículo o su suborden
  SELECT id, status, request_type INTO v_cancelled_req
  FROM public.unified_order_requests
  WHERE order_id = v_parent_item.order_id
    AND status IN ('CANCELLATION_CONFIRMED', 'APPROVED', 'REFUNDED')
    AND request_type IN ('cancel_immediate_10m', 'cancel_international_zinc', 'cancel_before_payment')
    AND (
      order_item_id = v_parent_item.id
      OR (order_item_id IS NULL AND suborder_id = v_parent_item.suborder_id)
      OR (order_item_id IS NULL AND suborder_id IS NULL)
    )
  LIMIT 1;

  IF FOUND THEN
    -- Abortar compra y marcar el item como cancelado de forma atómica
    UPDATE public.international_order_items
    SET purchase_status = 'cancelled',
        review_reason_code = 'CANCELLED_BEFORE_ZINC_SUBMISSION',
        updated_at = now()
    WHERE id = p_item_id;

    RETURN jsonb_build_object(
      'allowed', false, 
      'reason', 'CANCELLATION_AUTHORIZED', 
      'request_id', v_cancelled_req.id,
      'request_status', v_cancelled_req.status
    );
  END IF;

  -- Transicionar el estado del item a zinc_submitting para exclusión mutua
  UPDATE public.international_order_items
  SET purchase_status = 'zinc_submitting',
      updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'allowed', true, 
    'purchase_status', 'zinc_submitting',
    'order_item_id', v_parent_item.id,
    'suborder_id', v_parent_item.suborder_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_lock_zinc_purchase_item(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_lock_zinc_purchase_item(UUID) TO service_role, postgres;

-- 3. Nueva RPC atómica de cancelación precompra: authorize_and_confirm_zinc_cancellation
-- Exclusión mutua estricta con claim_international_order_item_for_zinc y check_and_lock_zinc_purchase_item
CREATE OR REPLACE FUNCTION public.authorize_and_confirm_zinc_cancellation(
  p_order_id UUID,
  p_suborder_id UUID DEFAULT NULL,
  p_order_item_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_customer_notes TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_matched_items RECORD;
  v_intl_item RECORD;
  v_existing_req RECORD;
  v_target_amount NUMERIC := 0.00;
  v_target_qty INTEGER := 0;
  v_approved_statuses TEXT[] := ARRAY[
    'zinc_order_created', 'zinc_processing', 'purchased', 
    'warehouse_received', 'shipped', 'delivered', 
    'shipped_to_courier', 'delivered_to_courier'
  ];
  v_item_ids UUID[] := ARRAY[]::UUID[];
  v_intl_ids UUID[] := ARRAY[]::UUID[];
  v_has_submitting BOOLEAN := FALSE;
  v_has_approved BOOLEAN := FALSE;
  v_has_processing_jobs BOOLEAN := FALSE;
  v_remaining_active_count INTEGER := 0;
  v_req_id UUID;
BEGIN
  -- 1. Idempotency check rápido
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_req
    FROM public.unified_order_requests
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', (v_existing_req.status IN ('CANCELLATION_CONFIRMED', 'REFUNDED', 'APPROVED')),
        'idempotent', true,
        'status', v_existing_req.status,
        'request_id', v_existing_req.id,
        'amount', v_existing_req.amount_requested,
        'order_item_id', v_existing_req.order_item_id,
        'suborder_id', v_existing_req.suborder_id
      );
    END IF;
  END IF;

  -- 2. Validar orden padre y bloquear fila
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'Orden no encontrada');
  END IF;

  -- 3. Identificar y bloquear items de la orden en alcance (order_items)
  -- FOR UPDATE bloquea los registros para evitar escrituras concurrentes
  FOR v_matched_items IN
    SELECT oi.*
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND (p_order_item_id IS NULL OR oi.id = p_order_item_id)
      AND (p_suborder_id IS NULL OR oi.suborder_id = p_suborder_id)
    ORDER BY oi.id
    FOR UPDATE
  LOOP
    v_item_ids := array_append(v_item_ids, v_matched_items.id);
    v_target_amount := v_target_amount + COALESCE(v_matched_items.final_total, v_matched_items.total_price, (v_matched_items.unit_price * v_matched_items.quantity));
    IF p_order_item_id IS NOT NULL THEN
      v_target_qty := v_matched_items.quantity;
    END IF;
  END LOOP;

  IF array_length(v_item_ids, 1) IS NULL OR array_length(v_item_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ITEMS_FOUND', 'message', 'No se encontraron artículos en el alcance seleccionado');
  END IF;

  -- 4. Identificar y bloquear los international_order_items bajo FOR UPDATE estricto
  FOR v_intl_item IN
    SELECT *
    FROM public.international_order_items
    WHERE order_item_id = ANY(v_item_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    v_intl_ids := array_append(v_intl_ids, v_intl_item.id);

    -- Comprobar si ya fue aprobado o tiene orden externa en Zinc
    IF v_intl_item.zinc_order_id IS NOT NULL OR v_intl_item.purchase_status = ANY(v_approved_statuses) THEN
      v_has_approved := TRUE;
    END IF;

    -- Comprobar si está en vuelo (zinc_submitting)
    IF v_intl_item.purchase_status = 'zinc_submitting' THEN
      v_has_submitting := TRUE;
    END IF;
  END LOOP;

  IF array_length(v_intl_ids, 1) IS NULL OR array_length(v_intl_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_INTERNATIONAL_ITEMS', 'message', 'No se encontraron registros internacionales para los artículos seleccionados');
  END IF;

  -- 5. REGLA OBLIGATORIA 1: Si ya fue aprobado en Zinc -> Rechazo 409 con error ZINC_PURCHASE_ALREADY_APPROVED
  IF v_has_approved THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ZINC_PURCHASE_ALREADY_APPROVED',
      'status_code', 409,
      'message', 'Tu compra internacional ya fue confirmada y aprobada con el proveedor exterior (Amazon/Zinc). No admite cancelación voluntaria por arrepentimiento comercial.'
    );
  END IF;

  -- 6. REGLA OBLIGATORIA 2: Si está en zinc_submitting o hay jobs activos ejecutándose
  SELECT EXISTS(
    SELECT 1 FROM public.order_execution_jobs
    WHERE order_id = p_order_id
      AND job_type IN ('zinc_fulfillment', 'zinc_purchase', 'post_payment_execution')
      AND status = 'PROCESSING'
  ) INTO v_has_processing_jobs;

  IF v_has_submitting OR v_has_processing_jobs THEN
    -- Registrar solicitud CANCELLATION_PENDING para revisión segura
    INSERT INTO public.unified_order_requests (
      order_id,
      suborder_id,
      order_item_id,
      customer_id,
      business_model,
      request_type,
      status,
      amount_requested,
      currency,
      reason,
      customer_notes,
      admin_notes,
      idempotency_key
    ) VALUES (
      p_order_id,
      p_suborder_id,
      p_order_item_id,
      COALESCE(p_customer_id, v_order.customer_id, v_order.user_id),
      'collectibles_international',
      'cancel_international_zinc',
      'CANCELLATION_PENDING',
      v_target_amount,
      COALESCE(v_order.currency, 'UYU'),
      p_reason,
      p_customer_notes,
      'Transaccional: Compra en proceso de envío (zinc_submitting / worker PROCESSING). Pendiente de confirmación.',
      p_idempotency_key
    ) RETURNING id INTO v_req_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ZINC_PURCHASE_SUBMITTING',
      'status_code', 202,
      'cancellation_pending', true,
      'request_id', v_req_id,
      'message', 'Tu compra internacional está siendo procesada por el proveedor. Estamos confirmando su estado.'
    );
  END IF;

  -- 7. REGLA OBLIGATORIA 3: Cancelación Precompra Atómica Autorizada
  -- En este punto, todos los ítems están bajo FOR UPDATE y su estado es pending_purchase
  -- A. Actualizar international_order_items a 'cancelled'
  UPDATE public.international_order_items
  SET purchase_status = 'cancelled',
      review_reason_code = 'CANCELLED_BEFORE_ZINC_SUBMISSION',
      updated_at = now()
  WHERE id = ANY(v_intl_ids);

  -- B. Actualizar order_items a 'cancelled'
  UPDATE public.order_items
  SET status = 'cancelled'
  WHERE id = ANY(v_item_ids);

  -- C. Coordinar order_execution_jobs:
  -- Comprobar si quedan otros artículos internacionales activos en la orden
  SELECT count(*) INTO v_remaining_active_count
  FROM public.international_order_items ioi
  JOIN public.order_items oi ON oi.id = ioi.order_item_id
  WHERE oi.order_id = p_order_id
    AND ioi.purchase_status NOT IN ('cancelled', 'zinc_failed')
    AND oi.id != ALL(v_item_ids);

  IF v_remaining_active_count = 0 THEN
    -- Cancelar jobs encolados pendientes para esta orden
    UPDATE public.order_execution_jobs
    SET status = 'CANCELLED',
        last_error = 'Cancelado transaccionalmente por solicitud de cancelación precompra',
        updated_at = now()
    WHERE order_id = p_order_id
      AND job_type IN ('zinc_fulfillment', 'zinc_purchase')
      AND status IN ('PENDING', 'RETRYING', 'QUEUED', 'WAITING');
  END IF;

  -- D. Registrar unified_order_requests con estado CANCELLATION_CONFIRMED
  INSERT INTO public.unified_order_requests (
    order_id,
    suborder_id,
    order_item_id,
    customer_id,
    business_model,
    request_type,
    status,
    amount_requested,
    amount_approved,
    currency,
    reason,
    customer_notes,
    idempotency_key
  ) VALUES (
    p_order_id,
    p_suborder_id,
    p_order_item_id,
    COALESCE(p_customer_id, v_order.customer_id, v_order.user_id),
    'collectibles_international',
    'cancel_international_zinc',
    'CANCELLATION_CONFIRMED',
    v_target_amount,
    v_target_amount,
    COALESCE(v_order.currency, 'UYU'),
    p_reason,
    p_customer_notes,
    p_idempotency_key
  ) RETURNING id INTO v_req_id;

  RETURN jsonb_build_object(
    'success', true,
    'status_code', 200,
    'cancellation_confirmed', true,
    'request_id', v_req_id,
    'amount', v_target_amount,
    'quantity', v_target_qty,
    'cancelled_order_item_ids', v_item_ids,
    'cancelled_intl_item_ids', v_intl_ids,
    'message', 'Compra internacional cancelada localmente de manera segura y definitiva antes de envío a proveedor.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_and_confirm_zinc_cancellation(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_and_confirm_zinc_cancellation(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID) TO service_role, postgres;
