-- ============================================================
-- AI INFRASTRUCTURE PHASE 1 — COLLECTIBLES 2026
-- Preparation for AI Gateway and future OpenAI Integration
-- ALL DEFAULT VALUES: DISABLED / NONE / $0.00
-- ============================================================

-- 1. AI SYSTEM CONFIG (Global Configuration)
CREATE TABLE IF NOT EXISTS public.ai_system_config (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_enabled          boolean NOT NULL DEFAULT false,
  provider                text NOT NULL DEFAULT 'NONE',
  environment             text NOT NULL DEFAULT 'PRODUCTION',
  default_timeout_ms      integer NOT NULL DEFAULT 5000,
  daily_budget_usd        numeric(10, 4) NOT NULL DEFAULT 0.0000,
  monthly_budget_usd      numeric(10, 4) NOT NULL DEFAULT 0.0000,
  circuit_breaker_enabled boolean NOT NULL DEFAULT true,
  circuit_breaker_state   text NOT NULL DEFAULT 'CLOSED', -- CLOSED, OPEN, HALF_OPEN
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id)
);

-- Seed default global system config if none exists
INSERT INTO public.ai_system_config (
  global_enabled,
  provider,
  environment,
  default_timeout_ms,
  daily_budget_usd,
  monthly_budget_usd,
  circuit_breaker_enabled,
  circuit_breaker_state
)
SELECT false, 'NONE', 'PRODUCTION', 5000, 0.0000, 0.0000, true, 'CLOSED'
WHERE NOT EXISTS (SELECT 1 FROM public.ai_system_config);

-- 2. AI ENGINE CONFIG (Per-Engine Configuration)
CREATE TABLE IF NOT EXISTS public.ai_engine_config (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key            text NOT NULL UNIQUE, -- AI_SEARCH, PRODUCT_DISCOVERY, TREND_ANALYSIS, etc.
  name                  text NOT NULL,
  description           text,
  enabled               boolean NOT NULL DEFAULT false,
  provider              text NOT NULL DEFAULT 'NONE',
  model                 text NOT NULL DEFAULT 'NOT CONFIGURED',
  temperature           numeric(3, 2) NOT NULL DEFAULT 0.20,
  max_input_tokens      integer NOT NULL DEFAULT 2048,
  max_output_tokens     integer NOT NULL DEFAULT 1024,
  daily_request_limit   integer NOT NULL DEFAULT 100,
  daily_budget_usd      numeric(10, 4) NOT NULL DEFAULT 0.0000,
  monthly_budget_usd    numeric(10, 4) NOT NULL DEFAULT 0.0000,
  timeout_ms            integer NOT NULL DEFAULT 5000,
  fallback_enabled      boolean NOT NULL DEFAULT true,
  country_scope         text[] NOT NULL DEFAULT ARRAY['ALL'],
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES auth.users(id)
);

-- Seed the 7 core engines (all disabled by default)
INSERT INTO public.ai_engine_config (
  engine_key, name, description, enabled, provider, model, daily_request_limit, daily_budget_usd, monthly_budget_usd, timeout_ms, fallback_enabled
) VALUES
  ('AI_SEARCH', 'AI Search & Semantics', 'Búsqueda contextual y semántica en catálogo y colecciones.', false, 'NONE', 'NOT CONFIGURED', 500, 0.0000, 0.0000, 4000, true),
  ('PRODUCT_DISCOVERY', 'Product Discovery', 'Descubrimiento inteligente y matching de productos coleccionables.', false, 'NONE', 'NOT CONFIGURED', 200, 0.0000, 0.0000, 6000, true),
  ('TREND_ANALYSIS', 'Trend Analysis', 'Análisis de tendencias globales y señales de demanda en tiempo real.', false, 'NONE', 'NOT CONFIGURED', 100, 0.0000, 0.0000, 8000, true),
  ('PRODUCT_CURATION', 'Product Curation', 'Curaduría y enriquecimiento automatizado de metadatos de coleccionismo.', false, 'NONE', 'NOT CONFIGURED', 200, 0.0000, 0.0000, 6000, true),
  ('COUNTRY_INTELLIGENCE', 'Country Intelligence', 'Adaptación regional de afinidad y preferencias de mercado por país.', false, 'NONE', 'NOT CONFIGURED', 100, 0.0000, 0.0000, 5000, true),
  ('RADAR_INTELLIGENCE', 'Radar Intelligence', 'Puntajes predictivos y clasificación heurística asistida para Radar.', false, 'NONE', 'NOT CONFIGURED', 300, 0.0000, 0.0000, 5000, true),
  ('RELEASE_INTELLIGENCE', 'Release Intelligence', 'Seguimiento predictivo de calendarios y lanzamientos oficiales.', false, 'NONE', 'NOT CONFIGURED', 100, 0.0000, 0.0000, 5000, true)
