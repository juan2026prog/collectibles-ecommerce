-- ══════════════════════════════════════════════════════════════
-- MIGRATION 1: Add Locking Columns for Transactional Worker Claim
-- Applied Date: 2026-08-03
-- Target: Add locked_by and locked_at columns to ml_import_jobs & ml_import_job_items
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ml_import_jobs 
    ADD COLUMN IF NOT EXISTS locked_by TEXT,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

ALTER TABLE public.ml_import_job_items 
    ADD COLUMN IF NOT EXISTS locked_by TEXT,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ml_import_jobs_locking 
    ON public.ml_import_jobs (status, locked_at);

CREATE INDEX IF NOT EXISTS idx_ml_import_job_items_locking 
    ON public.ml_import_job_items (status, locked_at);
