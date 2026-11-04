-- Migration: 20271104000400_harden_cancel_unpaid_order_mp_active_pref.sql
-- 1. Bloquea cancelación si existe una preferencia externa o checkout activo sin conciliar
-- 2. Asegura auditoría con trace_id generado y campos NOT NULL validados en public.order_events
-- 3. Mantiene atomicidad estricta y control de permisos

CREATE OR REPLACE FUNCTION public.cancel_unpaid_order(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Cancelación solicitada por el cliente antes del pago'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_order RECORD;
    v_has_approved_payment BOOLEAN := FALSE;
    v_has_uncertain_payment BOOLEAN := FALSE;
    v_has_active_preference BOOLEAN := FALSE;
    v_res_count INT := 0;
    v_cleaned_reason TEXT;
    v_trace_id TEXT;
BEGIN
    -- 1. Control de Autenticación estricto
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

    -- 2. Bloquear la orden con FOR UPDATE para serializar y evitar condiciones de carrera
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

    -- 3. Validar permisos: debe ser el comprador (customer_id o user_id) o administrador
    IF NOT v_is_admin 
       AND v_order.customer_id IS DISTINCT FROM v_user_id 
       AND v_order.user_id IS DISTINCT FROM v_user_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'FORBIDDEN',
            'message', 'No tienes permisos para cancelar esta orden.'
        );
    END IF;

    -- 4. Idempotencia: si ya está cancelada
    IF v_order.status IN ('cancelada', 'cancelled') THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'status', v_order.status,
            'message', 'La orden ya se encuentra cancelada.'
        );
    END IF;

    -- 5. Verificar que NO exista ningún pago aprobado (en payments o payment_attempts)
    SELECT EXISTS (
        SELECT 1 FROM public.payments
        WHERE order_id = p_order_id AND status = 'approved'
    ) OR EXISTS (
        SELECT 1 FROM public.payment_attempts
        WHERE order_id = p_order_id AND normalized_status = 'approved'
    ) INTO v_has_approved_payment;

    IF v_has_approved_payment OR COALESCE(v_order.payment_status, '') IN ('approved', 'paid', 'refunded', 'partially_refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PAYMENT_EXISTS',
            'message', 'La orden posee un pago aprobado. Debe tramitarse mediante resolución y reembolso.'
        );
    END IF;

    -- 6. Comprobar pagos inciertos, en proceso o pendientes de conciliación en payment_attempts
    -- Si existe un intento en procesamiento o con webhook pendiente, no se puede cancelar ciegamente
    SELECT EXISTS (
        SELECT 1 FROM public.payment_attempts
        WHERE order_id = p_order_id
          AND (
            normalized_status IN ('processing', 'pending_capture', 'in_process')
            OR external_payment_id IS NOT NULL
          )
    ) INTO v_has_uncertain_payment;

    IF v_has_uncertain_payment THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PAYMENT_IN_PROCESS',
            'message', 'Existe un pago en procesamiento o validación. Espera unos momentos a que se confirme el estado antes de cancelar.'
        );
    END IF;

    -- 7. PROTECCIÓN DE CHECKOUT / PREFERENCIA DE MERCADO PAGO ACTIVA:
    -- Si existe una preferencia externa registrada en payment_attempts (o payment_provider_reference en orders)
    -- que esté en estado iniciado/redirigido y la reserva de stock aún esté vigente (o creada recientemente),
    -- el comprador tiene un checkout abierto o potencial cobro en curso en Mercado Pago.
    -- Bloquear cancelación directa hasta que expire la reserva o se concilie el intento.
    SELECT EXISTS (
        SELECT 1 FROM public.payment_attempts pa
        WHERE pa.order_id = p_order_id
          AND (
            pa.external_preference_id IS NOT NULL
            OR pa.provider_status = 'redirected'
            OR pa.checkout_session_id IS NOT NULL
          )
          AND pa.normalized_status IN ('initiated', 'pending')
          AND pa.cancelled_at IS NULL
    ) OR (
        v_order.payment_provider_reference IS NOT NULL 
        AND v_order.payment_status = 'pending'
    ) INTO v_has_active_preference;

    IF v_has_active_preference THEN
        -- Comprobar si la reserva de stock sigue activa y no expiró
        IF EXISTS (
            SELECT 1 FROM public.stock_reservations
            WHERE order_id = p_order_id 
              AND status = 'active'
              AND reserved_until > now()
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'ACTIVE_CHECKOUT_PREFERENCE',
                'message', 'Esta compra cuenta con un checkout de Mercado Pago iniciado. Para evitar cobros no vinculados, espera unos minutos a que el checkout expire o contacta a soporte si cerraste la pasarela.'
            );
        END IF;
    END IF;

    -- 8. Verificar que la orden no esté ya en preparación, despachada o entregada
    IF v_order.status IN ('processing', 'shipped', 'delivered', 'confirmed', 'paid') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_ORDER_STATE',
            'message', 'La orden no se puede cancelar directamente porque ya se encuentra en preparación o despachada.'
        );
    END IF;

    v_cleaned_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Cancelación solicitada por el cliente antes del pago');
    v_trace_id := 'cancel_' || gen_random_uuid()::text;

    -- 9. Actualizar la orden a cancelada
    UPDATE public.orders
    SET status = 'cancelada',
        payment_status = CASE 
            WHEN payment_status IN ('expired') THEN 'expired'
            ELSE 'cancelled'
        END,
        updated_at = now()
    WHERE id = p_order_id;

    -- 10. Invalidar intentos de pago previos que no tenían cobro externo
    UPDATE public.payment_attempts
    SET normalized_status = 'cancelled',
        provider_status = 'cancelled_by_buyer',
        cancelled_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id
      AND normalized_status IN ('initiated', 'pending');

    -- 11. Actualizar subórdenes asociadas usando sus columnas reales
    UPDATE public.order_suborders
    SET status = 'cancelled',
        liquidation_status = 'cancelled',
        cancellation_requested_at = now(),
        cancellation_reason = v_cleaned_reason,
        updated_at = now()
    WHERE parent_order_id = p_order_id
      AND status NOT IN ('delivered', 'shipped');

    -- 12. Liberar reservas de stock de esta orden
    UPDATE public.stock_reservations
    SET status = 'released',
        updated_at = now()
    WHERE order_id = p_order_id
      AND status = 'active';
    GET DIAGNOSTICS v_res_count = ROW_COUNT;

    -- 13. Actualizar items de preventa si correspondiera
    UPDATE public.preorder_items pi
    SET status = 'cancelled',
        updated_at = now()
    FROM public.order_items oi
    WHERE pi.order_item_id = oi.id
      AND oi.order_id = p_order_id
      AND pi.status IN ('awaiting_payment', 'pending');

    -- 14. Registrar evento de auditoría en public.order_events con trace_id obligatorio
    INSERT INTO public.order_events (
        order_id,
        trace_id,
        source,
        event_type,
        stage,
        status,
        actor,
        details,
        metadata
    ) VALUES (
        p_order_id::text,
        v_trace_id,
        'customer_portal',
        'order_cancelled_unpaid',
        'cancellation',
        'SUCCESS',
        v_user_id::text,
        v_cleaned_reason,
        jsonb_build_object(
            'cancelled_by', v_user_id,
            'is_admin', v_is_admin,
            'released_reservations', v_res_count,
            'reason', v_cleaned_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'cancelada',
        'released_reservations', v_res_count,
        'trace_id', v_trace_id,
        'message', 'Orden cancelada exitosamente y stock liberado.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_unpaid_order(UUID, TEXT) TO authenticated, service_role;
