-- 20271026183000_zinc_concurrency_and_scoped_cancellations.sql
-- Motor transaccional de concurrencia Zinc, aislamiento por ítem/suborden y consistencia financiera

-- 1. Ampliar estados de compra en international_order_items si hay restricciones
ALTER TABLE public.international_order_items DROP CONSTRAINT IF EXISTS international_order_items_purchase_status_check;

-- 2. Transición de reclamo atómico para envío externo
-- Reemplaza claim_international_order_item_for_zinc con control de exclusión
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
      AND uor.status IN ('CANCELLATION_CONFIRMED', 'APPROVED')
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

-- 3. Función RPC atómica para verificar y bloquear el ítem previo al POST a Zinc (Fail-Closed)
-- Aislada por order_item_id y suborder_id para no afectar ítems ajenos
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
  IF v_item.zinc_order_id IS NOT NULL AND v_item.purchase_status = 'zinc_order_created' THEN
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
    AND status IN ('CANCELLATION_CONFIRMED', 'APPROVED')
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
