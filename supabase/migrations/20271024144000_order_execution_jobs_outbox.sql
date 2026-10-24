-- ==============================================================================
-- COLLECTIBLES 2026 — ORDER EXECUTION JOBS, OUTBOX WORKER & PAYMENT ATOMIC RPC
-- Migration: 20271024144000_order_execution_jobs_outbox.sql
-- ==============================================================================

-- 1. Table: order_execution_jobs
CREATE TABLE IF NOT EXISTS public.order_execution_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE SET NULL,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Unique index to guarantee post-payment task idempotency per job_type & event_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_execution_jobs_unique_event 
ON public.order_execution_jobs (job_type, event_id);

-- Performance and polling index for recoverable worker
CREATE INDEX IF NOT EXISTS idx_order_execution_jobs_polling 
ON public.order_execution_jobs (status, next_retry_at) 
WHERE status IN ('PENDING', 'RETRYING', 'FAILED', 'PROCESSING');

CREATE INDEX IF NOT EXISTS idx_order_execution_jobs_order_id 
ON public.order_execution_jobs (order_id);

-- RLS
ALTER TABLE public.order_execution_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and service role manage order execution jobs" ON public.order_execution_jobs;
CREATE POLICY "Admin and service role manage order execution jobs"
ON public.order_execution_jobs
FOR ALL
TO authenticated, service_role
USING (
    (auth.jwt() ->> 'role' = 'service_role') OR
    EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
);

COMMENT ON TABLE public.order_execution_jobs IS 'Durable outbox for post-payment transactional side effects and recovery';

