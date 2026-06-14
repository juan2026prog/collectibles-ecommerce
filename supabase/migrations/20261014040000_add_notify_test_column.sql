-- Migration: Add notify_test column to vendor_notification_settings
-- Date: 2026-06-14

ALTER TABLE public.vendor_notification_settings 
ADD COLUMN IF NOT EXISTS notify_test boolean DEFAULT false;
