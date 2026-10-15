-- Availability remediation. Apply this file explicitly; do not replay unrelated historical migrations.
SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS collectibles_internal;
REVOKE ALL ON SCHEMA collectibles_internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA collectibles_internal TO service_role;

CREATE TABLE IF NOT EXISTS collectibles_internal.worker_leases (
  worker text PRIMARY KEY,
  owner uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE collectibles_internal.worker_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON collectibles_internal.worker_leases FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_worker_lease(p_worker text, p_owner uuid, p_seconds integer DEFAULT 600)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE claimed uuid;
BEGIN
  IF p_worker NOT IN ('ml-import-worker','campaign-runner','abandoned-carts-cron',
    'smart-wishlist-cron','zinc-sync-published-products','zinc-sync-order-tracking') THEN
    RAISE EXCEPTION 'Invalid worker';
  END IF;
  IF p_owner IS NULL THEN RETURN false; END IF;
  INSERT INTO collectibles_internal.worker_leases(worker, owner, expires_at)
  VALUES (p_worker, p_owner, clock_timestamp() + make_interval(secs => least(greatest(p_seconds,60),600)))
  ON CONFLICT (worker) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
  WHERE collectibles_internal.worker_leases.expires_at < clock_timestamp()
  RETURNING owner INTO claimed;
  RETURN claimed IS NOT NULL AND claimed = p_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_worker_lease(p_worker text, p_owner uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM collectibles_internal.worker_leases WHERE worker = p_worker AND owner = p_owner;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'collectibles_cron_secret') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'collectibles_cron_secret', 'Internal worker authentication; never include in cron command text');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_internal_cron_secret(p_secret text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT length(p_secret) BETWEEN 32 AND 256 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'collectibles_cron_secret' AND decrypted_secret = p_secret
  );
$$;

