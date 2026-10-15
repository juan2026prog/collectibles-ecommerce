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
