-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Webhooks, Idempotency & Dead Letter Queue Schema
-- Applied: 2026-07-26
-- ══════════════════════════════════════════════════════════════

-- 1. Create ml_incoming_events table (Registro de Webhooks Entrantes)
CREATE TABLE IF NOT EXISTS public.ml_incoming_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource TEXT NOT NULL,
    topic TEXT NOT NULL,
    seller_id TEXT,
    application_id BIGINT,
    attempts INTEGER DEFAULT 0,
    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    raw_payload JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Unique index to enforce idempotency on (resource, sent_at)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_incoming_events_resource_sent
ON public.ml_incoming_events(resource, sent_at);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ml_incoming_events_status ON public.ml_incoming_events(status);
CREATE INDEX IF NOT EXISTS idx_ml_incoming_events_seller ON public.ml_incoming_events(seller_id);

-- 2. Create ml_dead_letter_queue table (DLQ para errores persistentes)
CREATE TABLE IF NOT EXISTS public.ml_dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.ml_incoming_events(id) ON DELETE CASCADE,
    resource TEXT NOT NULL,
    topic TEXT NOT NULL,
    seller_id TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Index
CREATE INDEX IF NOT EXISTS idx_ml_dlq_event_id ON public.ml_dead_letter_queue(event_id);

-- 3. Modify public.orders table to include Mercado Libre Order Reference
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ml_order_id TEXT UNIQUE;

-- 4. Enable Row Level Security (RLS) on new tables
ALTER TABLE public.ml_incoming_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- 5. Define Security Policies for ml_incoming_events
DROP POLICY IF EXISTS "Admins manage all incoming events" ON public.ml_incoming_events;
CREATE POLICY "Admins manage all incoming events" ON public.ml_incoming_events
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors view own incoming events" ON public.ml_incoming_events;
CREATE POLICY "Vendors view own incoming events" ON public.ml_incoming_events
    FOR SELECT USING (
        seller_id IN (
            SELECT seller_id FROM public.ml_seller_accounts
            WHERE vendor_id = auth.uid()
        )
    );

-- 6. Define Security Policies for ml_dead_letter_queue
DROP POLICY IF EXISTS "Admins manage all dead letter events" ON public.ml_dead_letter_queue;
CREATE POLICY "Admins manage all dead letter events" ON public.ml_dead_letter_queue
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors view own dead letter events" ON public.ml_dead_letter_queue;
CREATE POLICY "Vendors view own dead letter events" ON public.ml_dead_letter_queue
    FOR SELECT USING (
        seller_id IN (
            SELECT seller_id FROM public.ml_seller_accounts
            WHERE vendor_id = auth.uid()
        )
    );
