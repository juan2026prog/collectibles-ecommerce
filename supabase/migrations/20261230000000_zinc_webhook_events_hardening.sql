-- Migration: 20261230000000_zinc_webhook_events_hardening.sql
-- Description: Harden zinc_webhook_events table with processing status, attempts, error tracking, and null processed_at default.

-- 1. Alter processed_at default so events are not marked processed upon receipt
ALTER TABLE public.zinc_webhook_events 
    ALTER COLUMN processed_at DROP DEFAULT;

-- 2. Add processing tracking columns
ALTER TABLE public.zinc_webhook_events
    ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'received',
    ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS processing_error TEXT,
    ADD COLUMN IF NOT EXISTS last_processing_at TIMESTAMPTZ;

-- 3. Add constraint for valid processing statuses if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_zinc_webhook_processing_status' 
        AND conrelid = 'public.zinc_webhook_events'::regclass
    ) THEN
        ALTER TABLE public.zinc_webhook_events 
        ADD CONSTRAINT chk_zinc_webhook_processing_status 
        CHECK (processing_status IN ('received', 'processing', 'processed', 'failed', 'unhandled', 'unmatched', 'unhandled_return'));
    END IF;
END $$;

-- 4. Create performance and query indexes
CREATE INDEX IF NOT EXISTS idx_zinc_webhook_events_status 
    ON public.zinc_webhook_events (processing_status);

CREATE INDEX IF NOT EXISTS idx_zinc_webhook_events_order_id 
    ON public.zinc_webhook_events (zinc_order_id);

CREATE INDEX IF NOT EXISTS idx_zinc_webhook_events_env_status 
    ON public.zinc_webhook_events (environment, processing_status);
