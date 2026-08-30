-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: Email Recipients Configuration (Max 3)
-- Migration: 20261202000000_email_recipients_notification_settings.sql
-- ══════════════════════════════════════════════════════════════

-- 1. Add email_recipients column to admin_notification_settings
ALTER TABLE public.admin_notification_settings
    ADD COLUMN IF NOT EXISTS email_recipients jsonb DEFAULT '[]'::jsonb;

-- 2. Add email_recipients column to vendor_notification_settings
ALTER TABLE public.vendor_notification_settings
    ADD COLUMN IF NOT EXISTS email_recipients jsonb DEFAULT '[]'::jsonb;

-- 3. Update existing admin_notification_settings singleton if empty
UPDATE public.admin_notification_settings
SET email_recipients = '[{"id":"admin-default-1","name":"Administración","email":"admin@collectibles.uy","active":true}]'::jsonb
WHERE email_recipients IS NULL OR email_recipients = '[]'::jsonb;
