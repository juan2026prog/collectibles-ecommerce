-- Migration: 20260806000000_payment_traceability_system.sql
-- Description: Complete Payment Traceability System, Payment Attempts, Immutable Payment Events, Gateways Status Normalization, Reconciliation & Fulfillment Guards

-- 1. Create payment_attempts table
CREATE TABLE IF NOT EXISTS public.payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    payment_method_type TEXT,
    payment_method_detail TEXT,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    amount NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'UYU',
    normalized_status TEXT NOT NULL CHECK (normalized_status IN (
        'no_payment_attempt',
        'initiated',
        'pending',
        'processing',
        'approved',
        'rejected',
        'cancelled',
        'expired',
        'refunded',
        'partially_refunded',
        'charged_back',
        'manual_verification_required',
        'unknown_legacy'
    )),
    provider_status TEXT,
    provider_status_detail TEXT,
    external_payment_id TEXT,
    external_preference_id TEXT,
    external_reference TEXT,
    checkout_session_id TEXT,
    idempotency_key TEXT,
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,
    last_checked_at TIMESTAMPTZ,
    error_code TEXT,
    error_message_sanitized TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_attempts_order_attempt_unique UNIQUE (order_id, attempt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_attempts_provider_ext_id 
ON public.payment_attempts (provider, external_payment_id) 
WHERE external_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_attempts_idempotency 
ON public.payment_attempts (idempotency_key) 
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_id 
ON public.payment_attempts (order_id);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_normalized_status 
ON public.payment_attempts (normalized_status);

-- 2. Create payment_events table (Append-Only)
CREATE TABLE IF NOT EXISTS public.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_attempt_id UUID REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    event_type TEXT NOT NULL,
    normalized_status TEXT NOT NULL,
    provider_status TEXT,
    provider_event_id TEXT,
    source TEXT NOT NULL CHECK (source IN (
        'checkout',
        'redirect',
        'webhook',
        'reconciliation',
        'admin_manual',
        'migration',
        'system'
    )),
    payload_sanitized JSONB DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_result TEXT,
    error_message_sanitized TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON public.payment_events (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_attempt_id ON public.payment_events (payment_attempt_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_provider_event 
ON public.payment_events (provider, provider_event_id) 
WHERE provider_event_id IS NOT NULL;

-- Append-only trigger for payment_events: Prevent UPDATE or DELETE except for service_role
CREATE OR REPLACE FUNCTION public.enforce_payment_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        IF (current_setting('role', true) <> 'service_role' AND auth.role() <> 'service_role') THEN
            RAISE EXCEPTION 'payment_events is an immutable audit table. UPDATE and DELETE are prohibited.';
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_events_append_only ON public.payment_events;
CREATE TRIGGER trg_payment_events_append_only
BEFORE UPDATE OR DELETE ON public.payment_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_events_append_only();

-- 3. Enhance orders table columns for reconciliation & assisted purchase
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'online_checkout',
ADD COLUMN IF NOT EXISTS last_payment_attempt_id UUID REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'pending_reconciliation';

-- 4. Status normalization function
CREATE OR REPLACE FUNCTION public.normalize_payment_status(
    p_provider TEXT,
    p_provider_status TEXT,
    p_status_detail TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_prov TEXT := LOWER(COALESCE(p_provider, ''));
    v_stat TEXT := LOWER(COALESCE(p_provider_status, ''));
    v_det TEXT := LOWER(COALESCE(p_status_detail, ''));
BEGIN
    IF v_prov = 'mercadopago' THEN
        CASE v_stat
            WHEN 'approved' THEN RETURN 'approved';
            WHEN 'authorized' THEN RETURN 'approved';
            WHEN 'pending' THEN RETURN 'pending';
            WHEN 'in_process' THEN RETURN 'processing';
            WHEN 'in_mediation' THEN RETURN 'manual_verification_required';
            WHEN 'rejected' THEN RETURN 'rejected';
            WHEN 'cancelled' THEN RETURN 'cancelled';
            WHEN 'refunded' THEN RETURN 'refunded';
            WHEN 'charged_back' THEN RETURN 'charged_back';
            ELSE RETURN 'pending';
        END CASE;
    ELSIF v_prov = 'handy' THEN
        CASE v_stat
            WHEN 'approved' THEN RETURN 'approved';
            WHEN 'paid' THEN RETURN 'approved';
            WHEN 'success' THEN RETURN 'approved';
            WHEN 'redirected' THEN RETURN 'initiated';
            WHEN 'pending' THEN RETURN 'pending';
            WHEN 'processing' THEN RETURN 'processing';
            WHEN 'failed' THEN RETURN 'rejected';
            WHEN 'rejected' THEN RETURN 'rejected';
            WHEN 'cancelled' THEN RETURN 'cancelled';
            WHEN 'expired' THEN RETURN 'expired';
            WHEN 'refunded' THEN RETURN 'refunded';
            ELSE RETURN 'pending';
        END CASE;
    ELSIF v_prov IN ('dlocal', 'dlocalgo') THEN
        CASE v_stat
            WHEN 'paid' THEN RETURN 'approved';
            WHEN 'approved' THEN RETURN 'approved';
            WHEN 'pending' THEN RETURN 'pending';
            WHEN 'rejected' THEN RETURN 'rejected';
            WHEN 'cancelled' THEN RETURN 'cancelled';
            WHEN 'expired' THEN RETURN 'expired';
            WHEN 'refunded' THEN RETURN 'refunded';
            ELSE RETURN 'pending';
        END CASE;
    ELSIF v_prov = 'paypal' THEN
        CASE v_stat
            WHEN 'completed' THEN RETURN 'approved';
            WHEN 'approved' THEN RETURN 'approved';
            WHEN 'created' THEN RETURN 'initiated';
            WHEN 'pending' THEN RETURN 'pending';
            WHEN 'denied' THEN RETURN 'rejected';
            WHEN 'voided' THEN RETURN 'cancelled';
            WHEN 'refunded' THEN RETURN 'refunded';
            ELSE RETURN 'pending';
        END CASE;
    ELSIF v_prov IN ('transfer', 'manual', 'cash') THEN
        CASE v_stat
            WHEN 'approved' THEN RETURN 'approved';
            WHEN 'paid' THEN RETURN 'approved';
            WHEN 'pending' THEN RETURN 'pending';
            WHEN 'rejected' THEN RETURN 'rejected';
            WHEN 'cancelled' THEN RETURN 'cancelled';
            ELSE RETURN 'pending';
        END CASE;
    END IF;

    -- Generic fallback
    CASE v_stat
        WHEN 'approved' THEN RETURN 'approved';
        WHEN 'paid' THEN RETURN 'approved';
        WHEN 'pending' THEN RETURN 'pending';
        WHEN 'rejected' THEN RETURN 'rejected';
        WHEN 'cancelled' THEN RETURN 'cancelled';
        WHEN 'expired' THEN RETURN 'expired';
        WHEN 'refunded' THEN RETURN 'refunded';
        ELSE RETURN 'unknown_legacy';
    END CASE;
END;
$$;

-- 5. RPC to register manual payments (Assisted Purchase / Wire Transfer)
CREATE OR REPLACE FUNCTION public.register_manual_payment(
    p_order_id UUID,
    p_method TEXT,
    p_amount NUMERIC,
    p_currency TEXT,
    p_reference TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_admin_id UUID;
    v_attempt_id UUID;
    v_next_attempt INTEGER;
BEGIN
    v_admin_id := auth.uid();
    
    -- Verify admin role
    IF NOT (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_admin_id AND is_admin = true
        ) OR current_setting('role', true) = 'service_role'
    ) THEN
        RAISE EXCEPTION 'Acceso denegado. Se requieren permisos de administrador para registrar pagos manuales.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La orden % no existe.', p_order_id;
    END IF;

    IF v_order.payment_status = 'approved' THEN
        RAISE EXCEPTION 'La orden ya tiene un pago aprobado.';
    END IF;

    SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next_attempt 
    FROM public.payment_attempts WHERE order_id = p_order_id;

    INSERT INTO public.payment_attempts (
        order_id,
        user_id,
        provider,
        payment_method_type,
        attempt_number,
        amount,
        currency,
        normalized_status,
        provider_status,
        external_reference,
        approved_at,
        metadata
    ) VALUES (
        p_order_id,
        v_admin_id,
        COALESCE(p_method, 'manual'),
        'manual_transfer',
        v_next_attempt,
        COALESCE(p_amount, v_order.total_amount),
        COALESCE(p_currency, v_order.currency, 'UYU'),
        'approved',
        'approved',
        p_reference,
        NOW(),
        jsonb_build_object('registered_by', v_admin_id, 'notes', p_notes, 'reference', p_reference)
    ) RETURNING id INTO v_attempt_id;

    INSERT INTO public.payment_events (
        order_id,
        payment_attempt_id,
        provider,
        event_type,
        normalized_status,
        provider_status,
        source,
        payload_sanitized,
        processing_result
    ) VALUES (
        p_order_id,
        v_attempt_id,
        COALESCE(p_method, 'manual'),
        'manual_payment_registered',
        'approved',
        'approved',
        'admin_manual',
        jsonb_build_object('admin_id', v_admin_id, 'reference', p_reference, 'notes', p_notes, 'amount', p_amount),
        'Pago manual registrado y aprobado por el administrador'
    );

    UPDATE public.orders SET
        payment_status = 'approved',
        status = 'paid',
        payment_processed_at = NOW(),
        payment_method = COALESCE(p_method, 'manual'),
        payment_provider = COALESCE(p_method, 'manual'),
        payment_provider_reference = p_reference,
        last_payment_attempt_id = v_attempt_id,
        reconciliation_status = 'reconciled',
        last_reconciled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Update suborders
    UPDATE public.order_suborders SET
        status = 'confirmed',
        updated_at = NOW()
    WHERE parent_order_id = p_order_id AND status = 'pending';

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'attempt_id', v_attempt_id,
        'status', 'approved'
    );
END;
$$;

-- 6. Fulfillment Security Guard Functions and Triggers
CREATE OR REPLACE FUNCTION public.check_fulfillment_allowed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment_status TEXT;
    v_parent_order_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'order_suborders' THEN
        v_parent_order_id := NEW.parent_order_id;
        
        -- Check if shipping_status or status is being moved to fulfillment phase
        IF NEW.shipping_status IN ('preparing', 'ready_to_ship', 'dispatched', 'in_transit', 'delivered') 
           OR NEW.status IN ('in_preparation', 'ready', 'shipped', 'delivered') THEN
            
            SELECT payment_status INTO v_payment_status 
            FROM public.orders 
            WHERE id = v_parent_order_id;

            IF COALESCE(v_payment_status, '') <> 'approved' THEN
                RAISE EXCEPTION 'OPERACIÓN BLOQUEADA: No se puede preparar ni despachar la suborden % porque el pago de la orden no está confirmado/aprobado (Estado de pago: %).', NEW.suborder_number, COALESCE(v_payment_status, 'sin pago');
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'shipments' THEN
        v_parent_order_id := NEW.order_id;
        
        SELECT payment_status INTO v_payment_status 
        FROM public.orders 
        WHERE id = v_parent_order_id;

        IF COALESCE(v_payment_status, '') <> 'approved' THEN
            RAISE EXCEPTION 'OPERACIÓN BLOQUEADA: No se pueden generar etiquetas ni envíos para la orden % porque el pago no está confirmado/aprobado (Estado de pago: %).', NEW.order_id, COALESCE(v_payment_status, 'sin pago');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_suborders_fulfillment ON public.order_suborders;
CREATE TRIGGER trg_guard_suborders_fulfillment
BEFORE INSERT OR UPDATE ON public.order_suborders
FOR EACH ROW EXECUTE FUNCTION public.check_fulfillment_allowed();

DROP TRIGGER IF EXISTS trg_guard_shipments_fulfillment ON public.shipments;
CREATE TRIGGER trg_guard_shipments_fulfillment
BEFORE INSERT OR UPDATE ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.check_fulfillment_allowed();

-- 7. RLS Policies for payment_attempts & payment_events
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access payment_attempts" ON public.payment_attempts;
CREATE POLICY "Admins full access payment_attempts" ON public.payment_attempts
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR current_setting('role', true) = 'service_role'
);

DROP POLICY IF EXISTS "Admins full access payment_events" ON public.payment_events;
CREATE POLICY "Admins full access payment_events" ON public.payment_events
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR current_setting('role', true) = 'service_role'
);

-- Vendor select access restricted to their suborders
DROP POLICY IF EXISTS "Vendors view payment_attempts for their suborders" ON public.payment_attempts;
CREATE POLICY "Vendors view payment_attempts for their suborders" ON public.payment_attempts
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.order_suborders os
        WHERE os.parent_order_id = payment_attempts.order_id
        AND os.vendor_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Vendors view payment_events for their suborders" ON public.payment_events;
CREATE POLICY "Vendors view payment_events for their suborders" ON public.payment_events
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.order_suborders os
        WHERE os.parent_order_id = payment_events.order_id
        AND os.vendor_id = auth.uid()
    )
);

