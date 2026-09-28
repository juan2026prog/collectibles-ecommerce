-- Durable Part 3 intelligence telemetry fallback under RLS
create or replace function public.log_ai_intelligence_run(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.ai_intelligence_runs (
    engine,country_code,objective,evidence_fingerprint,evidence_count,summary,
    confidence,score_adjustment,advisory_action,signals,risks,recommendations,
    evidence_ids,request_id,model,status,metadata
  ) values (
    p_payload->>'engine',p_payload->>'country_code',p_payload->>'objective',
    p_payload->>'evidence_fingerprint',coalesce((p_payload->>'evidence_count')::int,0),
    p_payload->>'summary',nullif(p_payload->>'confidence','')::numeric,
    coalesce((p_payload->>'score_adjustment')::numeric,0),p_payload->>'advisory_action',
    coalesce(p_payload->'signals','[]'::jsonb),coalesce(p_payload->'risks','[]'::jsonb),
    coalesce(p_payload->'recommendations','[]'::jsonb),coalesce(p_payload->'evidence_ids','[]'::jsonb),
    p_payload->>'request_id',p_payload->>'model',coalesce(p_payload->>'status','SUCCESS'),
    coalesce(p_payload->'metadata','{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.log_ai_intelligence_run(jsonb) from public;
grant execute on function public.log_ai_intelligence_run(jsonb) to anon, authenticated, service_role;