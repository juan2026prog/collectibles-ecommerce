-- Run via the Supabase SQL connector. Only aggregate operational metadata.
-- Never select query text, job commands, request headers, tokens or customer data.
select jsonb_build_object(
  'checked_at', now(),
  'uptime_seconds', extract(epoch from now() - pg_postmaster_start_time())::bigint,
  'connections', (select count(*) from pg_stat_activity),
  'max_connections', current_setting('max_connections')::int,
  'active_queries', (select count(*) from pg_stat_activity where state = 'active' and pid <> pg_backend_pid()),
  'active_over_30s', (select count(*) from pg_stat_activity where state = 'active' and pid <> pg_backend_pid() and query_start < now() - interval '30 seconds'),
  'lock_waiters', (select count(*) from pg_stat_activity where wait_event_type = 'Lock'),
  'idle_in_transaction', (select count(*) from pg_stat_activity where state = 'idle in transaction'),
  'database_bytes', pg_database_size(current_database()),
  'waits_now', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select backend_type, state, wait_event_type, wait_event, count(*) as connections
    from pg_stat_activity where pid <> pg_backend_pid()
    group by backend_type,state,wait_event_type,wait_event
    order by backend_type,state,wait_event_type,wait_event
  ) t),
  'postgres_stats_reset', (select stats_reset from pg_stat_database where datname=current_database()),
  'latest_private_history', (select jsonb_build_object(
    'captured_at',captured_at,'collection_ms',sample->'collection_ms',
    'activity',sample->'activity','max_connections',sample->'max_connections',
    'database',sample->'database','statements',sample->'statements')
    from collectibles_internal.database_health_samples order by captured_at desc limit 1),
  'history_last_hour', (select jsonb_build_object('samples',count(*),'first_at',min(captured_at),
    'last_at',max(captured_at)) from collectibles_internal.database_health_samples
    where captured_at>now()-interval '1 hour'),
  'cron_startup_last_24h', (select jsonb_build_object('count',count(*),'latest_at',max(start_time))
    from cron.job_run_details where start_time>now()-interval '24 hours'
    and return_message='job startup timeout'),
  'cron_last_hour', (
    select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select j.jobname, r.status, count(*) as runs,
        count(*) filter (where r.return_message = 'job startup timeout') as startup_timeouts,
        max(r.end_time) as last_finished
      from cron.job_run_details r join cron.job j using (jobid)
      where r.start_time > now() - interval '1 hour'
      group by j.jobname, r.status order by j.jobname, r.status
    ) t
  ),
  'worker_leases', (
    select count(*) from collectibles_internal.worker_leases where expires_at > now()
  )
) as snapshot;
