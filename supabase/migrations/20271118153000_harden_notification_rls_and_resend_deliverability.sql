-- ============================================================================
-- COLLECTIBLES 2026 — HARDEN NOTIFICATION RLS & DELIVERABILITY TRACKING
-- 1. Removes permissive public INSERT policy on public.notification_logs
-- 2. Enforces least-privilege table & column grants for anon / authenticated
-- 3. Protects public.user_notifications immutable fields via BEFORE UPDATE trigger
-- 4. Adds explicit WITH CHECK clauses on user_notification_devices & vendor_notification_settings
-- 5. Adds Resend / OneSignal final deliverability tracking columns & indexes
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. HARDEN public.notification_logs (Fase 3)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "System can insert notification logs" ON public.notification_logs;

REVOKE ALL ON public.notification_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notification_logs FROM authenticated;
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;

ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_event TEXT,
  ADD COLUMN IF NOT EXISTS webhook_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notification_logs_provider_msg_id
  ON public.notification_logs(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. HARDEN public.email_logs (Fase 3 & Fase 6)
-- ----------------------------------------------------------------------------
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_event TEXT,
  ADD COLUMN IF NOT EXISTS webhook_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_logs_provider_msg_id
  ON public.email_logs(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

REVOKE ALL ON public.email_logs FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.email_logs FROM authenticated;
GRANT SELECT, INSERT ON public.email_logs TO authenticated;
GRANT ALL ON public.email_logs TO service_role;

DROP POLICY IF EXISTS "Admins can insert email_logs" ON public.email_logs;
CREATE POLICY "Admins can insert email_logs"
  ON public.email_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. HARDEN public.notification_outbox (Fase 3)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.notification_outbox FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notification_outbox FROM authenticated;
GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT ALL ON public.notification_outbox TO service_role;

DROP POLICY IF EXISTS "Admins can view and manage notification_outbox" ON public.notification_outbox;
DROP POLICY IF EXISTS "Admins can view notification_outbox" ON public.notification_outbox;
CREATE POLICY "Admins can view notification_outbox"
  ON public.notification_outbox
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. HARDEN public.user_notifications (Column-level UPDATE + Immutable Trigger)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.user_notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_notifications FROM authenticated;
GRANT SELECT ON public.user_notifications TO authenticated;
GRANT UPDATE (is_read, read_at) ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.fn_guard_user_notifications_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.role_scope IS DISTINCT FROM OLD.role_scope
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.affiliate_id IS DISTINCT FROM OLD.affiliate_id
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.event_type IS DISTINCT FROM OLD.event_type
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.action_url IS DISTINCT FROM OLD.action_url
       OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.severity IS DISTINCT FROM OLD.severity
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Forbidden: Only read status (is_read, read_at) can be updated on user_notifications.';
    END IF;
  END IF;

  IF NEW.is_read = true AND OLD.is_read = false AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_notifications_immutable_fields ON public.user_notifications;
CREATE TRIGGER trg_guard_user_notifications_immutable_fields
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_user_notifications_update();

-- ----------------------------------------------------------------------------
-- 5. HARDEN public.notification_preferences, devices & vendor_notification_settings
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.notification_preferences FROM anon;
REVOKE TRUNCATE ON public.notification_preferences FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

DROP POLICY IF EXISTS "Users can manage own notification_preferences" ON public.notification_preferences;
CREATE POLICY "Users can manage own notification_preferences"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING ((user_id = (SELECT auth.uid())) OR public.is_admin())
  WITH CHECK ((user_id = (SELECT auth.uid())) OR public.is_admin());

DROP POLICY IF EXISTS "Users can update their own notification devices" ON public.user_notification_devices;
CREATE POLICY "Users can update their own notification devices"
  ON public.user_notification_devices
  FOR UPDATE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id) OR public.is_admin())
  WITH CHECK (((SELECT auth.uid()) = user_id) OR public.is_admin());

DROP POLICY IF EXISTS "Vendors can manage their own settings" ON public.vendor_notification_settings;
CREATE POLICY "Vendors can manage their own settings"
  ON public.vendor_notification_settings
  FOR ALL
  TO authenticated
  USING (((SELECT auth.uid()) = vendor_id) OR public.is_admin())
  WITH CHECK (((SELECT auth.uid()) = vendor_id) OR public.is_admin());

COMMIT;
