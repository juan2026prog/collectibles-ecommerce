-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: Admin Marketplace Daily Summary Server-Side Cron
-- Migration: 20261220000000_admin_daily_summary_cron.sql
-- ══════════════════════════════════════════════════════════════

-- 1. Create SQL wrapper function to invoke admin-daily-summary-cron Edge Function
CREATE OR REPLACE FUNCTION public.invoke_admin_daily_summary_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_service_key text;
    v_supabase_url text;
BEGIN
    SELECT value INTO v_supabase_url FROM public.site_settings WHERE key = 'supabase_url';
    IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
        v_supabase_url := 'https://cobtsgkwcftvexaarwmo.supabase.co';
    END IF;

    PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/admin-daily-summary-cron',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('request.jwt.claim.sub', true)
        ),
        body := '{}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to invoke admin-daily-summary-cron: %', SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invoke_admin_daily_summary_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_admin_daily_summary_cron() TO service_role;

-- 2. Schedule pg_cron job at 22:00 America/Montevideo (01:00 UTC)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin-marketplace-daily-summary-22pm') THEN
            PERFORM cron.unschedule('admin-marketplace-daily-summary-22pm');
        END IF;

        -- 01:00 UTC = 22:00 America/Montevideo (UTC-3)
        PERFORM cron.schedule(
            'admin-marketplace-daily-summary-22pm',
            '0 1 * * *',
            'SELECT public.invoke_admin_daily_summary_cron();'
        );
    END IF;
END $$;
