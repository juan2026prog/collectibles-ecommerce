-- Private, bounded operational metadata for the next database incident.
-- Apply only this migration. No business tables, worker schedules or global GUCs change.
-- A missing sample is an observation gap, not proof of an outage: pg_cron itself
-- cannot capture a database that is unable to accept its connection.

DO $guard$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run private database telemetry migration as postgres';
  END IF;
END;
$guard$;

CREATE TABLE collectibles_internal.database_health_samples (
  captured_at timestamptz PRIMARY KEY,
  format_version smallint NOT NULL DEFAULT 1 CHECK (format_version = 1),
  sample jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(sample) = 'object')
);
ALTER TABLE collectibles_internal.database_health_samples OWNER TO postgres;
ALTER TABLE collectibles_internal.database_health_samples ENABLE ROW LEVEL SECURITY;
-- No policies: only the owner/admin can access this table. This schema is not
-- exposed to PostgREST. Explicit revokes also override Supabase default ACLs.
REVOKE ALL ON TABLE collectibles_internal.database_health_samples
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE collectibles_internal.database_health_samples IS
  'Private 5-minute PostgreSQL metadata, approximately 14 days retained; no SQL text, JWTs, user identifiers, request bodies or business rows.';

CREATE FUNCTION collectibles_internal.capture_database_health_sample()
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '250ms'
AS $capture$
DECLARE
  started_at timestamptz := pg_catalog.clock_timestamp();
  activity jsonb;
  locks jsonb;
  database_stats jsonb;
  statement_stats jsonb;
  io_stats jsonb;
  wal_stats jsonb;
  checkpointer_stats jsonb;
  payload jsonb;
