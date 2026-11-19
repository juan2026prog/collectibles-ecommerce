-- =============================================================================
-- supabase/scripts/bootstrap_empty_db_compat.sql
-- Versioned compatibility guide & pre-flight checks for clean empty-DB replays.
-- DO NOT run against Production (cobtsgkwcftvexaarwmo).
--
-- Known legacy replay blockers (2026-03):
--   1. 20260326000002_storage_schema.sql:8 -> ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY
--      (fails with 42501 on hosted Supabase Branching because storage.objects is owned by supabase_storage_admin).
--   2. 20260327000002_affiliate_system.sql:52 -> duplicate policy "Affiliates can view own commissions"
--      already created in 20260326000001_rls_security_policies.sql:80.
--
-- Recommended clean reconstruction flow for disposable local/branch environments:
--   Step 1: Export schema-only canonical baseline from Production (ZERO PII):
--           supabase db dump --project-ref cobtsgkwcftvexaarwmo --schema public --file baseline_public.sql
--   Step 2: Apply baseline_public.sql to empty disposable Postgres.
--   Step 3: Apply all pending migrations >= 20271119000000_*.sql in lexicographical order.
-- =============================================================================

SELECT
  current_database() AS target_db,
  current_user AS exec_role,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') AS public_table_count;
