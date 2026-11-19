-- =============================================================================
-- Migration: 20271119000400_p4_postgres_indexes_and_cron_hygiene.sql
-- Purpose (P4 — PostgreSQL Hot-Path Indexing & Cron Hygiene):
--   1. Create 9 selective, non-destructive indexes on hot transactional foreign
--      keys identified by Supabase Production Performance Advisors
--      (orders, shipments, order_suborders, order_items, payment_attempts,
--      refunds, unified_order_requests).
--   2. Safely disable the obsolete `smart-wishlist-cron` pg_cron job (which
--      currently runs 42 times/week only logging placeholder `https://tu-tienda.com/...`).
--   3. Guarded by table/column/schema checks so it replays cleanly across
--      Production, Staging, and fresh isolated branches.
--
-- Rollback Plan (non-destructive):
--   Indexes can be dropped individually via `DROP INDEX IF EXISTS ...`;
--   `smart-wishlist-cron` can be re-enabled via `cron.alter_job(id, active => true)`.
-- =============================================================================

DO $$
BEGIN
  -- 1. shipments(order_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'order_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON public.shipments (order_id)';
  END IF;

  -- 2. shipments(suborder_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipments' AND column_name = 'suborder_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shipments_suborder_id ON public.shipments (suborder_id) WHERE suborder_id IS NOT NULL';
  END IF;

  -- 3. orders(last_payment_attempt_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'last_payment_attempt_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_last_payment_attempt_id ON public.orders (last_payment_attempt_id) WHERE last_payment_attempt_id IS NOT NULL';
  END IF;

  -- 4. payment_attempts(user_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_attempts' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_attempts_user_id ON public.payment_attempts (user_id) WHERE user_id IS NOT NULL';
  END IF;

  -- 5. order_suborders(vendor_store_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_suborders' AND column_name = 'vendor_store_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_order_suborders_vendor_store_id ON public.order_suborders (vendor_store_id)';
  END IF;

  -- 6. order_items(vendor_store_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'vendor_store_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_order_items_vendor_store_id ON public.order_items (vendor_store_id) WHERE vendor_store_id IS NOT NULL';
  END IF;

  -- 7. refunds(suborder_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'refunds' AND column_name = 'suborder_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_refunds_suborder_id ON public.refunds (suborder_id) WHERE suborder_id IS NOT NULL';
  END IF;

  -- 8. unified_order_requests(order_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'unified_order_requests' AND column_name = 'order_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_unified_order_requests_order_id ON public.unified_order_requests (order_id) WHERE order_id IS NOT NULL';
  END IF;

  -- 9. unified_order_requests(customer_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'unified_order_requests' AND column_name = 'customer_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_unified_order_requests_customer_id ON public.unified_order_requests (customer_id) WHERE customer_id IS NOT NULL';
  END IF;
END
$$;

-- Safely disable obsolete `smart-wishlist-cron` (only logs placeholder https://tu-tienda.com/...)
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'cron' AND table_name = 'job'
  ) THEN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'smart-wishlist-cron' AND active = true
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.alter_job(v_job_id, active => false);
    END IF;
  END IF;
END
$$;