ON CONFLICT (engine_key) DO NOTHING;

-- 3. AI COUNTRY CONFIG (Per-Country Granular Matrix)
CREATE TABLE IF NOT EXISTS public.ai_country_config (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code                  text NOT NULL UNIQUE, -- UY, AR, CL, PE, MX, EC
  country_name                  text NOT NULL,
  ai_enabled                    boolean NOT NULL DEFAULT false,
  ai_search_enabled             boolean NOT NULL DEFAULT false,
  product_discovery_enabled     boolean NOT NULL DEFAULT false,
  trend_analysis_enabled        boolean NOT NULL DEFAULT false,
  product_curation_enabled      boolean NOT NULL DEFAULT false,
  country_intelligence_enabled  boolean NOT NULL DEFAULT false,
  radar_intelligence_enabled    boolean NOT NULL DEFAULT false,
  release_intelligence_enabled  boolean NOT NULL DEFAULT false,
  daily_budget_usd              numeric(10, 4) NOT NULL DEFAULT 0.0000,
  monthly_budget_usd            numeric(10, 4) NOT NULL DEFAULT 0.0000,
  currency                      text NOT NULL DEFAULT 'USD',
  status                        text NOT NULL DEFAULT 'INACTIVE', -- ACTIVE, INACTIVE, PAUSED
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by                    uuid REFERENCES auth.users(id)
);

-- Seed 6 initial Latin America countries (all disabled by default)
INSERT INTO public.ai_country_config (
  country_code, country_name, ai_enabled, ai_search_enabled, product_discovery_enabled, trend_analysis_enabled,
  product_curation_enabled, country_intelligence_enabled, radar_intelligence_enabled, release_intelligence_enabled,
  daily_budget_usd, monthly_budget_usd, currency, status
) VALUES
  ('UY', 'Uruguay', false, false, false, false, false, false, false, false, 0.0000, 0.0000, 'USD', 'INACTIVE'),
  ('AR', 'Argentina', false, false, false, false, false, false, false, false, 0.0000, 0.0000, 'USD', 'INACTIVE'),
  ('CL', 'Chile', false, false, false, false, false, false, false, false, 0.0000, 0.0000, 'USD', 'INACTIVE'),
  ('PE', 'Perú', false, false, false, false, false, false, false, false, 0.0000, 0.0000, 'USD', 'INACTIVE'),
  ('MX', 'México', false, false, false, false, false, false, false, false, 0.0000, 0.0000, 'USD', 'INACTIVE'),
  ('EC', 'Ecuador', false, false, false, false, false, false, false, false, 0.0000, 0.0000, 'USD', 'INACTIVE')
ON CONFLICT (country_code) DO NOTHING;

