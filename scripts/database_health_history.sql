-- Admin/MCP only. Read safe operational metadata from the private telemetry.
-- Times are UTC timestamps; apply America/Montevideo only when presenting them.
-- No business queries, query text, usernames, request parameters or credentials.

-- Recent observations (12 samples = approximately one hour when cron is healthy).
SELECT captured_at,
  (sample ->> 'uptime_seconds')::bigint AS uptime_seconds,
  (sample #>> '{activity,client_connections_excluding_sampler}')::integer AS client_connections,
  (sample #>> '{activity,backend_count_excluding_sampler}')::integer AS all_backends,
  (sample ->> 'max_connections')::integer AS max_connections,
  (sample #>> '{activity,active_client_queries}')::integer AS active_client_queries,
  (sample #>> '{activity,active_over_30s}')::integer AS active_over_30s,
  (sample #>> '{activity,idle_in_transaction}')::integer AS idle_in_transaction,
  (sample #>> '{activity,lock_waiters}')::integer AS lock_waiters,
  (sample ->> 'collection_ms')::numeric AS metadata_collection_ms,
  (sample ->> 'track_io_timing')::boolean AS track_io_timing,
  sample #> '{activity,groups}' AS state_wait_groups
FROM collectibles_internal.database_health_samples
ORDER BY captured_at DESC LIMIT 12;

-- Missing observations/restarts: a gap is NOT by itself proof the site was down.
-- A blocked scheduler cannot write its own evidence while it cannot connect.
WITH history AS (
  SELECT captured_at, sample,
    lag(captured_at) OVER (ORDER BY captured_at) AS previous_at,
    lag(sample ->> 'postmaster_started_at') OVER (ORDER BY captured_at) AS previous_postmaster
  FROM collectibles_internal.database_health_samples
  WHERE captured_at >= now() - interval '14 days'
)
SELECT captured_at, previous_at,
  extract(epoch FROM captured_at - previous_at)::bigint AS observation_gap_seconds,
  sample ->> 'postmaster_started_at' AS postmaster_started_at,
  previous_postmaster,
  (sample ->> 'postmaster_started_at') IS DISTINCT FROM previous_postmaster AS postmaster_changed
FROM history
WHERE previous_at IS NOT NULL AND (
  captured_at - previous_at > interval '450 seconds' OR
  (sample ->> 'postmaster_started_at') IS DISTINCT FROM previous_postmaster
)
ORDER BY captured_at DESC LIMIT 24;

-- Top-query deltas between the last two observations, only for hashes present in
-- both top-10 sets. A newly ranked hash has no comparable previous sample.
-- Reset/eviction/role aggregation changes invalidate deltas; never invent a zero.
-- Rows are returned/changed rows, not rows examined. Timed-out operations may not
-- increment completed-call counters. track=top omits SQL inside RPC bodies.
WITH recent AS (
  SELECT captured_at, sample,
    row_number() OVER (ORDER BY captured_at DESC) AS position
  FROM collectibles_internal.database_health_samples
  ORDER BY captured_at DESC LIMIT 2
), hashes AS (
  SELECT r.captured_at, r.sample, r.position, q.value AS query_stats
  FROM recent r
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.sample #> '{statements,top_total}', '[]'::jsonb)) q
), compared AS (
  SELECT current.captured_at, previous.captured_at AS previous_at,
    current.query_stats ->> 'queryid' AS queryid,
    (current.query_stats ->> 'toplevel')::boolean AS toplevel,
    (current.query_stats ->> 'calls')::numeric - (previous.query_stats ->> 'calls')::numeric AS calls_delta,
    (current.query_stats ->> 'total_exec_ms')::numeric - (previous.query_stats ->> 'total_exec_ms')::numeric AS exec_ms_delta,
    (current.query_stats ->> 'shared_blks_read')::numeric - (previous.query_stats ->> 'shared_blks_read')::numeric AS shared_reads_delta,
    (current.query_stats ->> 'shared_blks_hit')::numeric - (previous.query_stats ->> 'shared_blks_hit')::numeric AS shared_hits_delta,
    previous.query_stats IS NOT NULL
      AND (current.sample ->> 'postmaster_started_at') = (previous.sample ->> 'postmaster_started_at')
      AND (current.sample #>> '{statements,info,stats_reset}') = (previous.sample #>> '{statements,info,stats_reset}')
      AND (current.sample #>> '{statements,info,dealloc}') = (previous.sample #>> '{statements,info,dealloc}')
      AND (current.query_stats ->> 'earliest_stats_since') = (previous.query_stats ->> 'earliest_stats_since')
      AND (current.query_stats ->> 'latest_stats_since') = (previous.query_stats ->> 'latest_stats_since')
      AND (current.query_stats ->> 'calls')::numeric >= (previous.query_stats ->> 'calls')::numeric
      AND (current.query_stats ->> 'total_exec_ms')::numeric >= (previous.query_stats ->> 'total_exec_ms')::numeric
      AND (current.query_stats ->> 'shared_blks_read')::numeric >= (previous.query_stats ->> 'shared_blks_read')::numeric
      AND (current.query_stats ->> 'shared_blks_hit')::numeric >= (previous.query_stats ->> 'shared_blks_hit')::numeric
      AS comparable
  FROM hashes current LEFT JOIN hashes previous
    ON previous.position = 2
    AND previous.query_stats ->> 'queryid' = current.query_stats ->> 'queryid'
    AND previous.query_stats ->> 'toplevel' = current.query_stats ->> 'toplevel'
  WHERE current.position = 1
)
SELECT captured_at, previous_at, queryid, toplevel, comparable,
  CASE WHEN comparable THEN calls_delta END AS completed_calls,
  CASE WHEN comparable THEN exec_ms_delta END AS completed_exec_ms,
  CASE WHEN comparable AND calls_delta > 0 THEN exec_ms_delta / calls_delta END AS interval_mean_ms,
  CASE WHEN comparable THEN shared_reads_delta END AS shared_blocks_read,
  CASE WHEN comparable THEN shared_hits_delta END AS shared_blocks_hit
FROM compared ORDER BY CASE WHEN comparable THEN exec_ms_delta END DESC NULLS LAST, queryid;

-- Security verification without exposing function source or any telemetry data.
SELECT c.relowner = (SELECT oid FROM pg_roles WHERE rolname = 'postgres') AS postgres_table_owner,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS policies,
  has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') AS anon_table_access,
  has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') AS authenticated_table_access,
  has_table_privilege('service_role', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') AS service_table_access,
  p.proowner = (SELECT oid FROM pg_roles WHERE rolname = 'postgres') AS postgres_function_owner,
  NOT p.prosecdef AS security_invoker,
  p.proconfig AS function_local_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.pronamespace = n.oid AND p.proname = 'capture_database_health_sample'
WHERE n.nspname = 'collectibles_internal' AND c.relname = 'database_health_samples';
