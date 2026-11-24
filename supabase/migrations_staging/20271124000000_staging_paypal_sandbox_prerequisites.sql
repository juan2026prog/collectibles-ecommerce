-- =============================================================================
-- STAGING-ONLY MIGRATION (DO NOT APPLY TO PRODUCTION cobtsgkwcftvexaarwmo)
-- File: supabase/migrations_staging/20271124000000_staging_paypal_sandbox_prerequisites.sql
-- Target: Supabase Staging (csnudufkpfzveoonjumy)
--
-- Purpose (Gate 2 — PayPal Sandbox E2E Prerequisites):
--   Minimal, idempotent, non-destructive setup of missing objects required by
--   create-payment, confirm-payment, and paypal-webhook in Staging without
--   replaying legacy historical migrations:
--     1. Ensure orders has fx_rate_used, fx_source, destination_country,
--        payment_provider, last_payment_attempt_id.
--     2. Create currency_exchange_rates & currency_exchange_rate_history (RLS)
--        and seed an initial VERIFIED USD->UYU rate for Sandbox testing.
--     3. Create payment_events table (required by record_payment_transaction_atomic).
--     4. Create record_payment_transaction_atomic RPC with strict service_role grants.
--     5. Create paypal_webhook_events table with strict RLS.
--     6. Seed non-secret PayPal Sandbox flags in site_settings (sandbox='true').
-- =============================================================================

-- 1. Orders columns (additive, idempotent)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fx_rate_used numeric(14, 6);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fx_source text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS destination_country text DEFAULT 'UY';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_provider text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_payment_attempt_id uuid;

-- 2. Authoritative FX tables (currency_exchange_rates + history)
CREATE TABLE IF NOT EXISTS public.currency_exchange_rates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code text NOT NULL,
  country_name text NOT NULL,
  base_currency text NOT NULL DEFAULT 'USD',
  quote_currency text NOT NULL,
  rate numeric(14, 6) NOT NULL,
  provider text NOT NULL DEFAULT 'OPEN_EXCHANGE_RATES_API',
  source_name text NOT NULL,
  source_url text NOT NULL,
  status text NOT NULL DEFAULT 'VERIFIED',
  safety_buffer_percent numeric(5, 2) NOT NULL DEFAULT 2.00,
  is_manual_override boolean NOT NULL DEFAULT false,
  override_reason text,
  override_admin_email text,
  override_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_auto_sync boolean NOT NULL DEFAULT true,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_currency_pair UNIQUE (base_currency, quote_currency)
);

CREATE TABLE IF NOT EXISTS public.currency_exchange_rate_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_id uuid REFERENCES public.currency_exchange_rates(id) ON DELETE CASCADE,
  base_currency text NOT NULL,
  quote_currency text NOT NULL,
  rate numeric(14, 6) NOT NULL,
  provider text NOT NULL,
  source_name text NOT NULL,
  source_url text NOT NULL,
  status text NOT NULL,
  safety_buffer_percent numeric(5, 2) NOT NULL DEFAULT 2.00,
  is_manual_override boolean NOT NULL DEFAULT false,
  reason text,
  admin_email text,
  effective_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_exchange_rate_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active currency exchange rates" ON public.currency_exchange_rates;
CREATE POLICY "Public can view active currency exchange rates"
  ON public.currency_exchange_rates FOR SELECT
  USING (is_active = true);

-- Seed TEST_ONLY fixture rate for Staging Sandbox testing (NEVER marked VERIFIED;
-- strictly blocked in Production/Live by resolvePayPalChargeFromRate).
INSERT INTO public.currency_exchange_rates (
  country_code, country_name, base_currency, quote_currency, rate,
  provider, source_name, source_url, status, is_manual_override, is_active, is_auto_sync, expires_at
)
VALUES (
  'UY', 'Uruguay', 'USD', 'UYU', 42.500000,
  'TEST_ONLY_STAGING_FIXTURE', 'TEST ONLY — Staging Sandbox Fixture (Not For Production)', 'https://sandbox.paypal.com/',
  'TEST_ONLY', false, true, false, now() + interval '30 days'
)
ON CONFLICT (base_currency, quote_currency) DO NOTHING;

-- 3. Payment events audit trail (required by record_payment_transaction_atomic)
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  normalized_status text NOT NULL,
  provider_status text,
  provider_event_id text,
  source text NOT NULL DEFAULT 'webhook',
  payload_sanitized jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_result text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_provider_event_id
  ON public.payment_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_events TO service_role;

-- 4. Atomic payment transaction recorder RPC (service_role only)
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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_id UUID;
  v_payment_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_event_id TEXT;
  v_next_attempt_num INTEGER;
  v_is_financial_mismatch BOOLEAN := FALSE;
  v_attempt_normalized_status TEXT;
  v_payment_status TEXT;
