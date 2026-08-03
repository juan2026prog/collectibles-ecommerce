-- ══════════════════════════════════════════════════════════════
-- MIGRATION 3: Cron Stabilization, Kill Switch & Vault Wrappers
-- Applied Date: 2026-08-03
-- Target: Kill switch initialization & secret-free Vault cron wrapper scheduling
-- ══════════════════════════════════════════════════════════════

-- 1. Initialize Emergency Kill Switch in site_settings (Starts as 'true' - PAUSED)
INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('ml_sync_paused', 'true', NOW())
ON CONFLICT (key) DO UPDATE 
SET value = 'true', updated_at = NOW();

-- 2. Supabase Vault-Backed Wrapper Functions for Cron Invocation (NO hardcoded secrets)
CREATE OR REPLACE FUNCTION public.invoke_ml_import_worker_cron()
RETURNS void AS $$
DECLARE
    v_secret TEXT;
    v_url TEXT;
BEGIN
    -- Read secret dynamically from Supabase Vault
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'ml_worker_secret'
    LIMIT 1;

    IF v_secret IS NULL THEN
        RAISE NOTICE 'Vault secret ml_worker_secret no configurado.';
        RETURN;
    END IF;

    v_url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/ml-import-worker';

    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-test-bypass', v_secret
        ),
        body := '{"action": "process_queue"}'::jsonb
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, pg_temp;

REVOKE EXECUTE ON FUNCTION public.invoke_ml_import_worker_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_ml_import_worker_cron() TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_zinc_sync_worker_cron()
RETURNS void AS $$
DECLARE
    v_secret TEXT;
    v_url TEXT;
BEGIN
    -- Read secret dynamically from Supabase Vault
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'zinc_worker_secret'
    LIMIT 1;

    IF v_secret IS NULL THEN
        RAISE NOTICE 'Vault secret zinc_worker_secret no configurado.';
        RETURN;
    END IF;

    v_url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-sync-published-products';

    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-zinc-sync-bypass', v_secret
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, pg_temp;

REVOKE EXECUTE ON FUNCTION public.invoke_zinc_sync_worker_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_zinc_sync_worker_cron() TO service_role;

-- 3. Safe Cron Job Rescheduling using Wrapper Functions (NO cron.unschedule, active = false)
DO $$
DECLARE
    v_ml_jobid bigint;
    v_ml_count int;
    v_zinc_jobid bigint;
    v_zinc_count int;
BEGIN
    -- A. ML Import Queue Worker Reschedule to 15m (PAUSED)
    SELECT count(*), max(jobid) INTO v_ml_count, v_ml_jobid
    FROM cron.job
    WHERE jobname = 'ml-import-queue-process';

    IF v_ml_count > 1 THEN
        RAISE EXCEPTION 'ALERTA SEGURIDAD: Se detectaron % jobs duplicados para ml-import-queue-process.', v_ml_count;
    ELSIF v_ml_count = 1 THEN
        PERFORM cron.alter_job(
            job_id := v_ml_jobid, 
            schedule := '*/15 * * * *', 
            command := 'SELECT public.invoke_ml_import_worker_cron();', 
            active := false
        );
        RAISE NOTICE 'Job ml-import-queue-process (ID %) actualizado a Vault wrapper y paused (active = false).', v_ml_jobid;
    ELSE
        RAISE NOTICE 'Job ml-import-queue-process no encontrado en cron.job.';
    END IF;

    -- B. Zinc Sync Published Products Reschedule to 30m (PAUSED)
    SELECT count(*), max(jobid) INTO v_zinc_count, v_zinc_jobid
    FROM cron.job
    WHERE jobname = 'zinc-sync-published-products-job';

    IF v_zinc_count > 1 THEN
        RAISE EXCEPTION 'ALERTA SEGURIDAD: Se detectaron % jobs duplicados para zinc-sync-published-products-job.', v_zinc_count;
    ELSIF v_zinc_count = 1 THEN
        PERFORM cron.alter_job(
            job_id := v_zinc_jobid, 
            schedule := '*/30 * * * *', 
            command := 'SELECT public.invoke_zinc_sync_worker_cron();', 
            active := false
        );
        RAISE NOTICE 'Job zinc-sync-published-products-job (ID %) actualizado a Vault wrapper y paused (active = false).', v_zinc_jobid;
    ELSE
        RAISE NOTICE 'Job zinc-sync-published-products-job no encontrado en cron.job.';
    END IF;
END $$;
