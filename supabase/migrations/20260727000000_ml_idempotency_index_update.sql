-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Idempotency Index Update (Fase 4 Verification)
-- Applied: 2026-05-28
-- ══════════════════════════════════════════════════════════════

-- Drop the old unique index based on sent_at
DROP INDEX IF EXISTS public.idx_ml_incoming_events_resource_sent;

-- Create the new unique index on resource, topic, and seller_id
-- We coalesce seller_id to an empty string to support possible nulls in non-vendor events,
-- although for MeLi webhooks seller_id is always present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_incoming_events_resource_topic_seller
ON public.ml_incoming_events(resource, topic, COALESCE(seller_id, ''));
