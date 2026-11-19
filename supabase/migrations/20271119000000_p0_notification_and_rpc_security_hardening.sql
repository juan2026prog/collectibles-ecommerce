-- =============================================================================
-- Migration: 20271119000000_p0_notification_and_rpc_security_hardening.sql
-- Purpose:
--   P0/P1 Security Hardening for SECURITY DEFINER RPCs in Production:
--   1. Lock down claim_notification_outbox_batch & enqueue_notification_event
--      to service_role / postgres triggers only (REVOKE FROM PUBLIC, anon, authenticated).
--   2. Harden can_access_shipping_label_as_customer & can_access_shipping_label_as_vendor
--      to require p_user_id = auth.uid() for non-service callers and REVOKE FROM anon.
--   3. Revoke anon EXECUTE on log_ai_error_event, log_ai_usage_event,
--      log_ai_intelligence_run, get_admin_dashboard_metrics, get_ai_dashboard_summary.
--
-- Rollback plan:
--   Restore previous function bodies from 20271118000000 / storage migrations
--   and re-grant EXECUTE to authenticated if needed.
-- =============================================================================

-- 1. Harden claim_notification_outbox_batch (service_role / worker only)
CREATE OR REPLACE FUNCTION public.claim_notification_outbox_batch(
  p_worker_id text,
  p_limit integer DEFAULT 20,
  p_lock_seconds integer DEFAULT 180
)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text := current_setting('role', true);
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(v_caller_role, '') NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied: claim_notification_outbox_batch requires service_role.';
  END IF;

  RETURN QUERY
  WITH candidate AS (
      SELECT o.id
      FROM public.notification_outbox o
      WHERE (
          o.status IN ('queued', 'retrying')
          AND o.next_retry_at <= clock_timestamp()
          AND o.attempts < o.max_attempts
      )
      OR (
          o.status = 'processing'
          AND o.attempts < o.max_attempts
          AND (o.locked_at IS NULL OR o.locked_at < clock_timestamp() - (p_lock_seconds || ' seconds')::interval)
      )
      ORDER BY o.next_retry_at ASC, o.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
  )
  UPDATE public.notification_outbox target
  SET
      status = 'processing',
      locked_by = p_worker_id,
      locked_at = clock_timestamp(),
      attempts = target.attempts + 1,
      updated_at = clock_timestamp()
  FROM candidate c
  WHERE target.id = c.id
  RETURNING target.*;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_notification_outbox_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_notification_outbox_batch(text, integer, integer) TO service_role;

-- 2. Harden enqueue_notification_event (SECURITY DEFINER triggers running as postgres + service_role)
CREATE OR REPLACE FUNCTION public.enqueue_notification_event(
  p_event_type text,
  p_idempotency_key text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text := current_setting('role', true);
  v_outbox_id uuid;
  v_cron_secret text;
  v_wa_secret text;
  v_full_payload jsonb;
BEGIN
  -- Allow PostgreSQL SECURITY DEFINER triggers (current_user = postgres/supabase_admin)
  -- and backend Edge Functions (role = service_role). Block direct anon/authenticated RPC calls.
  IF pg_trigger_depth() = 0
     AND COALESCE(v_caller_role, '') NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied: enqueue_notification_event requires service_role or internal trigger context.';
  END IF;

  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
      p_idempotency_key := p_event_type || ':' || gen_random_uuid()::text;
  END IF;

  INSERT INTO public.notification_outbox (
      event_type,
      idempotency_key,
      payload,
      status,
      attempts,
      max_attempts,
      next_retry_at
  ) VALUES (
      p_event_type,
      p_idempotency_key,
      COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('event_type', p_event_type, 'idempotency_key', p_idempotency_key),
      'queued',
      0,
      5,
      clock_timestamp()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_outbox_id;

  IF v_outbox_id IS NULL THEN
      SELECT id INTO v_outbox_id
      FROM public.notification_outbox
      WHERE idempotency_key = p_idempotency_key
      LIMIT 1;
      RETURN v_outbox_id;
  END IF;

  BEGIN
      SELECT decrypted_secret INTO v_cron_secret
      FROM vault.decrypted_secrets
      WHERE name = 'collectibles_cron_secret'
      LIMIT 1;

      SELECT value INTO v_wa_secret
      FROM public.site_settings
      WHERE key = 'whatsapp_webhook_secret'
      LIMIT 1;

      v_full_payload := COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
          'event_type', p_event_type,
          'idempotency_key', p_idempotency_key,
          'outbox_id', v_outbox_id,
          'webhook_secret', v_wa_secret
      );

      PERFORM net.http_post(
          url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/notification-dispatcher',
          headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-collectibles-cron-secret', COALESCE(v_cron_secret, ''),
              'x-webhook-secret', COALESCE(v_wa_secret, '')
          ),
          body := v_full_payload,
          timeout_milliseconds := 15000
      );
  EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[Notification Outbox] Immediate HTTP wake-up deferred to sweeper: %', SQLERRM;
  END;

  RETURN v_outbox_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enqueue_notification_event(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enqueue_notification_event(text, text, jsonb) TO service_role;

-- 3. Harden shipping label access helpers (prevent cross-user UUID probing; keep authenticated for storage.objects RLS)
CREATE OR REPLACE FUNCTION public.can_access_shipping_label_as_customer(
  p_name text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres', 'supabase_admin')
           AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid())
      THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.shipments s
        JOIN public.orders o ON s.order_id = o.id
        WHERE (o.customer_id = p_user_id OR o.user_id = p_user_id)
          AND (s.label_storage_path = p_name OR s.shipping_label_url LIKE '%' || p_name || '%')
      )
    END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_shipping_label_as_vendor(
  p_name text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres', 'supabase_admin')
           AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid())
      THEN false
      ELSE (
        (storage.foldername(p_name))[1] = p_user_id::text
        OR (storage.foldername(p_name))[2] = p_user_id::text
        OR EXISTS (
          SELECT 1 FROM public.shipments s
          JOIN public.order_suborders os ON s.suborder_id = os.id
          WHERE os.vendor_id = p_user_id
            AND (s.label_storage_path = p_name OR s.shipping_label_url LIKE '%' || p_name || '%')
        )
      )
    END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_access_shipping_label_as_customer(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_access_shipping_label_as_customer(text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.can_access_shipping_label_as_vendor(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_access_shipping_label_as_vendor(text, uuid) TO authenticated, service_role;

-- 4. Revoke anon EXECUTE on AI telemetry logging & admin dashboard summary RPCs (keep authenticated + service_role)
REVOKE EXECUTE ON FUNCTION public.log_ai_error_event(text, text, text, text, text, text, text, integer, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_ai_error_event(text, text, text, text, text, text, text, integer, text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_ai_usage_event(text, text, text, text, text, integer, integer, integer, numeric, integer, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_ai_usage_event(text, text, text, text, text, integer, integer, integer, numeric, integer, text, boolean, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_ai_intelligence_run(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_ai_intelligence_run(jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_ai_dashboard_summary() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_ai_dashboard_summary() TO authenticated, service_role;
