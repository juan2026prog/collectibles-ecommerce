-- ==============================================================================
-- COLLECTIBLES 2026 — FASE B PRODUCTION HARDENING MIGRATION
-- Migration: 20261231020000_fase_b_production_hardening.sql
-- Description:
-- 1. Creates `order_execution_jobs` for post-payment durable outbox task processing
--    (shipping creation, transactional email, whatsapp, ML sync, commissions, zinc).
-- 2. Ensures `sourcing_autopilot_queue` exists with durable backend state machine.
-- ==============================================================================

-- 1. Table: order_execution_jobs
CREATE TABLE IF NOT EXISTS public.order_execution_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE SET NULL,
    job_type TEXT NOT NULL, -- 'shipping_creation', 'email_notification', 'whatsapp_notification', 'ml_stock_sync', 'commissions_calc', 'zinc_fulfillment', 'analytics_event'
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    processed_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Unique constraint for strict post-payment idempotency per job_type & event_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_execution_jobs_unique_event 
ON public.order_execution_jobs (job_type, event_id);

-- Performance & queue polling index
CREATE INDEX IF NOT EXISTS idx_order_execution_jobs_polling 
ON public.order_execution_jobs (status, next_retry_at) 
WHERE status IN ('PENDING', 'RETRYING');

CREATE INDEX IF NOT EXISTS idx_order_execution_jobs_order_id 
ON public.order_execution_jobs (order_id);

-- Enable RLS on order_execution_jobs
ALTER TABLE public.order_execution_jobs ENABLE ROW LEVEL SECURITY;

-- Only service_role and admins can view/manage execution jobs
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

-- 2. Table: sourcing_autopilot_queue (Ensure table and schema consistency)
CREATE TABLE IF NOT EXISTS public.sourcing_autopilot_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    action_type TEXT NOT NULL,
    canonical_sku TEXT,
    product_id TEXT,
    publication_id TEXT,
    status TEXT NOT NULL DEFAULT 'CREATED', -- 'CREATED', 'ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_autopilot_queue_status 
ON public.sourcing_autopilot_queue (status, created_at DESC);

ALTER TABLE public.sourcing_autopilot_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and service role manage sourcing autopilot queue" ON public.sourcing_autopilot_queue;
CREATE POLICY "Admin and service role manage sourcing autopilot queue"
ON public.sourcing_autopilot_queue
FOR ALL
TO authenticated, service_role
USING (
    (auth.jwt() ->> 'role' = 'service_role') OR
    EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
);

COMMENT ON TABLE public.order_execution_jobs IS 'Durable outbox for post-payment transactional side effects';
COMMENT ON TABLE public.sourcing_autopilot_queue IS 'Durable queue for sourcing autopilot actions';
