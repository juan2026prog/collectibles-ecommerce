-- Migration: RPC cancel_unpaid_order for secure customer self-service cancellation of unpaid orders
-- Date: 2027-11-04

CREATE OR REPLACE FUNCTION public.cancel_unpaid_order(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Cancelación solicitada por el cliente antes del pago'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_order RECORD;
    v_has_approved_payment BOOLEAN := FALSE;
    v_res_count INT := 0;
BEGIN
    -- 1. Identificar al usuario llamador
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED',
            'message', 'Debes iniciar sesión para realizar esta operación.'
        );
    END IF;

    -- Verificar si es administrador
    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles
    WHERE id = v_user_id;

    -- 2. Bloquear la orden con FOR UPDATE para evitar concurrencias
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORDER_NOT_FOUND',
            'message', 'La orden especificada no existe.'
        );
    END IF;

    -- 3. Validar permisos: debe ser el dueño (customer_id o user_id) o admin
    IF NOT v_is_admin AND v_order.customer_id IS DISTINCT FROM v_user_id AND v_order.user_id IS DISTINCT FROM v_user_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'FORBIDDEN',
            'message', 'No tienes permisos para cancelar esta orden.'
        );
    END IF;

    -- 4. Idempotencia: si ya está cancelada o expirada
    IF v_order.status IN ('cancelada', 'cancelled') THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'status', v_order.status,
            'message', 'La orden ya se encuentra cancelada.'
        );
    END IF;

    -- 5. Verificar que NO exista un pago aprobado
    SELECT EXISTS (
        SELECT 1 FROM public.payments
        WHERE order_id = p_order_id AND status = 'approved'
    ) INTO v_has_approved_payment;

    IF v_has_approved_payment OR COALESCE(v_order.payment_status, '') IN ('approved', 'paid', 'refunded', 'partially_refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PAYMENT_EXISTS',
            'message', 'La orden posee un pago registrado. Debe gestionarse mediante solicitud de resolución y reembolso.'
        );
    END IF;

    -- 6. Verificar que la orden no esté ya en preparación, despachada o entregada
    IF v_order.status IN ('processing', 'shipped', 'delivered', 'confirmed', 'paid') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_ORDER_STATE',
            'message', 'La orden no se puede cancelar directamente porque ya se encuentra en proceso o despachada.'
        );
    END IF;

    -- 7. Actualizar la orden a cancelada
    UPDATE public.orders
    SET status = 'cancelada',
        payment_status = CASE 
            WHEN payment_status IN ('expired') THEN 'expired'
            ELSE 'cancelled'
        END,
        delivery_notes = COALESCE(delivery_notes || E'\n', '') || '[Cancelación Cliente] ' || p_reason,
        updated_at = now()
    WHERE id = p_order_id;

    -- 8. Actualizar subórdenes asociadas
    UPDATE public.order_suborders
    SET status = 'cancelled',
        liquidation_status = 'cancelled',
        cancellation_requested_at = now(),
        cancellation_reason = p_reason,
        updated_at = now()
    WHERE parent_order_id = p_order_id
      AND status NOT IN ('delivered', 'shipped');

    -- 9. Liberar reservas de stock de esta orden
    UPDATE public.stock_reservations
    SET status = 'released',
        updated_at = now()
    WHERE order_id = p_order_id
      AND status = 'active';
    GET DIAGNOSTICS v_res_count = ROW_COUNT;

    -- 10. Actualizar items de preventa si correspondiera
    UPDATE public.preorder_items pi
    SET status = 'cancelled',
        updated_at = now()
    FROM public.order_items oi
    WHERE pi.order_item_id = oi.id
      AND oi.order_id = p_order_id
      AND pi.status IN ('awaiting_payment', 'pending');

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'cancelada',
        'released_reservations', v_res_count,
        'message', 'Orden cancelada exitosamente y stock liberado.'
    );
END;
$$;

-- Permisos de ejecución para usuarios autenticados
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_order(UUID, TEXT) TO service_role;