BEGIN
  PERFORM 1 FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF p_normalized_status IN ('fraud_suspected', 'manual_verification_required', 'amount_mismatch') THEN
    v_is_financial_mismatch := TRUE;
    v_attempt_normalized_status := 'manual_verification_required';
    v_payment_status := 'failed';
  ELSE
    v_attempt_normalized_status := p_normalized_status;
    v_payment_status := CASE
      WHEN p_normalized_status IN ('initiated', 'processing') THEN 'pending'
      WHEN p_normalized_status = 'expired' THEN 'cancelled'
      ELSE p_normalized_status
    END;
  END IF;

  IF p_external_payment_id IS NOT NULL AND p_external_payment_id <> '' THEN
    SELECT id INTO v_attempt_id
    FROM public.payment_attempts
    WHERE order_id = p_order_id AND external_payment_id = p_external_payment_id
    ORDER BY attempt_number DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_attempt_id IS NOT NULL THEN
    UPDATE public.payment_attempts
    SET
      normalized_status = v_attempt_normalized_status,
      provider_status = p_provider_status,
      provider_status_detail = p_provider_status_detail,
      external_payment_id = COALESCE(p_external_payment_id, external_payment_id),
      approved_at = CASE WHEN v_attempt_normalized_status = 'approved' THEN v_now ELSE approved_at END,
      updated_at = v_now
    WHERE id = v_attempt_id;
  ELSE
    SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next_attempt_num
    FROM public.payment_attempts
    WHERE order_id = p_order_id;

    INSERT INTO public.payment_attempts (
      order_id, provider, payment_method_type, attempt_number,
      amount, currency, normalized_status, provider_status, provider_status_detail,
      external_payment_id, initiated_at, approved_at
    ) VALUES (
      p_order_id, p_provider, p_provider, v_next_attempt_num,
      p_amount, p_currency, v_attempt_normalized_status, p_provider_status, p_provider_status_detail,
      p_external_payment_id, v_now,
      CASE WHEN v_attempt_normalized_status = 'approved' THEN v_now ELSE NULL END
    )
    RETURNING id INTO v_attempt_id;
  END IF;

  IF p_external_payment_id IS NOT NULL AND p_external_payment_id <> '' THEN
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE order_id = p_order_id AND provider = p_provider AND transaction_external_id = p_external_payment_id
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_payment_id IS NOT NULL THEN
    UPDATE public.payments
    SET status = v_payment_status, amount = p_amount, currency = p_currency,
        raw_webhook = p_raw_payload, updated_at = v_now
    WHERE id = v_payment_id;
  ELSE
    INSERT INTO public.payments (
      order_id, provider, transaction_external_id, amount, currency,
      status, raw_webhook, created_at, updated_at
    ) VALUES (
      p_order_id, p_provider, p_external_payment_id, p_amount, p_currency,
      v_payment_status, p_raw_payload, v_now, v_now
    )
    RETURNING id INTO v_payment_id;
  END IF;

  v_event_id := COALESCE(
    p_provider_event_id,
    p_provider || '-' || p_source || '-' || COALESCE(p_external_payment_id, v_attempt_id::text) || '-' || p_provider_status
  );

  INSERT INTO public.payment_events (
    order_id, payment_attempt_id, provider, event_type, normalized_status,
    provider_status, provider_event_id, source, payload_sanitized, processing_result, occurred_at
  ) VALUES (
    p_order_id, v_attempt_id, p_provider, p_source || '_' || p_provider_status, v_attempt_normalized_status,
    p_provider_status, v_event_id, p_source,
    jsonb_build_object('payment_id', p_external_payment_id, 'status', p_provider_status, 'financial_mismatch', v_is_financial_mismatch),
    'Recorded atomically: ' || v_attempt_normalized_status, v_now
  )
  ON CONFLICT (provider, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING;

  UPDATE public.orders
  SET
    payment_status = CASE WHEN v_is_financial_mismatch THEN payment_status ELSE v_attempt_normalized_status END,
    payment_provider = p_provider,
    last_payment_attempt_id = v_attempt_id,
    updated_at = v_now
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'payment_id', v_payment_id, 'event_id', v_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_transaction_atomic(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_transaction_atomic(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO service_role;

-- 5. PayPal webhook events deduplication & dead-letter table (strict RLS)
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

-- 6. Seed non-secret PayPal Sandbox mode flags in Staging site_settings
--    (Actual Sandbox Client ID / Secret / Webhook ID MUST be stored in Supabase Edge Secrets)
INSERT INTO public.site_settings (key, value)
VALUES
  ('payments_paypal_sandbox', 'true'),
  ('payments_paypal_enabled', 'false'),
  ('payments_paypal_webhook_id', '')
ON CONFLICT (key) DO NOTHING;
