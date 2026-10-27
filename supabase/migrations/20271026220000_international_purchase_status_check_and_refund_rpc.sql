-- 20271026220000_international_purchase_status_check_and_refund_rpc.sql
-- Restricción estricta de estados de compra internacional y función atómica de reserva de saldo reembolsable

-- 1. Restablecer CHECK constraint explícita para purchase_status en international_order_items
ALTER TABLE public.international_order_items DROP CONSTRAINT IF EXISTS international_order_items_purchase_status_check;

ALTER TABLE public.international_order_items ADD CONSTRAINT international_order_items_purchase_status_check CHECK (
  purchase_status IN (
    'pending_purchase',
    'zinc_processing',
    'zinc_submitting',
    'zinc_order_created',
    'purchased',
    'warehouse_received',
    'shipped',
    'delivered',
    'shipped_to_courier',
    'delivered_to_courier',
    'cancellation_requested',
    'cancellation_requires_review',
    'cancelled',
    'manual_review',
    'zinc_failed',
    'return_in_progress',
    'return_credited'
  )
);

-- 2. Función RPC para reserva atómica y transaccional de reembolso (evita carreras en saldo disponible)
CREATE OR REPLACE FUNCTION public.acquire_refund_lock_atomic(
  p_order_id UUID,
  p_suborder_id UUID,
  p_amount NUMERIC,
  p_idempotency_key TEXT,
  p_provider TEXT,
  p_reason TEXT,
  p_requested_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_previously_refunded NUMERIC := 0;
  v_available NUMERIC := 0;
  v_in_flight_count INTEGER := 0;
  v_existing_completed RECORD;
  v_lock_id UUID;
BEGIN
  -- 1. Verificar idempotency_key existente en estado completed
  SELECT id, status, api_response INTO v_existing_completed
  FROM public.refunds
  WHERE idempotency_key = p_idempotency_key
    AND status = 'completed'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'refund_id', v_existing_completed.id,
      'refund_details', v_existing_completed.api_response
    );
  END IF;

  -- 2. Bloquear transaccionalmente la orden principal con FOR UPDATE
  SELECT id, total_amount, currency, status, payment_status INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada');
  END IF;

  -- 3. Bloquear si existe alguna operación en reconciliation_required
  PERFORM 1 FROM public.refunds
  WHERE order_id = p_order_id AND status = 'reconciliation_required';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Operación bloqueada: la orden tiene un reembolso previo en estado reconciliation_required. Se requiere conciliación administrativa previa.'
    );
  END IF;

  -- 4. Bloquear si existe un lock activo (processing) menor a 120 segundos
  SELECT COUNT(*) INTO v_in_flight_count
  FROM public.refunds
  WHERE order_id = p_order_id
    AND status = 'processing'
    AND created_at > now() - interval '120 seconds';

  IF v_in_flight_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Hay una operación de reembolso en proceso para esta orden. Por favor espera a que finalice.'
    );
  END IF;

  -- 5. Calcular saldo disponible de forma atómica dentro de la transacción bloqueada
  SELECT COALESCE(SUM(amount), 0) INTO v_previously_refunded
  FROM public.refunds
  WHERE order_id = p_order_id
    AND status IN ('completed', 'partial', 'processing');

  v_available := GREATEST(0, v_order.total_amount - v_previously_refunded);

  IF p_amount > (v_available + 0.01) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('El importe solicitado ($%s) supera el saldo disponible reembolsable ($%s). Total orden: $%s, acumulado previo/en proceso: $%s',
        p_amount::text, v_available::text, v_order.total_amount::text, v_previously_refunded::text)
    );
  END IF;

  -- 6. Insertar lock atómico 'processing' reservando el importe
  INSERT INTO public.refunds (
    order_id,
    suborder_id,
    provider,
    amount,
    reason,
    status,
    idempotency_key,
    requested_by,
    api_response
  ) VALUES (
    p_order_id,
    p_suborder_id,
    p_provider,
    p_amount,
    COALESCE(p_reason, 'Intención de reembolso en proceso'),
    'processing',
    p_idempotency_key,
    p_requested_by,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'lock_timestamp', now()
    )
  ) RETURNING id INTO v_lock_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'lock_id', v_lock_id,
    'available_remaining', v_available - p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_refund_lock_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_refund_lock_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID) TO service_role, postgres;