-- Buyers view payment_attempts & events for their own orders
CREATE POLICY "Buyers view payment_attempts for own orders" ON public.payment_attempts
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = payment_attempts.order_id
        AND o.customer_id = auth.uid()
    )
);

CREATE POLICY "Buyers view payment_events for own orders" ON public.payment_events
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = payment_events.order_id
        AND o.customer_id = auth.uid()
    )
);

-- 8. Backfill Script for Existing Historical Orders
DO $$
DECLARE
    r_order RECORD;
    r_payment RECORD;
    v_norm_status TEXT;
    v_attempt_id UUID;
BEGIN
    FOR r_order IN SELECT * FROM public.orders LOOP
        -- Normalize status from order.payment_status or status
        IF r_order.payment_status = 'approved' OR r_order.status = 'paid' THEN
            v_norm_status := 'approved';
        ELSIF r_order.payment_status = 'expired' OR r_order.status = 'expired' THEN
            v_norm_status := 'expired';
        ELSIF r_order.payment_status = 'refunded' OR r_order.status = 'refunded' OR r_order.status = 'cancelada' THEN
            v_norm_status := 'cancelled';
        ELSIF r_order.payment_status = 'not_started' OR r_order.status = 'awaiting_payment' THEN
            v_norm_status := 'no_payment_attempt';
        ELSE
            v_norm_status := public.normalize_payment_status(r_order.payment_provider, r_order.payment_status);
        END IF;

        -- Check if there is an existing record in payments table
        SELECT * INTO r_payment FROM public.payments WHERE order_id = r_order.id LIMIT 1;

        IF r_payment.id IS NOT NULL THEN
            -- Create payment_attempt based on existing payment record
            INSERT INTO public.payment_attempts (
                order_id,
                user_id,
                provider,
                payment_method_type,
                attempt_number,
                amount,
                currency,
                normalized_status,
                provider_status,
                external_payment_id,
                checkout_session_id,
                initiated_at,
                approved_at,
                expired_at,
                metadata,
                created_at
            ) VALUES (
                r_order.id,
                r_order.customer_id,
                COALESCE(r_payment.provider, r_order.payment_provider, r_order.payment_method, 'unknown'),
                r_order.payment_method,
                1,
                COALESCE(r_payment.amount, r_order.total_amount),
                COALESCE(r_payment.currency, r_order.currency, 'UYU'),
                CASE 
                    WHEN r_payment.status = 'redirected' AND v_norm_status = 'expired' THEN 'expired'
                    WHEN r_payment.status = 'failed' THEN 'rejected'
                    ELSE v_norm_status
                END,
                r_payment.status,
                r_payment.transaction_external_id,
                r_payment.transaction_external_id,
                r_payment.created_at,
                CASE WHEN v_norm_status = 'approved' THEN COALESCE(r_order.payment_processed_at, r_payment.created_at) ELSE NULL END,
                CASE WHEN v_norm_status = 'expired' THEN r_payment.created_at + INTERVAL '30 minutes' ELSE NULL END,
                jsonb_build_object('backfilled', true, 'legacy_payment_id', r_payment.id, 'raw_request', r_payment.raw_request),
                r_payment.created_at
            )
            ON CONFLICT (order_id, attempt_number) DO NOTHING
            RETURNING id INTO v_attempt_id;

            IF v_attempt_id IS NOT NULL THEN
                INSERT INTO public.payment_events (
                    order_id,
                    payment_attempt_id,
                    provider,
                    event_type,
                    normalized_status,
                    provider_status,
                    source,
                    payload_sanitized,
                    processing_result,
                    occurred_at,
                    created_at
                ) VALUES (
                    r_order.id,
                    v_attempt_id,
                    COALESCE(r_payment.provider, 'unknown'),
                    'historical_backfill',
                    v_norm_status,
                    r_payment.status,
                    'migration',
                    jsonb_build_object('order_number', r_order.order_number, 'payment_url', r_payment.payment_url),
                    'Backfill histórico de pagos completado',
                    r_payment.created_at,
                    r_payment.created_at
                ) ON CONFLICT DO NOTHING;
            END IF;
        ELSE
            -- No payment row in payments table. Create attempt if order had a provider or payment status
            IF r_order.payment_provider IS NOT NULL OR r_order.payment_method IS NOT NULL OR r_order.payment_id IS NOT NULL THEN
                INSERT INTO public.payment_attempts (
                    order_id,
                    user_id,
                    provider,
                    payment_method_type,
                    attempt_number,
                    amount,
                    currency,
                    normalized_status,
                    provider_status,
                    external_payment_id,
                    initiated_at,
                    approved_at,
                    metadata,
                    created_at
                ) VALUES (
                    r_order.id,
                    r_order.customer_id,
                    COALESCE(r_order.payment_provider, r_order.payment_method, 'unknown'),
                    r_order.payment_method,
                    1,
                    r_order.total_amount,
                    COALESCE(r_order.currency, 'UYU'),
                    v_norm_status,
                    r_order.payment_status,
                    r_order.payment_id,
                    r_order.created_at,
                    CASE WHEN v_norm_status = 'approved' THEN COALESCE(r_order.payment_processed_at, r_order.created_at) ELSE NULL END,
                    jsonb_build_object('backfilled', true, 'order_payment_id', r_order.payment_id),
                    r_order.created_at
                )
                ON CONFLICT (order_id, attempt_number) DO NOTHING
                RETURNING id INTO v_attempt_id;

                IF v_attempt_id IS NOT NULL THEN
                    INSERT INTO public.payment_events (
                        order_id,
                        payment_attempt_id,
                        provider,
                        event_type,
                        normalized_status,
                        provider_status,
                        source,
                        payload_sanitized,
                        processing_result,
                        occurred_at,
                        created_at
                    ) VALUES (
                        r_order.id,
                        v_attempt_id,
                        COALESCE(r_order.payment_provider, r_order.payment_method, 'unknown'),
                        'historical_backfill',
                        v_norm_status,
                        r_order.payment_status,
                        'migration',
                        jsonb_build_object('order_number', r_order.order_number, 'payment_id', r_order.payment_id),
                        'Backfill histórico creado desde cabecera de orden',
                        r_order.created_at,
                        r_order.created_at
                    ) ON CONFLICT DO NOTHING;
                END IF;
            END IF;
        END IF;

        -- Update order payment_status to normalized value
        UPDATE public.orders SET
            payment_status = v_norm_status,
            reconciliation_status = CASE 
                WHEN v_norm_status = 'approved' THEN 'reconciled'
                WHEN v_norm_status = 'no_payment_attempt' THEN 'no_external_record'
                ELSE 'pending_reconciliation'
            END,
            last_payment_attempt_id = COALESCE(v_attempt_id, r_order.last_payment_attempt_id)
        WHERE id = r_order.id;

    END LOOP;
END;
$$;
