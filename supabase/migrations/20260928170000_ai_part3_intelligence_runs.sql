-- Collectibles 2026 — Part 3 Intelligence audit store
create table if not exists public.ai_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  engine text not null,
  country_code text not null,
  objective text,
  evidence_fingerprint text,
  evidence_count integer not null default 0,
  summary text,
  confidence numeric(5,4),
  score_adjustment numeric(6,2) not null default 0,
  advisory_action text,
  signals jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  request_id text,
  model text,
  status text not null default 'SUCCESS',
  metadata jsonb not null default '{}'::jsonb
);
alter table public.ai_intelligence_runs enable row level security;
create index if not exists ai_intelligence_runs_engine_created_idx on public.ai_intelligence_runs(engine, created_at desc);
create index if not exists ai_intelligence_runs_country_created_idx on public.ai_intelligence_runs(country_code, created_at desc);
