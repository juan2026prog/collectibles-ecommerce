-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Automation & Settings Configuration
-- Applied: 2026-07-29
-- ══════════════════════════════════════════════════════════════

-- 1. Insert initial kill switch setting
INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('ml_webhooks_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;

-- 2. Safely remove existing cron jobs if they exist to prevent duplicates
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ml-webhook-sweep') THEN
        PERFORM cron.unschedule('ml-webhook-sweep');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ml-sync-queue-process') THEN
        PERFORM cron.unschedule('ml-sync-queue-process');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ml-oauth-token-check') THEN
        PERFORM cron.unschedule('ml-oauth-token-check');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ml-stock-audit') THEN
        PERFORM cron.unschedule('ml-stock-audit');
    END IF;
END $$;

-- 3. Schedule cron jobs using pg_net http_post

-- A. Sweep webhooks every 15 minutes
SELECT cron.schedule(
    'ml-webhook-sweep',
    '*/15 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadolibre-webhook',
        headers := '{"Content-Type": "application/json", "x-test-bypass": "collectibles-ml-test-secret"}'::jsonb,
        body := '{"action": "sweep"}'::jsonb
    );
    $$
);

-- B. Process sync queue every 5 minutes
SELECT cron.schedule(
    'ml-sync-queue-process',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadolibre-sync',
        headers := '{"Content-Type": "application/json", "x-test-bypass": "collectibles-ml-test-secret"}'::jsonb,
        body := '{"action": "process_sync_queue"}'::jsonb
    );
    $$
);

-- C. Check OAuth tokens daily at 1:00 AM UTC
SELECT cron.schedule(
    'ml-oauth-token-check',
    '0 1 * * *',
    $$
    SELECT net.http_post(
        url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadolibre-sync',
        headers := '{"Content-Type": "application/json", "x-test-bypass": "collectibles-ml-test-secret"}'::jsonb,
        body := '{"action": "check_oauth_tokens"}'::jsonb
    );
    $$
);

-- D. Audit stock daily at 3:00 AM UTC
SELECT cron.schedule(
    'ml-stock-audit',
    '0 3 * * *',
    $$
    SELECT net.http_post(
        url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mercadolibre-sync',
        headers := '{"Content-Type": "application/json", "x-test-bypass": "collectibles-ml-test-secret"}'::jsonb,
        body := '{"action": "stock_audit"}'::jsonb
    );
    $$
);