REVOKE ALL ON FUNCTION public.claim_worker_lease(text,uuid,integer),
  public.release_worker_lease(text,uuid),public.verify_internal_cron_secret(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_worker_lease(text,uuid,integer),
  public.release_worker_lease(text,uuid),public.verify_internal_cron_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION collectibles_internal.invoke_collectibles_worker(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE secret text; request_id bigint;
BEGIN
  IF p_function NOT IN ('ml-import-worker','campaign-runner','abandoned-carts-cron',
    'smart-wishlist-cron','zinc-sync-published-products','zinc-sync-order-tracking') THEN
    RAISE EXCEPTION 'Invalid worker';
  END IF;
  SELECT decrypted_secret INTO STRICT secret FROM vault.decrypted_secrets WHERE name = 'collectibles_cron_secret';
  SELECT net.http_post(
    url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type','application/json','x-collectibles-cron-secret',secret),
    body := p_body, timeout_milliseconds := 60000
  ) INTO request_id;
  RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION collectibles_internal.invoke_collectibles_worker(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION collectibles_internal.invoke_collectibles_worker(text,jsonb) TO service_role;

-- Preserve inactive jobs and business payloads where applicable; only known worker schedules change.
DO $$
DECLARE job record; target text; schedule text; body jsonb;
BEGIN
  FOR job IN SELECT jobid, jobname, command FROM cron.job LOOP
    target := substring(job.command from '/functions/v1/([a-z0-9-]+)');
    IF job.jobname = 'ml-import-queue-process' THEN target := 'ml-import-worker'; END IF;
    IF job.jobname = 'zinc-sync-published-products-job' THEN target := 'zinc-sync-published-products'; END IF;
    schedule := CASE target
      WHEN 'ml-import-worker' THEN '2-59/15 * * * *'
      WHEN 'campaign-runner' THEN '4-59/5 * * * *'
      WHEN 'abandoned-carts-cron' THEN '6-59/15 * * * *'
      WHEN 'smart-wishlist-cron' THEN '8-59/30 * * * *'
      WHEN 'zinc-sync-published-products' THEN '11-59/30 * * * *'
      WHEN 'zinc-sync-order-tracking' THEN '13-59/15 * * * *'
      ELSE NULL END;
    IF schedule IS NOT NULL THEN
      body := CASE WHEN target = 'ml-import-worker' THEN '{"action":"process_queue"}'::jsonb ELSE '{}'::jsonb END;
      PERFORM cron.alter_job(job_id := job.jobid, schedule := schedule,
        command := format('SELECT collectibles_internal.invoke_collectibles_worker(%L, %L::jsonb);', target, body::text));
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.invoke_ml_import_worker_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM collectibles_internal.invoke_collectibles_worker('ml-import-worker','{"action":"process_queue"}'::jsonb); END;
$$;
CREATE OR REPLACE FUNCTION public.invoke_zinc_sync_worker_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM collectibles_internal.invoke_collectibles_worker('zinc-sync-published-products'); END;
$$;
REVOKE ALL ON FUNCTION public.invoke_ml_import_worker_cron(),public.invoke_zinc_sync_worker_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_ml_import_worker_cron(),public.invoke_zinc_sync_worker_cron() TO service_role;

-- Restrict maintenance RPCs even when an earlier migration granted named roles explicitly.
DO $$ DECLARE fn regprocedure; BEGIN
  FOREACH fn IN ARRAY ARRAY[
    to_regprocedure('public.cleanup_old_audit_logs(integer,integer)'),
    to_regprocedure('public.cleanup_expired_operational_data()')
  ] LOOP
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
    END IF;
  END LOOP;
END $$;

ALTER VIEW public.licenses_with_counts SET (security_invoker = true);
ALTER VIEW public.themes_with_counts SET (security_invoker = true);

-- Preserve policy expressions and roles; hoist only the request-invariant auth.uid() value.
DO $$
DECLARE policy record; using_expr text; check_expr text; sql text;
BEGIN
  FOR policy IN SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename IN
    ('products','product_images','product_variants','product_categories','categories','brands','licenses','themes',
     'international_products','stock_reservations','ml_sync_queue','international_import_candidates') LOOP
    using_expr := policy.qual; check_expr := policy.with_check;
    IF using_expr IS NOT NULL AND using_expr !~* 'select\s+auth[.]uid' THEN
      using_expr := regexp_replace(using_expr,'auth[.]uid\(\)','(SELECT auth.uid())','g');
    END IF;
    IF check_expr IS NOT NULL AND check_expr !~* 'select\s+auth[.]uid' THEN
      check_expr := regexp_replace(check_expr,'auth[.]uid\(\)','(SELECT auth.uid())','g');
    END IF;
    IF using_expr IS DISTINCT FROM policy.qual OR check_expr IS DISTINCT FROM policy.with_check THEN
      sql := format('ALTER POLICY %I ON %I.%I',policy.policyname,policy.schemaname,policy.tablename);
      IF using_expr IS NOT NULL THEN sql := sql || ' USING (' || using_expr || ')'; END IF;
      IF check_expr IS NOT NULL THEN sql := sql || ' WITH CHECK (' || check_expr || ')'; END IF;
      EXECUTE sql;
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_vendor_store_id ON public.products(vendor_store_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_order_id ON public.stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_variant_id ON public.stock_reservations(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status_reserved ON public.stock_reservations(status,reserved_until);
CREATE INDEX IF NOT EXISTS idx_ml_sync_queue_product_id ON public.ml_sync_queue(product_id);
CREATE INDEX IF NOT EXISTS idx_ml_sync_queue_variant_id ON public.ml_sync_queue(variant_id);
CREATE INDEX IF NOT EXISTS idx_international_import_candidates_search_id ON public.international_import_candidates(search_id);
CREATE INDEX IF NOT EXISTS idx_international_tracking_next_attempt ON public.international_order_items(last_zinc_status_check_at NULLS FIRST)
  WHERE zinc_order_id IS NOT NULL AND purchase_status IN ('zinc_order_created','zinc_processing','purchased','shipped_to_courier');

-- Remove only proven identical, non-constraint indexes. Keep the second index in each pair.
DO $$
DECLARE pair text[]; old_oid oid; keep_oid oid; identical boolean;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['idx_audit_log_user','idx_audit_log_user_id'],
    ARRAY['idx_cart_items_user','idx_cart_items_user_id'],
    ARRAY['idx_reviews_product','idx_reviews_product_id'],
    ARRAY['idx_video_requests_customer','idx_video_requests_customer_id'],
    ARRAY['idx_wishlists_user','idx_wishlists_user_id'],
    ARRAY['idx_zinc_wh_order_id','idx_zinc_webhook_events_order_id']
  ] LOOP
    old_oid := to_regclass('public.' || pair[1]); keep_oid := to_regclass('public.' || pair[2]);
    IF old_oid IS NULL OR keep_oid IS NULL THEN CONTINUE; END IF;
    SELECT a.indrelid=b.indrelid AND a.indkey=b.indkey AND a.indclass=b.indclass
      AND a.indcollation=b.indcollation AND a.indoption=b.indoption
      AND a.indisunique=b.indisunique AND a.indnkeyatts=b.indnkeyatts
      AND ca.relam=cb.relam AND a.indisvalid AND b.indisvalid
      AND a.indexprs::text IS NOT DISTINCT FROM b.indexprs::text
      AND a.indpred::text IS NOT DISTINCT FROM b.indpred::text
    INTO identical FROM pg_index a JOIN pg_index b ON b.indexrelid=keep_oid
      JOIN pg_class ca ON ca.oid=a.indexrelid JOIN pg_class cb ON cb.oid=b.indexrelid
    WHERE a.indexrelid=old_oid;
    IF identical AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conindid=old_oid) THEN
      EXECUTE format('DROP INDEX %s',old_oid::regclass);
    END IF;
  END LOOP;
END $$;

-- Bounded retention of temporary/operational data; orders, payments and audit records are untouched.
CREATE OR REPLACE FUNCTION collectibles_internal.cleanup_operational_history()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF to_regclass('public.sourcing_market_cache') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='sourcing_market_cache' AND column_name='expires_at'
  ) THEN
    EXECUTE $q$DELETE FROM public.sourcing_market_cache WHERE ctid IN (
      SELECT ctid FROM public.sourcing_market_cache WHERE expires_at < now() - interval '7 days'
      LIMIT 200 FOR UPDATE SKIP LOCKED)$q$;
  END IF;
  DELETE FROM public.international_product_sync_logs WHERE ctid IN (
    SELECT ctid FROM public.international_product_sync_logs WHERE created_at < now() - interval '90 days'
    LIMIT 200 FOR UPDATE SKIP LOCKED);
  DELETE FROM cron.job_run_details WHERE ctid IN (
    SELECT ctid FROM cron.job_run_details WHERE end_time < now() - interval '30 days'
    LIMIT 500 FOR UPDATE SKIP LOCKED);
END;
$$;
REVOKE ALL ON FUNCTION collectibles_internal.cleanup_operational_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION collectibles_internal.cleanup_operational_history() TO service_role;
SELECT cron.schedule('collectibles-operational-retention','23 4 * * *',
  'SELECT collectibles_internal.cleanup_operational_history();');

RESET statement_timeout;
RESET lock_timeout;
