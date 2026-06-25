-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Import Queue Adjustments
-- Applied: 2026-10-20
-- ══════════════════════════════════════════════════════════════

-- 1. Drop existing constraint
ALTER TABLE public.ml_import_jobs DROP CONSTRAINT IF EXISTS ml_import_jobs_status_check;

-- 2. Add new constraint including 'fetching_ids'
ALTER TABLE public.ml_import_jobs ADD CONSTRAINT ml_import_jobs_status_check 
    CHECK (status IN ('fetching_ids', 'pending', 'running', 'completed', 'partial', 'failed', 'cancelled', 'paused'));

-- 3. Add next_run_at column to ml_import_jobs
ALTER TABLE public.ml_import_jobs ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

-- 4. Add http_status column to ml_import_job_items
ALTER TABLE public.ml_import_job_items ADD COLUMN IF NOT EXISTS http_status INTEGER;

-- 5. Create atomic claiming function with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_import_job_items(p_job_id UUID, p_limit INT)
RETURNS TABLE (
  id UUID,
  job_id UUID,
  vendor_id UUID,
  ml_item_id TEXT,
  attempts INTEGER
) AS $$
DECLARE
  v_item_ids UUID[];
BEGIN
  -- Select the items using FOR UPDATE SKIP LOCKED
  SELECT array_agg(item_id) INTO v_item_ids
  FROM (
    SELECT i.id AS item_id
    FROM public.ml_import_job_items i
    WHERE i.job_id = p_job_id
      AND i.status IN ('pending', 'failed')
      AND i.attempts < 3
    ORDER BY i.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) sub;

  -- Update their status to 'running'
  IF v_item_ids IS NOT NULL AND array_length(v_item_ids, 1) > 0 THEN
    UPDATE public.ml_import_job_items
    SET status = 'running'
    WHERE ml_import_job_items.id = ANY(v_item_ids);

    -- Return the updated items
    RETURN QUERY
    SELECT i.id, i.job_id, i.vendor_id, i.ml_item_id, i.attempts
    FROM public.ml_import_job_items i
    WHERE i.id = ANY(v_item_ids);
  END IF;
END;
$$ LANGUAGE plpgsql;