BEGIN
  -- Transaction-scoped and nonblocking, also prevents manual/cron overlap.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(1894371, 147014) THEN
    RETURN false;
  END IF;

  WITH activity_rows AS MATERIALIZED (
    SELECT backend_type, state, wait_event_type, wait_event, query_id,
      query_start, xact_start
    FROM pg_catalog.pg_stat_activity
    WHERE pid <> pg_catalog.pg_backend_pid()
  )
  SELECT pg_catalog.jsonb_build_object(
    'backend_count_excluding_sampler', (SELECT count(*) FROM activity_rows),
    'client_connections_excluding_sampler',
      (SELECT count(*) FROM activity_rows WHERE backend_type = 'client backend'),
    'active_client_queries',
      (SELECT count(*) FROM activity_rows WHERE backend_type = 'client backend' AND state = 'active'),
    'active_over_30s',
      (SELECT count(*) FROM activity_rows WHERE state = 'active' AND query_start < started_at - interval '30 seconds'),
    'idle_in_transaction',
      (SELECT count(*) FROM activity_rows WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')),
    'lock_waiters',
      (SELECT count(*) FROM activity_rows WHERE wait_event_type = 'Lock'),
    'oldest_active_query_seconds',
      (SELECT max(extract(epoch FROM started_at - query_start)) FROM activity_rows WHERE state = 'active'),
    'oldest_transaction_seconds',
      (SELECT max(extract(epoch FROM started_at - xact_start)) FROM activity_rows),
    'groups', (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g)), '[]'::jsonb) FROM (
      SELECT backend_type, state, wait_event_type, wait_event, count(*) AS count
      FROM activity_rows GROUP BY backend_type, state, wait_event_type, wait_event
      ORDER BY backend_type, state, wait_event_type, wait_event
    ) g),
    'active_or_idle_transaction_details',
      (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a)), '[]'::jsonb) FROM (
        SELECT backend_type, state, wait_event_type, wait_event, query_id::text AS queryid,
          extract(epoch FROM started_at - query_start)::bigint AS query_age_seconds,
          extract(epoch FROM started_at - xact_start)::bigint AS transaction_age_seconds
        FROM activity_rows
        WHERE state IN ('active', 'idle in transaction', 'idle in transaction (aborted)')
        ORDER BY xact_start NULLS LAST, query_start NULLS LAST
        LIMIT 200
      ) a)
  ) INTO activity;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l)), '[]'::jsonb)
  INTO locks FROM (
    SELECT locktype, mode, granted, count(*) AS count
    FROM pg_catalog.pg_locks
    GROUP BY locktype, mode, granted ORDER BY granted, locktype, mode
  ) l;

  SELECT pg_catalog.jsonb_build_object(
    'numbackends', numbackends, 'xact_commit', xact_commit, 'xact_rollback', xact_rollback,
    'blks_read', blks_read, 'blks_hit', blks_hit,
    'tup_returned', tup_returned, 'tup_fetched', tup_fetched,
    'tup_inserted', tup_inserted, 'tup_updated', tup_updated, 'tup_deleted', tup_deleted,
    'conflicts', conflicts, 'temp_files', temp_files, 'temp_bytes', temp_bytes,
    'deadlocks', deadlocks, 'blk_read_time', blk_read_time, 'blk_write_time', blk_write_time,
    'session_time', session_time, 'active_time', active_time,
    'idle_in_transaction_time', idle_in_transaction_time,
    'sessions', sessions, 'sessions_abandoned', sessions_abandoned,
    'sessions_fatal', sessions_fatal, 'sessions_killed', sessions_killed,
    'stats_reset', stats_reset
  ) INTO database_stats FROM pg_catalog.pg_stat_database
  WHERE datname = pg_catalog.current_database();

  -- showtext=false prevents loading representative SQL text from the extension.
  -- Group across database roles: store normalized query hashes, never usernames/OIDs.
  -- track=top does not expose SQL inside RPCs; aborted executions may not increment
  -- completed-call statistics. These counters cannot replace PostgreSQL error logs.
  BEGIN
    WITH statements AS MATERIALIZED (
      SELECT queryid, toplevel, calls, total_exec_time, mean_exec_time, max_exec_time,
        rows, shared_blks_hit, shared_blks_read, temp_blks_read, temp_blks_written,
        stats_since
      FROM extensions.pg_stat_statements(false)
      WHERE dbid = (SELECT oid FROM pg_catalog.pg_database
                    WHERE datname = pg_catalog.current_database())
    )
    SELECT pg_catalog.jsonb_build_object(
      'track', pg_catalog.current_setting('pg_stat_statements.track', true),
      'info', (SELECT pg_catalog.jsonb_build_object('stats_reset', i.stats_reset, 'dealloc', i.dealloc)
               FROM extensions.pg_stat_statements_info i),
      'totals', (SELECT pg_catalog.jsonb_build_object('forms', count(*), 'calls', sum(calls),
        'exec_ms', sum(total_exec_time), 'shared_blks_hit', sum(shared_blks_hit),
        'shared_blks_read', sum(shared_blks_read), 'temp_blks_written', sum(temp_blks_written))
        FROM statements),
      'top_total', (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s)), '[]'::jsonb) FROM (
        SELECT queryid::text AS queryid, toplevel, sum(calls) AS calls,
          sum(total_exec_time) AS total_exec_ms,
          sum(total_exec_time) / nullif(sum(calls), 0) AS mean_exec_ms,
          max(max_exec_time) AS max_exec_ms,
          sum(rows) AS rows_returned_or_changed,
          sum(shared_blks_hit) AS shared_blks_hit, sum(shared_blks_read) AS shared_blks_read,
          sum(temp_blks_read) AS temp_blks_read, sum(temp_blks_written) AS temp_blks_written,
          min(stats_since) AS earliest_stats_since, max(stats_since) AS latest_stats_since
        FROM statements GROUP BY queryid, toplevel
        ORDER BY sum(total_exec_time) DESC, queryid LIMIT 10
      ) s)
    ) INTO statement_stats;
  EXCEPTION WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
    -- Optional extension must not prevent the core operational sample. Never log
    -- SQLERRM, which can include statement text or values.
    statement_stats := pg_catalog.jsonb_build_object('unavailable_sqlstate', SQLSTATE);
  END;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i)), '[]'::jsonb)
  INTO io_stats FROM (
    SELECT backend_type, object, context, reads, read_time, writes, write_time,
      writebacks, writeback_time, extends, extend_time, hits, evictions, reuses,
      fsyncs, fsync_time, stats_reset
    FROM pg_catalog.pg_stat_io
    WHERE coalesce(reads, 0) + coalesce(writes, 0) + coalesce(extends, 0) +
          coalesce(hits, 0) + coalesce(fsyncs, 0) + coalesce(evictions, 0) > 0
    ORDER BY backend_type, object, context
  ) i;
  SELECT pg_catalog.to_jsonb(w) INTO wal_stats FROM pg_catalog.pg_stat_wal w;
  SELECT pg_catalog.to_jsonb(c) INTO checkpointer_stats FROM pg_catalog.pg_stat_checkpointer c;

  payload := pg_catalog.jsonb_build_object(
    'postmaster_started_at', pg_catalog.pg_postmaster_start_time(),
    'uptime_seconds', extract(epoch FROM started_at - pg_catalog.pg_postmaster_start_time())::bigint,
    'database_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'max_connections', pg_catalog.current_setting('max_connections')::integer,
    'superuser_reserved_connections', pg_catalog.current_setting('superuser_reserved_connections')::integer,
    'track_io_timing', pg_catalog.current_setting('track_io_timing')::boolean,
    'track_wal_io_timing', pg_catalog.current_setting('track_wal_io_timing')::boolean,
    'activity', activity, 'locks', locks, 'database', database_stats,
    'statements', statement_stats, 'io', io_stats, 'wal', wal_stats,
    'checkpointer', checkpointer_stats,
    'collection_ms', extract(epoch FROM pg_catalog.clock_timestamp() - started_at) * 1000
  );

  INSERT INTO collectibles_internal.database_health_samples(captured_at, sample)
  VALUES (started_at, payload);

  -- At most 300 expired rows per run, using the timestamp primary key. SKIP LOCKED
  -- avoids waiting for another administrator. Only this telemetry is deleted.
  WITH expired AS (
    SELECT captured_at FROM collectibles_internal.database_health_samples
    WHERE captured_at < started_at - interval '14 days'
    ORDER BY captured_at LIMIT 300 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM collectibles_internal.database_health_samples s USING expired e
  WHERE s.captured_at = e.captured_at;
  RETURN true;
END;
$capture$;

ALTER FUNCTION collectibles_internal.capture_database_health_sample() OWNER TO postgres;
REVOKE ALL ON FUNCTION collectibles_internal.capture_database_health_sample()
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION collectibles_internal.capture_database_health_sample() IS
  'Admin-only, invoker metadata capture; nonblocking advisory lock, 250ms lock timeout. Returns false on overlap. Dedicated cron session has a 3s statement timeout.';

-- This changes only the new diagnostic job. The timeout is scoped to its dedicated
-- cron connection, not a global setting or any application/worker role.
SELECT cron.schedule(
  'collectibles-database-health-sample',
  '2-57/5 * * * *',
  $job$SET statement_timeout = '3s'; SELECT collectibles_internal.capture_database_health_sample();$job$
);

-- Rollback (admin, explicitly reviewed; preserve/export evidence before removal):
-- SELECT cron.unschedule('collectibles-database-health-sample');
-- DROP FUNCTION collectibles_internal.capture_database_health_sample();
-- DROP TABLE collectibles_internal.database_health_samples;
