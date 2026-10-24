-- ==============================================================================
-- COLLECTIBLES 2026 — ORDER EXECUTION JOBS, OUTBOX WORKER & PAYMENT ATOMIC RPC
-- Migration: 20271024144000_order_execution_jobs_outbox.sql
-- Description:
-- 1. Table order_execution_jobs with locking, attempts, and payload.
-- 2. Concurrency-safe claim function claim_order_execution_jobs with FOR UPDATE SKIP LOCKED.
-- 3. Multi-table atomic persistence RPC record_payment_transaction_atomic linked by payment ID.
-- 4. Inactive cron registration definition for pg_cron outbox sweep.
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
                AND (j.locked_at IS NULL OR j.locked_at < clock_timestamp() - (p_lock_seconds || ' seconds')::INTERVAL)
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
    p_source TEXT DEFAULT 'webhook',
    p_provider_event_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_attempt_id UUID;
    v_payment_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_event_id TEXT;
    v_attempt_number INTEGER;
    v_next_attempt_num INTEGER;
    v_preference_id TEXT;
    v_is_financial_mismatch BOOLEAN := FALSE;
    v_attempt_normalized_status TEXT;
    v_payment_status TEXT;
BEGIN
    -- 1. Lock the order row to serialize concurrent updates
    PERFORM 1 FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Check if normalized status represents a financial discrepancy
    IF p_normalized_status IN ('fraud_suspected', 'manual_verification_required', 'amount_mismatch') THEN
        v_is_financial_mismatch := TRUE;
        -- Map to compliant status that satisfies payment_attempts CHECK constraint
        v_attempt_normalized_status := 'manual_verification_required';
        -- Map to compliant status that satisfies payments CHECK constraint
        v_payment_status := 'failed';
    ELSE
        v_attempt_normalized_status := p_normalized_status;
        -- Map payment_attempts status to payments status if differing
        IF p_normalized_status = 'initiated' THEN
            v_payment_status := 'pending';
        ELSIF p_normalized_status = 'processing' THEN
            v_payment_status := 'pending';
        ELSIF p_normalized_status = 'expired' THEN
            v_payment_status := 'cancelled';
        ELSE
            v_payment_status := p_normalized_status;
        END IF;
    END IF;

    -- Extract preference id if present in payload or explicit argument
    v_preference_id := COALESCE(
        p_raw_payload ->> 'preference_id',
        p_raw_payload -> 'metadata' ->> 'preference_id',
        NULLIF(p_raw_payload ->> 'order_id', p_order_id::text),
        NULL
    );

    -- 2. Find attempt STRICTLY by verifiable identifiers to prevent cross-attempt collisions:
    -- A: By external_payment_id matching this transaction
    IF p_external_payment_id IS NOT NULL AND p_external_payment_id <> '' THEN
        SELECT id, attempt_number INTO v_attempt_id, v_attempt_number
        FROM public.payment_attempts
        WHERE order_id = p_order_id 
          AND external_payment_id = p_external_payment_id
        ORDER BY attempt_number DESC
        LIMIT 1
        FOR UPDATE;
    END IF;

    -- B: By external_preference_id matching preference generated for this checkout
    IF v_attempt_id IS NULL AND v_preference_id IS NOT NULL AND v_preference_id <> '' THEN
        SELECT id, attempt_number INTO v_attempt_id, v_attempt_number
        FROM public.payment_attempts
        WHERE order_id = p_order_id 
          AND external_preference_id = v_preference_id
        ORDER BY attempt_number DESC
        LIMIT 1
        FOR UPDATE;
    END IF;

    -- C: By checkout_session_id if provided in payload
    IF v_attempt_id IS NULL AND (p_raw_payload ->> 'checkout_session_id') IS NOT NULL THEN
        SELECT id, attempt_number INTO v_attempt_id, v_attempt_number
        FROM public.payment_attempts
        WHERE order_id = p_order_id 
          AND checkout_session_id = (p_raw_payload ->> 'checkout_session_id')
        ORDER BY attempt_number DESC
        LIMIT 1
        FOR UPDATE;
    END IF;

    -- NOTE: We explicitly DO NOT fall back to 'ORDER BY attempt_number DESC LIMIT 1'
    -- without matching identifiers, because doing so could attribute a payment to an unrelated attempt.
    -- Instead, if no matching attempt is found, we create a new distinct attempt with a next sequential attempt_number.

    IF v_attempt_id IS NOT NULL THEN
        UPDATE public.payment_attempts
        SET 
            normalized_status = v_attempt_normalized_status,
            provider_status = p_provider_status,
            provider_status_detail = p_provider_status_detail,
            external_payment_id = COALESCE(p_external_payment_id, external_payment_id),
            approved_at = CASE WHEN v_attempt_normalized_status = 'approved' THEN v_now ELSE approved_at END,
            rejected_at = CASE WHEN v_attempt_normalized_status = 'rejected' THEN v_now ELSE rejected_at END,
            cancelled_at = CASE WHEN v_attempt_normalized_status = 'cancelled' THEN v_now ELSE cancelled_at END,
            error_code = CASE WHEN v_is_financial_mismatch THEN 'amount_or_currency_mismatch' ELSE p_provider_status_detail END,
            error_message_sanitized = CASE 
                WHEN v_is_financial_mismatch THEN 'Discrepancia financiera detectada: monto o moneda incompatible con la orden'
                ELSE error_message_sanitized 
            END,
            metadata = CASE 
                WHEN v_is_financial_mismatch THEN 
                    COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('financial_discrepancy', true, 'flagged_at', v_now)
                ELSE metadata 
            END,
            updated_at = v_now
        WHERE id = v_attempt_id;
    ELSE
        -- Calculate next attempt_number safely
        SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next_attempt_num
        FROM public.payment_attempts
        WHERE order_id = p_order_id;

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
            external_preference_id,
            error_code,
            error_message_sanitized,
            metadata,
            initiated_at,
            approved_at
        ) VALUES (
            p_order_id,
            p_provider,
            p_provider,
            v_next_attempt_num,
            p_amount,
            p_currency,
            v_attempt_normalized_status,
            p_provider_status,
            p_provider_status_detail,
            p_external_payment_id,
            v_preference_id,
            CASE WHEN v_is_financial_mismatch THEN 'amount_or_currency_mismatch' ELSE p_provider_status_detail END,
            CASE WHEN v_is_financial_mismatch THEN 'Discrepancia financiera detectada: monto o moneda incompatible con la orden' ELSE NULL END,
            CASE WHEN v_is_financial_mismatch THEN jsonb_build_object('financial_discrepancy', true, 'flagged_at', v_now) ELSE '{}'::jsonb END,
            v_now,
            CASE WHEN v_attempt_normalized_status = 'approved' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_attempt_id;
    END IF;

    -- 3. Upsert into payments table by order_id + transaction_external_id
    IF p_external_payment_id IS NOT NULL AND p_external_payment_id <> '' THEN
        SELECT id INTO v_payment_id
        FROM public.payments
        WHERE order_id = p_order_id 
          AND provider = p_provider 
          AND transaction_external_id = p_external_payment_id
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF v_payment_id IS NOT NULL THEN
        UPDATE public.payments
        SET 
            status = v_payment_status,
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
            v_payment_status,
            p_raw_payload,
            v_now,
            v_now
        )
        RETURNING id INTO v_payment_id;
    END IF;

    -- 4. Append to payment_events audit trail with stable idempotency key
    v_event_id := COALESCE(
        p_provider_event_id,
        p_provider || '-' || p_source || '-' || COALESCE(p_external_payment_id, v_attempt_id::text) || '-' || p_provider_status
    );

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
        v_attempt_normalized_status,
        p_provider_status,
        v_event_id,
        p_source,
        jsonb_build_object(
            'payment_id', p_external_payment_id, 
            'status', p_provider_status, 
            'detail', p_provider_status_detail,
            'financial_mismatch', v_is_financial_mismatch
        ),
        CASE 
            WHEN v_is_financial_mismatch THEN 'Discrepancia detectada y registrada en auditoría sin acreditar orden'
            ELSE 'Transacción persistida atómicamente: ' || v_attempt_normalized_status
        END,
        v_now
    )
    ON CONFLICT (provider, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING;

    -- 5. Update last_payment_attempt_id and payment_status on order (only if not financial mismatch)
    IF NOT v_is_financial_mismatch THEN
        UPDATE public.orders
        SET 
            payment_status = v_attempt_normalized_status,
            payment_provider = p_provider,
            last_payment_attempt_id = v_attempt_id,
            updated_at = v_now
        WHERE id = p_order_id;
    ELSE
        -- For financial mismatch, DO NOT change payment_status to approved;
        -- maintain existing status or record manual_verification_required, link attempt only
        UPDATE public.orders
        SET 
            last_payment_attempt_id = v_attempt_id,
            payment_provider = p_provider,
            updated_at = v_now
        WHERE id = p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'attempt_id', v_attempt_id,
        'payment_id', v_payment_id,
        'status', v_attempt_normalized_status,
        'financial_mismatch', v_is_financial_mismatch
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.record_payment_transaction_atomic(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_transaction_atomic(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO service_role, postgres;

-- 4. Outbox Worker Scheduled Cron Definition (INACTIVE by default until authorization)
CREATE OR REPLACE FUNCTION public.invoke_order_execution_worker_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_supabase_url text;
    v_service_key text;
BEGIN
    SELECT value INTO v_supabase_url FROM public.site_settings WHERE key = 'supabase_url';
    IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
        v_supabase_url := 'https://cobtsgkwcftvexaarwmo.supabase.co';
    END IF;

    -- Read service key from vault if available
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/order-execution-worker',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(v_service_key, current_setting('request.jwt.claim.sub', true))
        ),
        body := '{"source": "pg_cron"}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to invoke order-execution-worker: %', SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invoke_order_execution_worker_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_order_execution_worker_cron() TO service_role;
