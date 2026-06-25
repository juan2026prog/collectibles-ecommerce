-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Multivendor Import Metrics Columns
-- Applied: 2026-10-20
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ml_import_jobs 
    ADD COLUMN IF NOT EXISTS items_per_minute INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estimated_finish_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_processed_at TIMESTAMPTZ;