-- 4. AI USAGE EVENTS (Execution Telemetry & Cost Accounting)
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  engine              text NOT NULL,
  country_code        text NOT NULL DEFAULT 'GLOBAL',
  provider            text NOT NULL DEFAULT 'NONE',
  model               text NOT NULL DEFAULT 'NONE',
  request_id          text NOT NULL,
  user_id             uuid REFERENCES auth.users(id),
  session_id          text,
  input_tokens        integer NOT NULL DEFAULT 0,
  output_tokens       integer NOT NULL DEFAULT 0,
  total_tokens        integer NOT NULL DEFAULT 0,
  estimated_cost_usd  numeric(10, 6) NOT NULL DEFAULT 0.000000,
  latency_ms          integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'DISABLED', -- SUCCESS, DISABLED, ERROR, FALLBACK
  error_code          text,
  fallback_used       boolean NOT NULL DEFAULT false,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created_at ON public.ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_engine ON public.ai_usage_events (engine, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_country ON public.ai_usage_events (country_code, created_at DESC);

-- 5. AI ERROR EVENTS (Safe Error Logging)
CREATE TABLE IF NOT EXISTS public.ai_error_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  engine              text NOT NULL,
  country_code        text NOT NULL DEFAULT 'GLOBAL',
  provider            text NOT NULL DEFAULT 'NONE',
  model               text NOT NULL DEFAULT 'NONE',
  error_type          text NOT NULL,
  error_code          text,
  safe_message        text NOT NULL,
  latency_ms          integer NOT NULL DEFAULT 0,
  request_id          text NOT NULL,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_error_events_created_at ON public.ai_error_events (created_at DESC);

-- 6. AI AUDIT LOGS (SuperAdmin Modifications Track)
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  actor_id            uuid REFERENCES auth.users(id),
  actor_email         text,
  action              text NOT NULL, -- AI_GLOBAL_ENABLED, AI_ENGINE_UPDATED, AI_COUNTRY_UPDATED, etc.
  engine              text,
  country_code        text,
  old_value           jsonb,
  new_value           jsonb,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_created_at ON public.ai_audit_logs (created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.ai_system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_engine_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_country_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. ai_system_config
DROP POLICY IF EXISTS "Superadmin full access to ai_system_config" ON public.ai_system_config;
CREATE POLICY "Superadmin full access to ai_system_config"
  ON public.ai_system_config
  FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- 2. ai_engine_config
DROP POLICY IF EXISTS "Superadmin full access to ai_engine_config" ON public.ai_engine_config;
CREATE POLICY "Superadmin full access to ai_engine_config"
  ON public.ai_engine_config
  FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- 3. ai_country_config
DROP POLICY IF EXISTS "Superadmin full access to ai_country_config" ON public.ai_country_config;
CREATE POLICY "Superadmin full access to ai_country_config"
  ON public.ai_country_config
  FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- 4. ai_usage_events (Superadmin can view, service_role & superadmin can insert)
DROP POLICY IF EXISTS "Superadmin read ai_usage_events" ON public.ai_usage_events;
CREATE POLICY "Superadmin read ai_usage_events"
  ON public.ai_usage_events
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmin insert ai_usage_events" ON public.ai_usage_events;
CREATE POLICY "Superadmin insert ai_usage_events"
  ON public.ai_usage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());

-- 5. ai_error_events
DROP POLICY IF EXISTS "Superadmin read ai_error_events" ON public.ai_error_events;
CREATE POLICY "Superadmin read ai_error_events"
  ON public.ai_error_events
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmin insert ai_error_events" ON public.ai_error_events;
CREATE POLICY "Superadmin insert ai_error_events"
  ON public.ai_error_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());

-- 6. ai_audit_logs
DROP POLICY IF EXISTS "Superadmin read ai_audit_logs" ON public.ai_audit_logs;
CREATE POLICY "Superadmin read ai_audit_logs"
  ON public.ai_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmin insert ai_audit_logs" ON public.ai_audit_logs;
CREATE POLICY "Superadmin insert ai_audit_logs"
  ON public.ai_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());

-- ============================================================
-- HELPER FUNCTIONS & RPC
-- ============================================================

-- Function to get overall aggregated AI status for dashboard (Superadmin only)
CREATE OR REPLACE FUNCTION public.get_ai_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_system record;
  v_reqs_today bigint;
  v_reqs_month bigint;
  v_cost_today numeric;
  v_cost_month numeric;
  v_errors_today bigint;
  v_avg_latency numeric;
  v_last_activity timestamptz;
BEGIN
  v_is_super := public.is_superadmin();
  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Access Denied: SuperAdmin role required.';
  END IF;

  SELECT * INTO v_system FROM public.ai_system_config ORDER BY created_at ASC LIMIT 1;

  SELECT count(*), coalesce(sum(estimated_cost_usd), 0)
    INTO v_reqs_today, v_cost_today
    FROM public.ai_usage_events
    WHERE created_at >= date_trunc('day', now());

  SELECT count(*), coalesce(sum(estimated_cost_usd), 0)
    INTO v_reqs_month, v_cost_month
    FROM public.ai_usage_events
    WHERE created_at >= date_trunc('month', now());

  SELECT count(*)
    INTO v_errors_today
    FROM public.ai_error_events
    WHERE created_at >= date_trunc('day', now());

  SELECT coalesce(avg(latency_ms), 0), max(created_at)
    INTO v_avg_latency, v_last_activity
    FROM public.ai_usage_events;

  RETURN jsonb_build_object(
    'global_enabled', coalesce(v_system.global_enabled, false),
    'provider', coalesce(v_system.provider, 'NONE'),
    'environment', coalesce(v_system.environment, 'PRODUCTION'),
    'circuit_breaker_state', coalesce(v_system.circuit_breaker_state, 'CLOSED'),
    'requests_today', v_reqs_today,
    'requests_month', v_reqs_month,
    'cost_today_usd', v_cost_today,
    'cost_month_usd', v_cost_month,
    'errors_today', v_errors_today,
    'avg_latency_ms', round(v_avg_latency, 2),
    'last_activity', v_last_activity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_dashboard_summary() TO authenticated, service_role;