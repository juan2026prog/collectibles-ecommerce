-- ══════════════════════════════════════════════════════════════
-- MIGRATION 2: Atomic RPCs for Job & Item Claiming & Finalization
-- Applied Date: 2026-08-03
-- Target: Transactional FOR UPDATE SKIP LOCKED claiming, ownership validation & complete finalization hierarchy
-- ══════════════════════════════════════════════════════════════

-- 1. Atomic Job Claim RPC (Selects ONLY status = 'pending', FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_next_ml_import_job(
    p_worker_id TEXT
)
RETURNS SETOF public.ml_import_jobs AS $$
DECLARE
    v_job_id UUID;
BEGIN
    IF p_worker_id IS NULL OR length(trim(p_worker_id)) = 0 THEN
        RAISE EXCEPTION 'p_worker_id es requerido para reclamar un job.';
    END IF;

    -- Lock and claim 1 PENDING job
    SELECT id INTO v_job_id
    FROM public.ml_import_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.ml_import_jobs
    SET status = 'running',
        locked_by = p_worker_id,
        locked_at = NOW(),
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE id = v_job_id;

    RETURN QUERY
    SELECT * FROM public.ml_import_jobs
    WHERE id = v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.claim_next_ml_import_job(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_ml_import_job(TEXT) TO service_role;

-- 2. Atomic Job Items Claim RPC (Validates worker job ownership first)
CREATE OR REPLACE FUNCTION public.claim_ml_import_items(
    p_job_id UUID,
    p_limit INTEGER,
    p_worker_id TEXT
)
RETURNS SETOF public.ml_import_job_items AS $$
DECLARE
    v_limit INTEGER;
    v_job_owned BOOLEAN;
BEGIN
    IF p_worker_id IS NULL OR length(trim(p_worker_id)) = 0 THEN
        RAISE EXCEPTION 'p_worker_id es requerido para reclamar items.';
    END IF;

    -- Validate worker owns the running job
    SELECT EXISTS (
        SELECT 1 FROM public.ml_import_jobs
        WHERE id = p_job_id
          AND status = 'running'
          AND locked_by = p_worker_id
    ) INTO v_job_owned;

    IF NOT v_job_owned THEN
        RETURN;
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20);

    RETURN QUERY
    WITH target_items AS (
        SELECT id
        FROM public.ml_import_job_items
        WHERE job_id = p_job_id
          AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.ml_import_job_items items
    SET status = 'running',
        locked_by = p_worker_id,
        locked_at = NOW(),
        attempts = COALESCE(items.attempts, 0) + 1
    FROM target_items
    WHERE items.id = target_items.id
    RETURNING items.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.claim_ml_import_items(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ml_import_items(UUID, INTEGER, TEXT) TO service_role;

-- 3. Transactional Finalization & Partial Batch Release RPC (Strict Evaluation Hierarchy)
CREATE OR REPLACE FUNCTION public.finalize_or_release_ml_import_job(
    p_job_id UUID,
    p_worker_id TEXT
)
RETURNS TABLE (
    previous_status TEXT,
    new_status TEXT,
    pending_count INT,
    running_count INT,
    failed_count INT,
    lock_released BOOLEAN,
    finalized BOOLEAN
) AS $$
DECLARE
    v_job public.ml_import_jobs%ROWTYPE;
    v_pending INT := 0;
    v_running INT := 0;
    v_failed INT := 0;
    v_prev_status TEXT;
    v_new_status TEXT;
    v_lock_released BOOLEAN := FALSE;
    v_finalized BOOLEAN := FALSE;
BEGIN
    IF p_worker_id IS NULL OR length(trim(p_worker_id)) = 0 THEN
        RAISE EXCEPTION 'p_worker_id es requerido.';
    END IF;

    SELECT * INTO v_job
    FROM public.ml_import_jobs
    WHERE id = p_job_id
      AND status = 'running'
      AND locked_by = p_worker_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El worker % no posee el lock del job % o no está en running.', p_worker_id, p_job_id;
    END IF;

    v_prev_status := v_job.status;

    SELECT 
        COUNT(*) FILTER (WHERE status = 'pending'),
        COUNT(*) FILTER (WHERE status = 'running'),
        COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_pending, v_running, v_failed
    FROM public.ml_import_job_items
    WHERE job_id = p_job_id;

    -- Strict Decision Hierarchy
    -- A. If running_count > 0: keep running, do not release job lock
    IF v_running > 0 THEN
        v_new_status := 'running';
        v_lock_released := FALSE;
        v_finalized := FALSE;

    -- B. If running_count = 0 AND pending_count > 0: release job back to pending for next batch
    ELSIF v_pending > 0 THEN
        v_new_status := 'pending';
        UPDATE public.ml_import_jobs
        SET status = 'pending',
            locked_by = NULL,
            locked_at = NULL,
            updated_at = NOW()
        WHERE id = p_job_id
          AND status = 'running'
          AND locked_by = p_worker_id;

        v_lock_released := TRUE;
        v_finalized := FALSE;

    -- C. If running_count = 0 AND pending_count = 0: finalize job (completed or partial)
    ELSE
        IF v_failed > 0 THEN
            v_new_status := 'partial';
        ELSE
            v_new_status := 'completed';
        END IF;

        UPDATE public.ml_import_jobs
        SET status = v_new_status,
            completed_at = NOW(),
            locked_by = NULL,
            locked_at = NULL,
            updated_at = NOW()
        WHERE id = p_job_id
          AND status = 'running'
          AND locked_by = p_worker_id;

        v_lock_released := TRUE;
        v_finalized := TRUE;
    END IF;

    RETURN QUERY SELECT 
        v_prev_status, 
        v_new_status, 
        v_pending, 
        v_running, 
        v_failed, 
        v_lock_released, 
        v_finalized;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.finalize_or_release_ml_import_job(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_or_release_ml_import_job(UUID, TEXT) TO service_role;

-- 4. Separate Abandoned Jobs & Items Recovery RPC with 5 Separated Metrics
CREATE OR REPLACE FUNCTION public.recover_abandoned_ml_import_jobs(
    p_timeout_minutes INTEGER DEFAULT 15
)
RETURNS TABLE (
    recovered_items INT,
    failed_items INT,
    requeued_jobs INT,
    finalized_completed_jobs INT,
    finalized_partial_jobs INT
) AS $$
DECLARE
    v_safe_timeout_min INT;
    v_timeout INTERVAL;
    v_rec_items INT := 0;
    v_fail_items INT := 0;
    v_req_jobs INT := 0;
    v_comp_jobs INT := 0;
    v_part_jobs INT := 0;
BEGIN
    -- Clamp timeout (Default: 15 min, Min: 5 min, Max: 120 min)
    v_safe_timeout_min := LEAST(GREATEST(COALESCE(p_timeout_minutes, 15), 5), 120);
    v_timeout := (v_safe_timeout_min || ' minutes')::INTERVAL;

    -- A. Recover abandoned items with attempts < 5
    WITH target_rec_items AS (
        SELECT id
        FROM public.ml_import_job_items
        WHERE status = 'running'
          AND locked_at < NOW() - v_timeout
          AND attempts < 5
        LIMIT 50
        FOR UPDATE SKIP LOCKED
    ),
    upd_rec AS (
        UPDATE public.ml_import_job_items items
        SET status = 'pending',
            locked_by = NULL,
            locked_at = NULL
        FROM target_rec_items
        WHERE items.id = target_rec_items.id
        RETURNING items.id
    )
    SELECT COUNT(*)::INT INTO v_rec_items FROM upd_rec;

    -- B. Mark abandoned items with attempts >= 5 as failed
    WITH target_fail_items AS (
        SELECT id
        FROM public.ml_import_job_items
        WHERE status = 'running'
          AND locked_at < NOW() - v_timeout
          AND attempts >= 5
        LIMIT 50
        FOR UPDATE SKIP LOCKED
    ),
    upd_fail AS (
        UPDATE public.ml_import_job_items items
        SET status = 'failed',
            error_message = 'Excedido máximo de reintentos por abandono de worker',
            locked_by = NULL,
            locked_at = NULL
        FROM target_fail_items
        WHERE items.id = target_fail_items.id
        RETURNING items.id
    )
    SELECT COUNT(*)::INT INTO v_fail_items FROM upd_fail;

    -- C1. Requeue abandoned running jobs that STILL HAVE pending items
    WITH target_req_jobs AS (
        SELECT j.id
        FROM public.ml_import_jobs j
        WHERE j.status = 'running'
          AND j.locked_at < NOW() - v_timeout
          AND EXISTS (
              SELECT 1 FROM public.ml_import_job_items it
              WHERE it.job_id = j.id AND it.status = 'pending'
          )
        LIMIT 10
        FOR UPDATE SKIP LOCKED
    ),
    upd_req AS (
        UPDATE public.ml_import_jobs jobs
        SET status = 'pending',
            locked_by = NULL,
            locked_at = NULL,
            updated_at = NOW()
        FROM target_req_jobs
        WHERE jobs.id = target_req_jobs.id
        RETURNING jobs.id
    )
    SELECT COUNT(*)::INT INTO v_req_jobs FROM upd_req;

    -- C2. Finalize abandoned running jobs that have ZERO pending and ZERO running items, but 0 failed items -> COMPLETED
    WITH target_comp_jobs AS (
        SELECT j.id
        FROM public.ml_import_jobs j
        WHERE j.status = 'running'
          AND j.locked_at < NOW() - v_timeout
          AND NOT EXISTS (
              SELECT 1 FROM public.ml_import_job_items it
              WHERE it.job_id = j.id AND it.status IN ('pending', 'running')
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.ml_import_job_items it
              WHERE it.job_id = j.id AND it.status = 'failed'
          )
        LIMIT 10
        FOR UPDATE SKIP LOCKED
    ),
    upd_comp AS (
        UPDATE public.ml_import_jobs jobs
        SET status = 'completed',
            completed_at = NOW(),
            locked_by = NULL,
            locked_at = NULL,
            updated_at = NOW()
        FROM target_comp_jobs
        WHERE jobs.id = target_comp_jobs.id
        RETURNING jobs.id
    )
    SELECT COUNT(*)::INT INTO v_comp_jobs FROM upd_comp;

    -- C3. Finalize abandoned running jobs that have ZERO pending and ZERO running items, but >0 failed items -> PARTIAL
    WITH target_part_jobs AS (
        SELECT j.id
        FROM public.ml_import_jobs j
        WHERE j.status = 'running'
          AND j.locked_at < NOW() - v_timeout
          AND NOT EXISTS (
              SELECT 1 FROM public.ml_import_job_items it
              WHERE it.job_id = j.id AND it.status IN ('pending', 'running')
          )
          AND EXISTS (
              SELECT 1 FROM public.ml_import_job_items it
              WHERE it.job_id = j.id AND it.status = 'failed'
          )
        LIMIT 10
        FOR UPDATE SKIP LOCKED
    ),
    upd_part AS (
        UPDATE public.ml_import_jobs jobs
        SET status = 'partial',
            completed_at = NOW(),
            locked_by = NULL,
            locked_at = NULL,
            updated_at = NOW()
        FROM target_part_jobs
        WHERE jobs.id = target_part_jobs.id
        RETURNING jobs.id
    )
    SELECT COUNT(*)::INT INTO v_part_jobs FROM upd_part;

    RETURN QUERY SELECT v_rec_items, v_fail_items, v_req_jobs, v_comp_jobs, v_part_jobs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.recover_abandoned_ml_import_jobs(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_abandoned_ml_import_jobs(INTEGER) TO service_role;
