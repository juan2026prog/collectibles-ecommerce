-- 20271026233000_item_level_refunds_and_idempotency_hardening.sql
-- 1. Agregar soporte para order_item_id y quantity en refunds
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- 2. Asegurar columnas de tracking en order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'refunded', 'cancellation_pending')),
  ADD COLUMN IF NOT EXISTS refunded_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC DEFAULT 0.00;

-- 3. Crear índice para refunds por item
CREATE INDEX IF NOT EXISTS idx_refunds_order_item_id ON public.refunds(order_item_id) WHERE order_item_id IS NOT NULL;

-- 4. Actualizar acquire_refund_lock_atomic con soporte para item-level y resolución segura de idempotencia
CREATE OR REPLACE FUNCTION public.acquire_refund_lock_atomic(
  p_order_id UUID,
  p_suborder_id UUID,
  p_amount NUMERIC,
  p_idempotency_key TEXT,
  p_provider TEXT,
  p_reason TEXT,
  p_requested_by UUID,
  p_order_item_id UUID DEFAULT NULL
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
  v_existing RECORD;
  v_lock_id UUID;
BEGIN
  -- 1. Validar si la idempotency_key ya fue utilizada en public.refunds
  SELECT id, order_id, suborder_id, order_item_id, status, amount, provider_refund_id, api_response INTO v_existing
  FROM public.refunds
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    -- Validar que la clave no pertenezca a otra orden distinta (prevención de usurpación de clave)
    IF v_existing.order_id != p_order_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'La clave de idempotencia ya existe pero pertenece a una orden diferente.'
      );
    END IF;

    -- Si la operación ya fue completada exitosamente, replay idempotente inmediato
    IF v_existing.status = 'completed' OR v_existing.status = 'partial' THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'refund_id', v_existing.id,
        'status', v_existing.status,
        'amount', v_existing.amount,
        'refund_details', v_existing.api_response
      );
    END IF;

    -- Si está en reconciliation_required, bloquear reintentos automáticos
    IF v_existing.status = 'reconciliation_required' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Operación bloqueada: esta solicitud se encuentra en reconciliation_required y requiere conciliación administrativa manual.'
      );
    END IF;

    -- Si está en processing activo (menor a 120s), informar que está en curso
    IF v_existing.status = 'processing' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Hay una operación de reembolso en proceso con esta misma clave. Por favor aguarda a que finalice.'
      );
    END IF;
  END IF;

  -- 2. Bloquear transaccionalmente la orden principal con FOR UPDATE
  SELECT id, total_amount, currency, status, payment_status INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada');
  END IF;

  -- 3. Bloquear si existe alguna operación en reconciliation_required para este pedido
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
    order_item_id,
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
    p_order_item_id,
    p_provider,
    p_amount,
    COALESCE(p_reason, 'Intención de reembolso en proceso'),
    'processing',
    p_idempotency_key,
    p_requested_by,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'order_item_id', p_order_item_id,
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

REVOKE ALL ON FUNCTION public.acquire_refund_lock_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_refund_lock_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID) TO service_role, postgres;
