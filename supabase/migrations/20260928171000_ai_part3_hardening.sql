-- Part 3 hardening: unknown provider pricing must remain unknown, not USD 0.
alter table public.ai_usage_events alter column estimated_cost_usd drop not null;
alter table public.ai_usage_events alter column estimated_cost_usd drop default;

-- Part 3 intelligence audit is admin-readable; writes are performed server-side.
drop policy if exists "Admins can read AI intelligence runs" on public.ai_intelligence_runs;
create policy "Admins can read AI intelligence runs"
on public.ai_intelligence_runs for select
using (exists (
  select 1 from public.profiles
  where profiles.id = auth.uid() and profiles.is_admin = true
));
