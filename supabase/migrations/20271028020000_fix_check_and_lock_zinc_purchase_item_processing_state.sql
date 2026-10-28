-- 20271028020000_fix_check_and_lock_zinc_purchase_item_processing_state.sql
-- HOTFIX QUIRÚRGICO: Restaurar compra Zinc permitiendo transición legítima zinc_processing -> zinc_submitting

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
  -- 1. Bloquear y validar la fila del item internacional bajo FOR UPDATE
  SELECT * INTO v_item
  FROM public.international_order_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ITEM_NOT_FOUND');
  END IF;

  -- 2. Si el item ya fue cancelado localmente
  IF v_item.purchase_status = 'cancelled' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ALREADY_CANCELLED');
  END IF;

  -- 3. Si ya fue enviado previamente a Zinc o cuenta con orden externa creada
  IF v_item.zinc_order_id IS NOT NULL OR v_item.purchase_status IN (
    'zinc_order_created', 'zinc_submitting', 'purchased', 
    'warehouse_received', 'shipped', 'delivered', 
    'shipped_to_courier', 'delivered_to_courier'
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false, 
      'reason', 'ALREADY_SUBMITTED_TO_ZINC', 
      'purchase_status', v_item.purchase_status,
      'zinc_order_id', v_item.zinc_order_id
    );
  END IF;

  -- 4. Exigir que el estado sea legítimamente zinc_processing (previamente reclamado por el worker)
  -- No permitir que llamadas arbitrarias se salten el claim inicial ni acepten estados no preparados
  IF v_item.purchase_status != 'zinc_processing' THEN
    RETURN jsonb_build_object(
      'allowed', false, 
      'reason', 'INVALID_PURCHASE_STATE_FOR_PRE_LOCK', 
      'purchase_status', v_item.purchase_status
    );
  END IF;

  -- 5. Validar identificadores y consistencia del order_item padre
  SELECT id, order_id, suborder_id INTO v_parent_item
  FROM public.order_items
  WHERE id = v_item.order_item_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'PARENT_ORDER_ITEM_NOT_FOUND');
  END IF;

  -- 6. Comprobar si existe una solicitud de cancelación autorizada o incompatible para este artículo o su suborden/orden
  SELECT id, status, request_type INTO v_cancelled_req
  FROM public.unified_order_requests
  WHERE order_id = v_parent_item.order_id
    AND status IN ('CANCELLATION_CONFIRMED', 'APPROVED', 'REFUNDED', 'CANCELLATION_PENDING')
    AND request_type IN ('cancel_immediate_10m', 'cancel_international_zinc', 'cancel_before_payment')
    AND (
      order_item_id = v_parent_item.id
      OR (order_item_id IS NULL AND suborder_id = v_parent_item.suborder_id)
      OR (order_item_id IS NULL AND suborder_id IS NULL)
    )
  LIMIT 1;

  IF FOUND THEN
    -- Si hay cancelación confirmada, abortar compra y marcar el item como cancelado de forma atómica
    IF v_cancelled_req.status IN ('CANCELLATION_CONFIRMED', 'APPROVED', 'REFUNDED') THEN
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
    ELSE
      -- Si hay una solicitud pendiente de revisión (CANCELLATION_PENDING), bloquear el envío externo
      RETURN jsonb_build_object(
        'allowed', false, 
        'reason', 'CANCELLATION_PENDING_REVIEW', 
        'request_id', v_cancelled_req.id,
        'request_status', v_cancelled_req.status
      );
    END IF;
  END IF;

  -- 7. Transición atómica y legítima a zinc_submitting bajo exclusión mutua
  UPDATE public.international_order_items
  SET purchase_status = 'zinc_submitting',
      updated_at = now()
  WHERE id = p_item_id
    AND purchase_status = 'zinc_processing';

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
