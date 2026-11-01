-- Collectibles 2026: bounded retention for ephemeral Amazon/Zinc discovery data.
-- Published/imported products are NEVER removed by this job.
-- Candidate rows still under review expire after 30 days.
-- Search history/raw Zinc responses expire after 30 days once no candidate references them.

create or replace function public.cleanup_international_discovery(retention_days integer default 30)
returns table(deleted_candidates bigint, deleted_searches bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidates bigint := 0;
  v_searches bigint := 0;
begin
  if retention_days < 7 then
    raise exception 'retention_days must be >= 7';
  end if;

  delete from public.international_import_candidates
  where status = 'review'
    and created_at < now() - make_interval(days => retention_days);
  get diagnostics v_candidates = row_count;

  delete from public.international_import_searches s
  where s.created_at < now() - make_interval(days => retention_days)
    and not exists (
      select 1
      from public.international_import_candidates c
      where c.search_id = s.id
    );
  get diagnostics v_searches = row_count;

  return query select v_candidates, v_searches;
end;
$$;

revoke all on function public.cleanup_international_discovery(integer) from public, anon, authenticated;
grant execute on function public.cleanup_international_discovery(integer) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'cleanup-international-discovery') then
      perform cron.unschedule('cleanup-international-discovery');
    end if;
    perform cron.schedule(
      'cleanup-international-discovery',
      '17 4 * * *',
      $cron$select public.cleanup_international_discovery(30);$cron$
    );
  end if;
end $$;
