-- Collectibles 2026 — Part 4 controlled automation hardening
-- Start from a safe posture. Automation may discover/evaluate/prepare, but
-- publishing and purchasing remain approval-gated.

update public.sourcing_autopilot_settings
set mode = case when mode = 'AUTOPILOT' then 'SEMIAUTOMATIC' else mode end,
    auto_publish = false,
    auto_purchase = false,
    updated_at = now();

alter table public.sourcing_autopilot_queue
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approval_note text,
  add column if not exists execution_started_at timestamptz,
  add column if not exists execution_completed_at timestamptz;

create index if not exists idx_autopilot_queue_approval
  on public.sourcing_autopilot_queue(status, approved_at);

create or replace function public.approve_sourcing_autopilot_action(
  p_queue_id uuid,
  p_note text default null
) returns public.sourcing_autopilot_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.sourcing_autopilot_queue;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  update public.sourcing_autopilot_queue
  set status = 'PENDING',
      approved_at = now(),
      approved_by = auth.uid(),
      approval_note = p_note,
      updated_at = now()
  where id = p_queue_id
    and status = 'REQUIRES_APPROVAL'
    and approved_at is null
  returning * into v_item;

  if v_item.id is null then
    raise exception 'ACTION_NOT_APPROVABLE';
  end if;

  insert into public.sourcing_autopilot_audit
    (product_id, opportunity_id, action, reason, actor, mode, result, metadata)
  values
    (v_item.canonical_sku, v_item.product_id::text, 'ADMIN_APPROVED_ACTION',
     coalesce(p_note, 'Aprobación administrativa explícita'), 'ADMIN', 'SEMIAUTOMATIC',
     'SUCCESS', jsonb_build_object('queue_id', v_item.id, 'action_type', v_item.action_type));

  return v_item;
end;
$$;

revoke all on function public.approve_sourcing_autopilot_action(uuid,text) from public, anon;
grant execute on function public.approve_sourcing_autopilot_action(uuid,text) to authenticated;
