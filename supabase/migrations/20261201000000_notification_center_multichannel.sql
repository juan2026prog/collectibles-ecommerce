-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: Multi-Channel Notification Center Schema & Idempotency
-- Migration: 20261201000000_notification_center_multichannel.sql
-- ══════════════════════════════════════════════════════════════

-- 1. Create user_notification_devices table for Push Notifications
CREATE TABLE IF NOT EXISTS public.user_notification_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'onesignal',
    provider_subscription_id text NOT NULL,
    device_name text,
    user_agent text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_device_subscription UNIQUE (user_id, provider_subscription_id)
);

-- 2. Enhance notification_logs table
ALTER TABLE public.notification_logs 
    ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
    ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS provider_message_id text,
    ADD COLUMN IF NOT EXISTS idempotency_key text,
    ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Add unique constraint on idempotency_key if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_notification_logs_idempotency_key'
    ) THEN
        ALTER TABLE public.notification_logs 
            ADD CONSTRAINT uq_notification_logs_idempotency_key UNIQUE (idempotency_key);
    END IF;
END $$;

-- 3. Safely Expire Historical Queued WhatsApp Logs (Prevent historic resend)
UPDATE public.notification_logs 
SET status = 'expired', 
    error_message = COALESCE(error_message, 'Expirado automáticamente antes de la migración al Centro de Notificaciones')
WHERE status = 'queued';

-- 4. Enhance Settings tables to support channel preferences
ALTER TABLE public.vendor_notification_settings
    ADD COLUMN IF NOT EXISTS channel_preferences jsonb DEFAULT '{"push": true, "whatsapp": true, "email": true, "sms": false}'::jsonb;

ALTER TABLE public.admin_notification_settings
    ADD COLUMN IF NOT EXISTS channel_preferences jsonb DEFAULT '{"push": true, "whatsapp": true, "email": true, "sms": false}'::jsonb;

-- 5. Enable Row Level Security (RLS) on user_notification_devices
ALTER TABLE public.user_notification_devices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_notification_devices
DROP POLICY IF EXISTS "Users can view their own notification devices" ON public.user_notification_devices;
CREATE POLICY "Users can view their own notification devices" ON public.user_notification_devices
    FOR SELECT USING (
        auth.uid() = user_id 
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can insert their own notification devices" ON public.user_notification_devices;
CREATE POLICY "Users can insert their own notification devices" ON public.user_notification_devices
    FOR INSERT WITH CHECK (
        auth.uid() = user_id 
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can update their own notification devices" ON public.user_notification_devices;
CREATE POLICY "Users can update their own notification devices" ON public.user_notification_devices
    FOR UPDATE USING (
        auth.uid() = user_id 
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can delete their own notification devices" ON public.user_notification_devices;
CREATE POLICY "Users can delete their own notification devices" ON public.user_notification_devices
    FOR DELETE USING (
        auth.uid() = user_id 
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    );

-- Index for performance on device lookup
CREATE INDEX IF NOT EXISTS idx_user_notification_devices_lookup 
    ON public.user_notification_devices (user_id, active);

CREATE INDEX IF NOT EXISTS idx_user_notification_devices_vendor 
    ON public.user_notification_devices (vendor_id, active);

CREATE INDEX IF NOT EXISTS idx_notification_logs_idempotency 
    ON public.notification_logs (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at 
    ON public.notification_logs (created_at DESC);
