-- ============================================================================
-- SCRIPT DE PAUSA DE EMERGENCIA: ZINC SYNC WORKER CRON
-- PROYECTO: Collectibles2026 (https://collectibles.uy)
-- ============================================================================

-- 1. Estado inicial del job zinc-sync-published-products-job
SELECT 
    jobid, 
    jobname, 
    schedule, 
    active, 
    command 
FROM cron.job 
WHERE jobname = 'zinc-sync-published-products-job';

-- 2. Desactivación exclusiva usando cron.alter_job si el job existe
DO $$
DECLARE
    v_jobid bigint;
BEGIN
    SELECT jobid INTO v_jobid 
    FROM cron.job 
    WHERE jobname = 'zinc-sync-published-products-job';

    IF v_jobid IS NOT NULL THEN
        PERFORM cron.alter_job(job_id := v_jobid, active := false);
    END IF;
END $$;

-- 3. Estado final del job tras desactivación
SELECT 
    jobid, 
    jobname, 
    schedule, 
    active, 
    command 
FROM cron.job 
WHERE jobname = 'zinc-sync-published-products-job';

-- ============================================================================
-- INSTRUCCIONES DE REACTIVACIÓN (SQL PARA REACTIVAR EL CRON JOB):
--
-- SELECT cron.alter_job(
--     job_id := (SELECT jobid FROM cron.job WHERE jobname = 'zinc-sync-published-products-job'), 
--     active := true
-- );
-- ============================================================================
