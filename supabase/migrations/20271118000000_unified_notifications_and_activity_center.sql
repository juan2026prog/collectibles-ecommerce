-- =============================================================================
-- COLLECTIBLES 2026 — UNIFIED NOTIFICATIONS & ACTIVITY CENTER
-- Migration: 20271118000000_unified_notifications_and_activity_center.sql
-- =============================================================================
-- Implements:
-- 1. Legacy email_logs compatibility table (preventing errors in legacy functions)
-- 2. user_notifications (Unified In-App Activity Center for Customer, Admin, Vendor, Influencer)
-- 3. notification_outbox (Durable transactional outbox with exponential backoff & DLQ)
-- 4. notification_preferences (Role-aware channel & category preferences)
-- 5. Enhanced admin_notification_settings & vendor_notification_settings
-- 6. Enhanced notification_logs (scope expansion + delivery metadata)
-- 7. Enhanced affiliate_commissions (financial reconciliation & audit columns)
-- 8. Secure server-to-server trigger authentication via Vault / collectibles_internal
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. LEGACY EMAIL_LOGS TABLE (Compatibility & Historical Integrity)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    recipient_email text NOT NULL,
    subject text NOT NULL,
    email_type text NOT NULL,
    status text NOT NULL DEFAULT 'sent',
    error_message text,
    provider_message_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all email_logs" ON public.email_logs;
CREATE POLICY "Admins can view all email_logs" ON public.email_logs
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Users can view own email_logs" ON public.email_logs;
CREATE POLICY "Users can view own email_logs" ON public.email_logs
    FOR SELECT USING (auth.uid() = customer_id);

CREATE INDEX IF NOT EXISTS idx_email_logs_customer_id ON public.email_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. UNIFIED IN-APP ACTIVITY CENTER (user_notifications)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_scope text NOT NULL CHECK (role_scope IN ('customer', 'vendor', 'admin', 'affiliate')),
    vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
    affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE CASCADE,
    category text NOT NULL DEFAULT 'general' CHECK (category IN (
        'purchases', 'sales', 'payments', 'shipments', 'deliveries',
        'returns', 'claims', 'commissions', 'payouts', 'questions',
        'alerts', 'summaries', 'general'
    )),
    event_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    action_url text,
    entity_type text,
    entity_id text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'error', 'priority')),
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamptz,
    idempotency_key text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Strict Multi-Tenant & Role-Scoped RLS Policies for user_notifications
