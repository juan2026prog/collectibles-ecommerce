-- ============================================================
-- SOURCING OPENAI OPTIONAL RESEARCH — CONFIGURATION
-- sourcing_openai_enabled = false (DEFAULT OFF)
-- ============================================================

-- 1. Insert OpenAI sourcing config keys into site_settings
INSERT INTO public.site_settings (key, value, updated_at) VALUES
  ('sourcing_openai_enabled',             'false',  now()),
  ('sourcing_openai_model',               'gpt-4o', now()),
  ('sourcing_openai_web_search_enabled',  'false',  now()),
  ('sourcing_openai_max_results',         '100',    now()),
  ('sourcing_openai_daily_request_limit', '20',     now()),
  ('sourcing_openai_daily_budget_usd',    '10.00',  now())
ON CONFLICT (key) DO NOTHING;

-- 2. Create usage/audit log table (no secrets stored here)
CREATE TABLE IF NOT EXISTS public.sourcing_openai_usage_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id     uuid NOT NULL REFERENCES auth.users(id),
  created_at        timestamptz DEFAULT now(),
  query             text NOT NULL,
  research_type     text DEFAULT 'MANUAL',
  model             text NOT NULL,
  input_tokens      integer DEFAULT 0,
  output_tokens     integer DEFAULT 0,
  total_tokens      integer DEFAULT 0,
  estimated_cost_usd numeric(10, 6) DEFAULT 0,
  items_found       integer DEFAULT 0,
  items_valid       integer DEFAULT 0,
  items_invalid     integer DEFAULT 0,
  status            text DEFAULT 'READY',
  duration_ms       integer DEFAULT 0,
  error_message     text
);

ALTER TABLE public.sourcing_openai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sourcing openai usage log"
  ON public.sourcing_openai_usage_log
  FOR ALL
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sourcing_openai_log_created_at
  ON public.sourcing_openai_usage_log (admin_user_id, created_at DESC);
