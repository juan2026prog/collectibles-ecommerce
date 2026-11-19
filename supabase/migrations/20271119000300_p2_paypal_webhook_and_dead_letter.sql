-- =============================================================================
-- Migration: 20271119000300_p2_paypal_webhook_and_dead_letter.sql
-- Purpose (P2 — Asynchronous PayPal Webhook):
--   1. Create `public.paypal_webhook_events` for deduplication, observability,
--      retry tracking, and dead-letter quarantine of asynchronous PayPal events.
--   2. Enforce strict RLS (service_role bypasses RLS; admins read-only).
--   3. Seed optional `payments_paypal_webhook_id` key in `site_settings`
--      (secrets should preferably live in Supabase Edge Function Secrets / Vault).
--
-- Rollback Plan (non-destructive):
--   Keep `paypal_webhook_events` table to preserve audit trail; disable
--   `paypal-webhook` Edge Function if needed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  paypal_order_id text,
  capture_id text,
  order_reference text,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed', 'dead_letter')),
  retry_count integer NOT NULL DEFAULT 0,
  dead_letter_reason text,
  raw_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_status_created
  ON public.paypal_webhook_events (processing_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_order_id
  ON public.paypal_webhook_events (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.paypal_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.paypal_webhook_events TO authenticated;
GRANT ALL ON public.paypal_webhook_events TO service_role;

DROP POLICY IF EXISTS paypal_webhook_events_admin_select ON public.paypal_webhook_events;
CREATE POLICY paypal_webhook_events_admin_select ON public.paypal_webhook_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

INSERT INTO public.site_settings (key, value)
VALUES ('payments_paypal_webhook_id', '')
ON CONFLICT (key) DO NOTHING;
