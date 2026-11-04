-- Migration: 20271104000500_close_security_cancel_unpaid_order_mp_active_pref.sql
-- Cierre definitivo de seguridad en cancelaciones de pedidos:
-- 1. Si existe preferencia de Mercado Pago (external_preference_id, provider_status = 'redirected', checkout_session_id)
--    o payment_provider_reference con pago incierto/no conciliado, la cancelación directa se BLOQUEA de forma absoluta,
--    INCLUSO SI ya venció stock_reservations.reserved_until. No se cancela hasta conciliar o confirmar rechazo/expiración definitiva.
-- 2. Distingue estrictamente:
--    a) Sin checkout externo iniciado: permite cancelación inmediata.
--    b) Checkout externo iniciado y estado incierto: bloquea con CHECKOUT_PREFERENCE_REQUIRES_RECONCILIATION.
--    c) Con pago aprobado o pagado: bloquea con PAYMENT_EXISTS (debe usar resolución y reembolso).
--    d) Con intentos fallidos / cancelados / expirados confirmados: permite cancelar de forma segura.
-- 3. No actualiza payment_attempts a cancelled_by_buyer si poseen identificador externo (se preserva para conciliación).
-- 4. Conserva auditoría obligatoria en public.order_events con trace_id, idempotencia y permisos restringidos.

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
    v_has_unreconciled_external_checkout BOOLEAN := FALSE;
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
            'message', 'La orden posee un pago aprobado. Debe tramitarse mediante solicitud de resolución y reembolso.'
        );
    END IF;

    -- 6. Comprobar pagos inciertos, en procesamiento o pendientes de captura en payment_attempts
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
            'message', 'Existe un pago en procesamiento o validación externa. Espera unos momentos a que se confirme el estado antes de cancelar.'
        );
    END IF;

    -- 7. BLOQUEO ESTRICTO DE PREFERENCIA / CHECKOUT EXTERNO NO CONCILIADO:
    -- Si existe una preferencia externa o checkout iniciado en Mercado Pago
    -- (external_preference_id, checkout_session_id o provider_status = 'redirected')
    -- que esté en estado iniciado o pendiente, NO SE PUEDE CANCELAR DIRECTAMENTE,
    -- INDEPENDIENTEMENTE de si la reserva de stock ya venció o no.
    -- La cancelación automática o desvinculada queda bloqueada hasta conciliar el cobro con la pasarela.
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
        AND v_order.payment_status IN ('pending', 'awaiting_payment')
    ) INTO v_has_unreconciled_external_checkout;

    IF v_has_unreconciled_external_checkout THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CHECKOUT_PREFERENCE_REQUIRES_RECONCILIATION',
            'message', 'Existe un checkout de Mercado Pago iniciado para esta compra. Por seguridad, no se puede cancelar directamente sin antes conciliar la pasarela para confirmar que no haya sido abonada.'
        );
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

    -- 10. Actualizar solo intentos de pago técnicos locales que NO posean identificadores externos
    UPDATE public.payment_attempts
    SET normalized_status = 'cancelled',
        provider_status = 'cancelled_by_buyer',
        cancelled_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id
      AND normalized_status IN ('initiated', 'pending')
      AND external_preference_id IS NULL
      AND external_payment_id IS NULL
      AND checkout_session_id IS NULL;

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