DROP POLICY IF EXISTS "Customers can view own customer notifications" ON public.user_notifications;
CREATE POLICY "Customers can view own customer notifications" ON public.user_notifications
    FOR SELECT USING (
        role_scope = 'customer' AND user_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "Vendors can view own vendor notifications" ON public.user_notifications;
CREATE POLICY "Vendors can view own vendor notifications" ON public.user_notifications
    FOR SELECT USING (
        role_scope = 'vendor' AND (
            vendor_id = (SELECT auth.uid()) OR user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Affiliates can view own affiliate notifications" ON public.user_notifications;
CREATE POLICY "Affiliates can view own affiliate notifications" ON public.user_notifications
    FOR SELECT USING (
        role_scope = 'affiliate' AND (
            affiliate_id = (SELECT auth.uid()) OR user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Admins can view all notifications" ON public.user_notifications;
CREATE POLICY "Admins can view all notifications" ON public.user_notifications
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Users can mark own notifications as read" ON public.user_notifications;
CREATE POLICY "Users can mark own notifications as read" ON public.user_notifications
    FOR UPDATE USING (
        user_id = (SELECT auth.uid())
        OR (role_scope = 'vendor' AND vendor_id = (SELECT auth.uid()))
        OR (role_scope = 'affiliate' AND affiliate_id = (SELECT auth.uid()))
        OR (role_scope = 'admin' AND public.is_admin())
    )
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR (role_scope = 'vendor' AND vendor_id = (SELECT auth.uid()))
        OR (role_scope = 'affiliate' AND affiliate_id = (SELECT auth.uid()))
        OR (role_scope = 'admin' AND public.is_admin())
    );

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_role_unread
    ON public.user_notifications(user_id, role_scope, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_vendor_unread
    ON public.user_notifications(vendor_id, role_scope, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_affiliate_unread
    ON public.user_notifications(affiliate_id, role_scope, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_admin_feed
    ON public.user_notifications(role_scope, category, created_at DESC);

-- Enable Realtime on user_notifications safely
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_notifications'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
        END IF;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. DURABLE TRANSACTIONAL NOTIFICATION OUTBOX (notification_outbox)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN (
        'queued', 'processing', 'sent', 'delivered', 'failed', 'retrying', 'exhausted'
    )),
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    next_retry_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    locked_by text,
    locked_at timestamptz,
    processed_at timestamptz,
    last_error text,
    error_classification text CHECK (error_classification IN ('transient', 'permanent', 'configuration', 'none')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view and manage notification_outbox" ON public.notification_outbox;
CREATE POLICY "Admins can view and manage notification_outbox" ON public.notification_outbox
    FOR ALL USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
    ON public.notification_outbox(status, next_retry_at ASC)
    WHERE status IN ('queued', 'retrying', 'processing');

CREATE INDEX IF NOT EXISTS idx_notification_outbox_created_at
    ON public.notification_outbox(created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. EXPAND NOTIFICATION_LOGS CONSTRAINTS & METADATA
-- -----------------------------------------------------------------------------
ALTER TABLE public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_scope_check;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_scope_check
    CHECK (scope = ANY (ARRAY['vendor'::text, 'admin'::text, 'customer'::text, 'affiliate'::text]));

ALTER TABLE public.notification_logs
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS suborder_id uuid REFERENCES public.order_suborders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS outbox_id uuid REFERENCES public.notification_outbox(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
    ADD COLUMN IF NOT EXISTS is_permanent_error boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP POLICY IF EXISTS "Customers can view own notification_logs" ON public.notification_logs;
CREATE POLICY "Customers can view own notification_logs" ON public.notification_logs
    FOR SELECT USING (scope = 'customer' AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Affiliates can view own notification_logs" ON public.notification_logs;
CREATE POLICY "Affiliates can view own notification_logs" ON public.notification_logs
    FOR SELECT USING (scope = 'affiliate' AND affiliate_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON public.notification_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_outbox_id ON public.notification_logs(outbox_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status_retry ON public.notification_logs(status, next_retry_at)
    WHERE status IN ('failed', 'retrying');

-- -----------------------------------------------------------------------------
-- 5. ROLE-AWARE NOTIFICATION PREFERENCES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_scope text NOT NULL CHECK (role_scope IN ('customer', 'vendor', 'admin', 'affiliate')),
    channels jsonb NOT NULL DEFAULT '{"email": true, "push": true, "in_app": true, "whatsapp": false}'::jsonb,
    categories jsonb NOT NULL DEFAULT '{
        "purchases": true,
        "sales": true,
        "payments": true,
        "shipments": true,
        "deliveries": true,
        "returns": true,
        "claims": true,
        "commissions": true,
        "payouts": true,
        "questions": true,
        "alerts": true,
        "summaries": true
    }'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_role_notification_preferences UNIQUE (user_id, role_scope)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own notification_preferences" ON public.notification_preferences;
CREATE POLICY "Users can manage own notification_preferences" ON public.notification_preferences
    FOR ALL USING (user_id = (SELECT auth.uid()) OR public.is_admin())
    WITH CHECK (user_id = (SELECT auth.uid()) OR public.is_admin());

-- Enhance admin_notification_settings with granular sales & event controls
ALTER TABLE public.admin_notification_settings
    ADD COLUMN IF NOT EXISTS sales_notification_mode text NOT NULL DEFAULT 'own_only'
        CHECK (sales_notification_mode IN ('all', 'own_only', 'vendors_only', 'international_only', 'influencer_only', 'daily_summary_only', 'custom')),
    ADD COLUMN IF NOT EXISTS notify_international_sales boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_influencer_sales boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_daily_summary boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_refunds boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_disputes boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_affiliate_commissions boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_logistics_incidents boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_system_errors boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_returns boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_claims boolean NOT NULL DEFAULT true;

-- Enhance vendor_notification_settings with full operational toggles
ALTER TABLE public.vendor_notification_settings
    ADD COLUMN IF NOT EXISTS notify_order_delivered boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_order_cancelled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_returns_and_refunds boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_financial_adjustments boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_liquidations boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notify_disputes boolean NOT NULL DEFAULT true;

-- -----------------------------------------------------------------------------
-- 6. AFFILIATE COMMISSIONS FINANCIAL RECONCILIATION ENHANCEMENTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.affiliate_commissions
    ADD COLUMN IF NOT EXISTS base_amount numeric(12,2),
    ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2),
    ADD COLUMN IF NOT EXISTS refunded_amount numeric(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS adjustment_amount numeric(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS coupon_code text,
    ADD COLUMN IF NOT EXISTS attribution_type text DEFAULT 'link',
    ADD COLUMN IF NOT EXISTS order_reference text,
    ADD COLUMN IF NOT EXISTS notes text,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS paid_at timestamptz,
    ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure unique commission per (order_id, affiliate_id) so duplicate attributions never happen
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_affiliate_commissions_order_affiliate'
    ) THEN
        ALTER TABLE public.affiliate_commissions
            ADD CONSTRAINT uq_affiliate_commissions_order_affiliate UNIQUE (order_id, affiliate_id);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7. ATOMIC OUTBOX CLAIM & ENQUEUE FUNCTIONS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_notification_outbox_batch(
    p_worker_id text,
    p_limit integer DEFAULT 20,
    p_lock_seconds integer DEFAULT 180
)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
$$;

-- Helper function to safely enqueue an event into notification_outbox and trigger async dispatch
CREATE OR REPLACE FUNCTION public.enqueue_notification_event(
    p_event_type text,
    p_idempotency_key text,
    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_outbox_id uuid;
    v_cron_secret text;
    v_wa_secret text;
    v_full_payload jsonb;
BEGIN
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

    -- If already enqueued previously, return existing id without re-firing HTTP
    IF v_outbox_id IS NULL THEN
        SELECT id INTO v_outbox_id
        FROM public.notification_outbox
        WHERE idempotency_key = p_idempotency_key
        LIMIT 1;
        RETURN v_outbox_id;
    END IF;

    -- Attempt immediate non-blocking wake-up of notification-dispatcher using Vault secret
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
        -- Outbox row is safely persisted as 'queued'; the sweeper cron will process it!
        RAISE WARNING '[Notification Outbox] Immediate HTTP wake-up deferred to sweeper: %', SQLERRM;
    END;

    RETURN v_outbox_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. UPDATE WORKER LEASE & INTERNAL WORKER WHITELIST
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_worker_lease(p_worker text, p_owner uuid, p_seconds integer DEFAULT 600)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE claimed uuid;
BEGIN
  IF p_worker NOT IN (
    'ml-import-worker','campaign-runner','abandoned-carts-cron',
    'smart-wishlist-cron','zinc-sync-published-products','zinc-sync-order-tracking',
    'notification-dispatcher','admin-daily-summary-cron','order-execution-worker'
  ) THEN
    RAISE EXCEPTION 'Invalid worker';
  END IF;
  IF p_owner IS NULL THEN RETURN false; END IF;
  INSERT INTO collectibles_internal.worker_leases(worker, owner, expires_at)
  VALUES (p_worker, p_owner, clock_timestamp() + make_interval(secs => least(greatest(p_seconds,60),600)))
  ON CONFLICT (worker) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
  WHERE collectibles_internal.worker_leases.expires_at < clock_timestamp()
  RETURNING owner INTO claimed;
  RETURN claimed IS NOT NULL AND claimed = p_owner;
END;
$function$;

CREATE OR REPLACE FUNCTION collectibles_internal.invoke_collectibles_worker(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE secret text; request_id bigint;
BEGIN
  IF p_function NOT IN (
    'ml-import-worker','campaign-runner','abandoned-carts-cron',
    'smart-wishlist-cron','zinc-sync-published-products','zinc-sync-order-tracking',
    'notification-dispatcher','admin-daily-summary-cron','order-execution-worker'
  ) THEN
    RAISE EXCEPTION 'Invalid worker';
  END IF;
  SELECT decrypted_secret INTO STRICT secret FROM vault.decrypted_secrets WHERE name = 'collectibles_cron_secret';
  SELECT net.http_post(
    url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type','application/json','x-collectibles-cron-secret',secret),
    body := p_body, timeout_milliseconds := 60000
  ) INTO request_id;
  RETURN request_id;
END;
$function$;

-- Fix invoke_admin_daily_summary_cron to use collectibles_internal.invoke_collectibles_worker
CREATE OR REPLACE FUNCTION public.invoke_admin_daily_summary_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM collectibles_internal.invoke_collectibles_worker('admin-daily-summary-cron', '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to invoke admin-daily-summary-cron: %', SQLERRM;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 9. UNIFIED DATABASE TRIGGERS (Enqueuing to notification_outbox)
-- -----------------------------------------------------------------------------

-- 9.1 Update fn_trigger_whatsapp_notification (Orders, Payouts, Variants, Shipments)
CREATE OR REPLACE FUNCTION public.fn_trigger_whatsapp_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_vendor_id uuid;
BEGIN
    BEGIN
        IF TG_TABLE_NAME = 'orders' THEN
            IF TG_OP = 'INSERT' THEN
                -- Order created pending payment
                IF NEW.status IN ('pending', 'awaiting_payment') THEN
                    PERFORM public.enqueue_notification_event(
                        'order_created',
                        'order_created:' || NEW.id::text,
                        jsonb_build_object('order_id', NEW.id)
                    );
                END IF;
                -- If inserted already paid
                IF NEW.payment_processed_at IS NOT NULL AND NEW.payment_status IN ('approved', 'paid', 'accredited') THEN
                    PERFORM public.enqueue_notification_event(
                        'order_paid',
                        'order_paid:' || NEW.id::text,
                        jsonb_build_object('order_id', NEW.id)
                    );
                END IF;
                RETURN NEW;
            END IF;

            -- Order UPDATE transitions
            -- 1. Payment certified approved
            IF (NEW.status IN ('paid', 'confirmed') OR NEW.payment_status IN ('approved', 'paid', 'accredited'))
               AND NEW.payment_processed_at IS NOT NULL
               AND (OLD.payment_processed_at IS NULL OR OLD.payment_status IS DISTINCT FROM NEW.payment_status OR OLD.status IS DISTINCT FROM NEW.status) THEN
                PERFORM public.enqueue_notification_event(
                    'order_paid',
                    'order_paid:' || NEW.id::text,
                    jsonb_build_object('order_id', NEW.id)
                );
            END IF;

            -- 2. Payment pending offline / in_process
            IF NEW.payment_status IN ('in_process', 'pending_offline', 'pending_payment', 'pending_review')
               AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
                PERFORM public.enqueue_notification_event(
                    'payment_pending',
                    'payment_pending:' || NEW.id::text || ':' || NEW.payment_status,
                    jsonb_build_object('order_id', NEW.id, 'payment_status', NEW.payment_status)
                );
            END IF;

            -- 3. Payment rejected
            IF NEW.payment_status IN ('rejected', 'failed')
               AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
                PERFORM public.enqueue_notification_event(
                    'payment_rejected',
                    'payment_rejected:' || NEW.id::text || ':' || COALESCE(NEW.last_payment_attempt_id::text, extract(epoch from now())::bigint::text),
                    jsonb_build_object('order_id', NEW.id, 'payment_status', NEW.payment_status)
                );
            END IF;

            -- 4. Order cancelled (only if previously paid; dispatcher also enforces guard)
            IF NEW.status IN ('cancelled', 'cancelada') AND OLD.status IS DISTINCT FROM NEW.status THEN
                IF NEW.payment_processed_at IS NOT NULL OR OLD.payment_status IN ('approved', 'paid', 'refunded') THEN
                    PERFORM public.enqueue_notification_event(
                        'order_cancelled',
                        'order_cancelled:' || NEW.id::text,
                        jsonb_build_object('order_id', NEW.id)
                    );
                END IF;
            END IF;

            -- 5. Order shipped (parent level fallback if no suborders)
            IF NEW.status IN ('shipped', 'despachado') AND OLD.status IS DISTINCT FROM NEW.status THEN
                PERFORM public.enqueue_notification_event(
                    'order_shipped',
                    'order_shipped:' || NEW.id::text,
                    jsonb_build_object('order_id', NEW.id, 'tracking_number', NEW.tracking_number, 'shipping_provider', COALESCE(NEW.tracking_provider, NEW.shipping_provider))
                );
            END IF;

            -- 6. Order delivered (parent level fallback)
            IF NEW.status IN ('delivered', 'entregado') AND OLD.status IS DISTINCT FROM NEW.status THEN
                PERFORM public.enqueue_notification_event(
                    'order_delivered',
                    'order_delivered:' || NEW.id::text,
                    jsonb_build_object('order_id', NEW.id)
                );
            END IF;

        ELSIF TG_TABLE_NAME = 'vendor_payouts' THEN
            IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
                PERFORM public.enqueue_notification_event(
                    'payout_paid',
                    'payout_paid:' || NEW.id::text,
                    jsonb_build_object('payout_id', NEW.id, 'vendor_id', NEW.vendor_id, 'order_id', NEW.order_id, 'amount', NEW.amount)
                );
            END IF;

        ELSIF TG_TABLE_NAME = 'product_variants' THEN
            IF NEW.inventory_count <= 2 AND (OLD.inventory_count IS NULL OR OLD.inventory_count > 2) AND NEW.is_active = true THEN
                SELECT vendor_id INTO v_vendor_id FROM public.products WHERE id = NEW.product_id;
                PERFORM public.enqueue_notification_event(
                    'low_stock',
                    'low_stock:' || NEW.id::text || ':' || to_char(now(), 'YYYY-MM-DD'),
                    jsonb_build_object('variant_id', NEW.id, 'product_id', NEW.product_id, 'vendor_id', v_vendor_id)
                );
            END IF;

        ELSIF TG_TABLE_NAME = 'shipments' THEN
            IF TG_OP = 'UPDATE' THEN
                -- When tracking code is assigned or status moves to shipped/in_transit
                IF (NEW.shipping_status IN ('shipped', 'in_transit', 'out_for_delivery', 'dispatched')
                    AND OLD.shipping_status IS DISTINCT FROM NEW.shipping_status)
                   OR (NEW.tracking_code IS NOT NULL AND OLD.tracking_code IS NULL AND NEW.shipping_status NOT IN ('queued', 'cancelled', 'delivered')) THEN
                    PERFORM public.enqueue_notification_event(
                        'shipment_dispatched',
                        'shipment_dispatched:' || NEW.id::text,
                        jsonb_build_object(
                            'shipment_id', NEW.id,
                            'order_id', NEW.order_id,
                            'suborder_id', NEW.suborder_id,
                            'vendor_id', NEW.vendor_id,
                            'tracking_number', COALESCE(NEW.tracking_code, NEW.external_tracking_number, NEW.external_guide),
                            'shipping_provider', NEW.provider_key
                        )
                    );
                ELSIF NEW.shipping_status IN ('delivered', 'entregado') AND OLD.shipping_status IS DISTINCT FROM NEW.shipping_status THEN
                    PERFORM public.enqueue_notification_event(
                        'shipment_delivered',
                        'shipment_delivered:' || NEW.id::text,
                        jsonb_build_object(
                            'shipment_id', NEW.id,
                            'order_id', NEW.order_id,
                            'suborder_id', NEW.suborder_id,
                            'vendor_id', NEW.vendor_id
                        )
                    );
                ELSIF NEW.shipping_status IN ('delivery_failed', 'rejected', 'error') AND OLD.shipping_status IS DISTINCT FROM NEW.shipping_status THEN
                    PERFORM public.enqueue_notification_event(
                        'logistics_incident',
                        'logistics_incident:' || NEW.id::text || ':' || NEW.shipping_status,
                        jsonb_build_object(
                            'shipment_id', NEW.id,
                            'order_id', NEW.order_id,
                            'suborder_id', NEW.suborder_id,
                            'vendor_id', NEW.vendor_id,
                            'error_message', COALESCE(NEW.error_message, NEW.external_status_description, 'Incidencia logística reportada')
                        )
                    );
                END IF;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to enqueue notification from trigger: %', SQLERRM;
    END;
    RETURN NEW;
END;
$function$;

-- Ensure trigger on orders covers INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_whatsapp_order_paid ON public.orders;
CREATE TRIGGER trg_whatsapp_order_paid
    AFTER INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_whatsapp_notification();

-- 9.2 Suborder Lifecycle Trigger (Preparing, Prepared, Shipped, Delivered)
CREATE OR REPLACE FUNCTION public.fn_trigger_suborder_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Preparing / Prepared
        IF NEW.status IN ('preparing', 'preparando', 'in_preparation') AND OLD.status IS DISTINCT FROM NEW.status THEN
            PERFORM public.enqueue_notification_event(
                'suborder_preparing',
                'suborder_preparing:' || NEW.id::text,
                jsonb_build_object('order_id', NEW.parent_order_id, 'suborder_id', NEW.id, 'vendor_id', NEW.vendor_id)
            );
        ELSIF NEW.status IN ('prepared', 'preparado', 'ready') AND OLD.status IS DISTINCT FROM NEW.status THEN
            PERFORM public.enqueue_notification_event(
                'suborder_prepared',
                'suborder_prepared:' || NEW.id::text,
                jsonb_build_object('order_id', NEW.parent_order_id, 'suborder_id', NEW.id, 'vendor_id', NEW.vendor_id)
            );
        ELSIF (NEW.status IN ('shipped', 'despachado') AND OLD.status IS DISTINCT FROM NEW.status)
              OR (NEW.shipping_status IN ('shipped', 'despachado', 'in_transit') AND OLD.shipping_status IS DISTINCT FROM NEW.shipping_status) THEN
            PERFORM public.enqueue_notification_event(
                'suborder_shipped',
                'suborder_shipped:' || NEW.id::text,
                jsonb_build_object(
                    'order_id', NEW.parent_order_id,
                    'suborder_id', NEW.id,
                    'vendor_id', NEW.vendor_id,
                    'tracking_number', NEW.tracking_number,
                    'tracking_url', NEW.tracking_url,
                    'shipping_provider', COALESCE(NEW.shipping_provider, NEW.shipping_method)
                )
            );
        ELSIF (NEW.status IN ('delivered', 'entregado') AND OLD.status IS DISTINCT FROM NEW.status)
              OR (NEW.shipping_status IN ('delivered', 'entregado') AND OLD.shipping_status IS DISTINCT FROM NEW.shipping_status) THEN
            PERFORM public.enqueue_notification_event(
                'suborder_delivered',
                'suborder_delivered:' || NEW.id::text,
                jsonb_build_object('order_id', NEW.parent_order_id, 'suborder_id', NEW.id, 'vendor_id', NEW.vendor_id)
            );
        END IF;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enqueue suborder notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suborder_notifications ON public.order_suborders;
CREATE TRIGGER trg_suborder_notifications
    AFTER UPDATE ON public.order_suborders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_suborder_notification();

-- 9.3 Dispute Notification Trigger (Fixed Authentication via Outbox)
CREATE OR REPLACE FUNCTION public.fn_trigger_dispute_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.enqueue_notification_event(
        'dispute_opened',
        'dispute_opened:' || NEW.id::text || ':' || COALESCE(NEW.status, 'open'),
        jsonb_build_object(
            'dispute_id', NEW.id,
            'order_id', NEW.order_id,
            'suborder_id', NEW.suborder_id,
            'vendor_id', NEW.vendor_id,
            'payment_id', NEW.payment_id,
            'amount', NEW.amount,
            'reason', NEW.dispute_reason,
            'provider', NEW.provider,
            'status', NEW.status
        )
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enqueue dispute notification: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- 9.4 Vendor Financial Adjustment Trigger (Fixed Authentication via Outbox)
CREATE OR REPLACE FUNCTION public.fn_trigger_adjustment_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.enqueue_notification_event(
        'vendor_adjustment_created',
        'vendor_adjustment_created:' || NEW.id::text,
        jsonb_build_object(
            'adjustment_id', NEW.id,
            'vendor_id', NEW.vendor_id,
            'order_id', NEW.order_id,
            'suborder_id', NEW.suborder_id,
            'amount', NEW.amount,
            'type_adj', NEW.type,
            'reason', NEW.reason
        )
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enqueue adjustment notification: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- 9.5 Unified Order Requests (Returns, Claims, Cancellations) Trigger
CREATE OR REPLACE FUNCTION public.fn_trigger_unified_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.enqueue_notification_event(
            'return_or_claim_requested',
            'return_requested:' || NEW.id::text,
            jsonb_build_object(
                'request_id', NEW.id,
                'order_id', NEW.order_id,
                'suborder_id', NEW.suborder_id,
                'vendor_id', NEW.vendor_id,
                'customer_id', NEW.customer_id,
                'request_type', NEW.request_type,
                'status', NEW.status,
                'amount_requested', NEW.amount_requested,
                'reason', NEW.reason
            )
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM public.enqueue_notification_event(
            'return_or_claim_updated',
            'return_updated:' || NEW.id::text || ':' || NEW.status,
            jsonb_build_object(
                'request_id', NEW.id,
                'order_id', NEW.order_id,
                'suborder_id', NEW.suborder_id,
                'vendor_id', NEW.vendor_id,
                'customer_id', NEW.customer_id,
                'request_type', NEW.request_type,
                'old_status', OLD.status,
                'status', NEW.status,
                'amount_approved', NEW.amount_approved,
                'reason', COALESCE(NEW.admin_notes, NEW.vendor_notes, NEW.reason)
            )
        );
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enqueue unified request notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unified_order_requests_notifications ON public.unified_order_requests;
CREATE TRIGGER trg_unified_order_requests_notifications
    AFTER INSERT OR UPDATE ON public.unified_order_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_unified_request_notification();

-- 9.6 Vendor Liquidations Trigger (Available & Paid)
CREATE OR REPLACE FUNCTION public.fn_trigger_vendor_liquidation_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.enqueue_notification_event(
            'vendor_liquidation_available',
            'vendor_liq_available:' || NEW.id::text,
            jsonb_build_object(
                'liquidation_id', NEW.id,
                'vendor_id', NEW.vendor_id,
                'net_amount', NEW.net_amount,
                'status', NEW.status
            )
        );
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM public.enqueue_notification_event(
            'vendor_liquidation_paid',
            'vendor_liq_paid:' || NEW.id::text,
            jsonb_build_object(
                'liquidation_id', NEW.id,
                'vendor_id', NEW.vendor_id,
                'net_amount', NEW.net_amount,
                'payment_reference', NEW.payment_reference
            )
        );
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enqueue vendor liquidation notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_liquidation_notifications ON public.vendor_liquidations;
CREATE TRIGGER trg_vendor_liquidation_notifications
    AFTER INSERT OR UPDATE ON public.vendor_liquidations
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_vendor_liquidation_notification();

-- 9.7 Affiliate Commissions, Payout Requests & Coupons Triggers
CREATE OR REPLACE FUNCTION public.fn_trigger_affiliate_events_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF TG_TABLE_NAME = 'affiliate_commissions' THEN
        IF TG_OP = 'INSERT' THEN
            PERFORM public.enqueue_notification_event(
                'affiliate_commission_created',
                'aff_comm_created:' || NEW.id::text,
                jsonb_build_object(
                    'commission_id', NEW.id,
                    'affiliate_id', NEW.affiliate_id,
                    'order_id', NEW.order_id,
                    'amount', NEW.amount,
                    'base_amount', NEW.base_amount,
                    'commission_rate', NEW.commission_rate,
                    'status', NEW.status
                )
            );
        ELSIF TG_OP = 'UPDATE' THEN
            IF NEW.status IS DISTINCT FROM OLD.status OR NEW.amount IS DISTINCT FROM OLD.amount THEN
                PERFORM public.enqueue_notification_event(
                    'affiliate_commission_updated',
                    'aff_comm_updated:' || NEW.id::text || ':' || NEW.status || ':' || COALESCE(NEW.amount::text, '0'),
                    jsonb_build_object(
                        'commission_id', NEW.id,
                        'affiliate_id', NEW.affiliate_id,
                        'order_id', NEW.order_id,
                        'old_status', OLD.status,
                        'status', NEW.status,
                        'old_amount', OLD.amount,
                        'amount', NEW.amount,
                        'refunded_amount', NEW.refunded_amount,
                        'adjustment_amount', NEW.adjustment_amount,
                        'notes', NEW.notes
                    )
                );
            END IF;
        END IF;

    ELSIF TG_TABLE_NAME = 'affiliate_payout_requests' THEN
        IF TG_OP = 'INSERT' THEN
            PERFORM public.enqueue_notification_event(
                'affiliate_payout_requested',
                'aff_payout_req:' || NEW.id::text,
                jsonb_build_object(
                    'payout_request_id', NEW.id,
                    'affiliate_id', NEW.affiliate_id,
                    'amount', NEW.amount,
                    'status', NEW.status
                )
            );
        ELSIF TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
            PERFORM public.enqueue_notification_event(
                'affiliate_payout_paid',
                'aff_payout_paid:' || NEW.id::text,
                jsonb_build_object(
                    'payout_request_id', NEW.id,
                    'affiliate_id', NEW.affiliate_id,
                    'amount', NEW.amount
                )
            );
        END IF;

    ELSIF TG_TABLE_NAME = 'coupons' THEN
        IF TG_OP = 'UPDATE' AND NEW.affiliate_id IS NOT NULL THEN
            IF NEW.is_active = false AND OLD.is_active = true THEN
                PERFORM public.enqueue_notification_event(
                    'affiliate_code_deactivated',
                    'aff_coupon_deactivated:' || NEW.id::text || ':' || extract(epoch from now())::bigint::text,
                    jsonb_build_object(
                        'coupon_id', NEW.id,
                        'affiliate_id', NEW.affiliate_id,
                        'code', NEW.code
                    )
                );
            END IF;
        END IF;

    ELSIF TG_TABLE_NAME = 'affiliates' THEN
        IF TG_OP = 'UPDATE' THEN
            IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('inactive', 'suspended', 'disabled') THEN
                PERFORM public.enqueue_notification_event(
                    'affiliate_code_deactivated',
                    'aff_status_deactivated:' || NEW.id::text || ':' || NEW.status,
                    jsonb_build_object(
                        'affiliate_id', NEW.id,
                        'code', NEW.code,
                        'status', NEW.status
                    )
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enqueue affiliate event notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_affiliate_commissions_notifications ON public.affiliate_commissions;
CREATE TRIGGER trg_affiliate_commissions_notifications
    AFTER INSERT OR UPDATE ON public.affiliate_commissions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_affiliate_events_notification();

DROP TRIGGER IF EXISTS trg_affiliate_payout_requests_notifications ON public.affiliate_payout_requests;
CREATE TRIGGER trg_affiliate_payout_requests_notifications
    AFTER INSERT OR UPDATE ON public.affiliate_payout_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_affiliate_events_notification();

DROP TRIGGER IF EXISTS trg_affiliate_coupons_notifications ON public.coupons;
CREATE TRIGGER trg_affiliate_coupons_notifications
    AFTER UPDATE ON public.coupons
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_affiliate_events_notification();

DROP TRIGGER IF EXISTS trg_affiliates_status_notifications ON public.affiliates;
CREATE TRIGGER trg_affiliates_status_notifications
    AFTER UPDATE ON public.affiliates
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_affiliate_events_notification();

-- 9.8 Product Questions & Answers Triggers (Ensure DB-level guarantee even if client skips)
CREATE OR REPLACE FUNCTION public.fn_trigger_product_question_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF TG_TABLE_NAME = 'product_questions' AND TG_OP = 'INSERT' THEN
        PERFORM public.enqueue_notification_event(
            'product_question_received',
            'question_received:' || NEW.id::text,
            jsonb_build_object(
                'question_id', NEW.id,
                'product_id', NEW.product_id,
                'vendor_id', NEW.vendor_id
            )
        );
    ELSIF TG_TABLE_NAME = 'product_question_answers' AND TG_OP = 'INSERT' THEN
        PERFORM public.enqueue_notification_event(
            'product_question_answered',
            'question_answered:' || NEW.id::text,
            jsonb_build_object(
                'answer_id', NEW.id,
                'question_id', NEW.question_id,
                'vendor_id', NEW.vendor_id
            )
        );
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enqueue product question notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_question_created_notify ON public.product_questions;
CREATE TRIGGER trg_product_question_created_notify
    AFTER INSERT ON public.product_questions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_product_question_events();

DROP TRIGGER IF EXISTS trg_product_question_answered_notify ON public.product_question_answers;
CREATE TRIGGER trg_product_question_answered_notify
    AFTER INSERT ON public.product_question_answers
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_product_question_events();

-- -----------------------------------------------------------------------------
-- 10. SCHEDULE OUTBOX SWEEPER & RETENTION IN PG_CRON
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION collectibles_internal.sweep_notification_outbox()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_req_id bigint := NULL;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.notification_outbox
        WHERE status IN ('queued', 'retrying')
          AND next_retry_at <= clock_timestamp()
          AND attempts < max_attempts
    ) THEN
        SELECT collectibles_internal.invoke_collectibles_worker(
            'notification-dispatcher',
            '{"event_type": "process_outbox", "batch_size": 25}'::jsonb
        ) INTO v_req_id;
    END IF;
    RETURN v_req_id;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-outbox-sweeper') THEN
            PERFORM cron.unschedule('notification-outbox-sweeper');
        END IF;
        PERFORM cron.schedule(
            'notification-outbox-sweeper',
            '*/2 * * * *',
            'SELECT collectibles_internal.sweep_notification_outbox();'
        );
    END IF;
END $$;
