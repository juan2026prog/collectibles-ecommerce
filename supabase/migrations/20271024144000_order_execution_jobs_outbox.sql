-- ==============================================================================
-- COLLECTIBLES 2026 — ORDER EXECUTION JOBS & OUTBOX RECOVERY SCHEMA
-- Migration: 20271024144000_order_execution_jobs_outbox.sql
-- ==============================================================================

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
    processed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Unique index to guarantee post-payment task idempotency per job_type & event_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_execution_jobs_unique_event 
ON public.order_execution_jobs (job_type, event_id);

-- Performance and polling index
CREATE INDEX IF NOT EXISTS idx_order_execution_jobs_polling 
ON public.order_execution_jobs (status, next_retry_at) 
WHERE status IN ('PENDING', 'RETRYING');

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