-- 2. Concurrency-Safe Claim Function for Outbox Recovery Worker
CREATE OR REPLACE FUNCTION public.claim_order_execution_jobs(
    p_worker_id TEXT,
    p_limit INTEGER DEFAULT 10,
    p_lock_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
    id UUID,
    event_id TEXT,
    order_id UUID,
    suborder_id UUID,
    job_type TEXT,
    status TEXT,
    payload JSONB,
    attempts INTEGER,
    max_attempts INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH candidate_jobs AS (
        SELECT j.id
        FROM public.order_execution_jobs j
        WHERE 
            (
                j.status IN ('PENDING', 'RETRYING') 
                AND j.next_retry_at <= clock_timestamp()
                AND j.attempts < j.max_attempts
            )
            OR (
                j.status = 'PROCESSING'
                AND j.locked_at < clock_timestamp() - (p_lock_seconds || ' seconds')::INTERVAL
            )
            OR (
                j.status = 'FAILED'
                AND j.attempts < j.max_attempts
                AND j.next_retry_at <= clock_timestamp()
            )
        ORDER BY j.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.order_execution_jobs target
    SET 
        status = 'PROCESSING',
        locked_by = p_worker_id,
        locked_at = clock_timestamp(),
        attempts = target.attempts + 1,
        updated_at = clock_timestamp()
    FROM candidate_jobs c
    WHERE target.id = c.id
    RETURNING 
        target.id,
        target.event_id,
        target.order_id,
        target.suborder_id,
        target.job_type,
        target.status,
        target.payload,
        target.attempts,
        target.max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.claim_order_execution_jobs(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_execution_jobs(TEXT, INTEGER, INTEGER) TO service_role, postgres;

-- 3. Atomic Multi-table Persistence RPC for Payments & Attempts
CREATE OR REPLACE FUNCTION public.record_payment_transaction_atomic(
    p_order_id UUID,
    p_provider TEXT,
    p_external_payment_id TEXT,
    p_amount NUMERIC,
    p_currency TEXT,
    p_normalized_status TEXT,
    p_provider_status TEXT,
    p_provider_status_detail TEXT,
    p_raw_payload JSONB DEFAULT '{}'::jsonb,
    p_source TEXT DEFAULT 'webhook'
)
RETURNS JSONB AS $$
DECLARE
    v_attempt_id UUID;
    v_payment_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_provider_event_id TEXT;
    v_attempt_number INTEGER;
BEGIN
    -- 1. Lock the order row to serialize concurrent webhook updates
    PERFORM 1 FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 2. Find or create payment attempt
    SELECT id, attempt_number INTO v_attempt_id, v_attempt_number
    FROM public.payment_attempts
    WHERE order_id = p_order_id
    ORDER BY attempt_number DESC
    LIMIT 1
    FOR UPDATE;

    IF v_attempt_id IS NOT NULL THEN
        UPDATE public.payment_attempts
        SET 
            normalized_status = p_normalized_status,
            provider_status = p_provider_status,
            provider_status_detail = p_provider_status_detail,
            external_payment_id = p_external_payment_id,
            approved_at = CASE WHEN p_normalized_status = 'approved' THEN v_now ELSE approved_at END,
            rejected_at = CASE WHEN p_normalized_status = 'rejected' THEN v_now ELSE rejected_at END,
            cancelled_at = CASE WHEN p_normalized_status = 'cancelled' THEN v_now ELSE cancelled_at END,
            error_code = p_provider_status_detail,
            updated_at = v_now
        WHERE id = v_attempt_id;
    ELSE
        INSERT INTO public.payment_attempts (
            order_id,
            provider,
            payment_method_type,
            attempt_number,
            amount,
            currency,
            normalized_status,
            provider_status,
            provider_status_detail,
            external_payment_id,
            initiated_at,
            approved_at
        ) VALUES (
            p_order_id,
            p_provider,
            p_provider,
            1,
            p_amount,
            p_currency,
            p_normalized_status,
            p_provider_status,
            p_provider_status_detail,
            p_external_payment_id,
            v_now,
            CASE WHEN p_normalized_status = 'approved' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_attempt_id;
    END IF;

    -- 3. Upsert into payments table
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE order_id = p_order_id AND provider = p_provider
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_payment_id IS NOT NULL THEN
        UPDATE public.payments
        SET 
            status = p_normalized_status,
            transaction_external_id = p_external_payment_id,
            amount = p_amount,
            currency = p_currency,
            raw_webhook = p_raw_payload,
            updated_at = v_now
        WHERE id = v_payment_id;
    ELSE
        INSERT INTO public.payments (
            order_id,
            provider,
            transaction_external_id,
            amount,
            currency,
            status,
            raw_webhook,
            created_at,
            updated_at
        ) VALUES (
            p_order_id,
            p_provider,
            p_external_payment_id,
            p_amount,
            p_currency,
            p_normalized_status,
            p_raw_payload,
            v_now,
            v_now
        )
        RETURNING id INTO v_payment_id;
    END IF;

    -- 4. Append to payment_events audit trail (idempotent ON CONFLICT)
    v_provider_event_id := p_provider || '-' || p_source || '-' || p_external_payment_id || '-' || EXTRACT(EPOCH FROM v_now)::BIGINT;
    
    INSERT INTO public.payment_events (
        order_id,
        payment_attempt_id,
        provider,
        event_type,
        normalized_status,
        provider_status,
        provider_event_id,
        source,
        payload_sanitized,
        processing_result,
        occurred_at
    ) VALUES (
        p_order_id,
        v_attempt_id,
        p_provider,
        p_source || '_' || p_provider_status,
        p_normalized_status,
        p_provider_status,
        v_provider_event_id,
        p_source,
        jsonb_build_object('payment_id', p_external_payment_id, 'status', p_provider_status, 'detail', p_provider_status_detail),
        'Transacción persistida atómicamente: ' || p_normalized_status,
        v_now
    )
    ON CONFLICT (provider, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING;

    -- 5. Update last_payment_attempt_id on order
    UPDATE public.orders
    SET 
        payment_status = p_normalized_status,
        payment_provider = p_provider,
        last_payment_attempt_id = v_attempt_id,
        updated_at = v_now
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'attempt_id', v_attempt_id,
        'payment_id', v_payment_id,
        'status', p_normalized_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.record_payment_transaction_atomic(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_transaction_atomic(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role, postgres;
