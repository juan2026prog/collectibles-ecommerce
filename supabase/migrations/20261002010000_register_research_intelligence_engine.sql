-- ============================================================
-- COLLECTIBLES 2026 — REGISTER RESEARCH_INTELLIGENCE ENGINE
-- Migration: 20261002010000_register_research_intelligence_engine.sql
-- Registers RESEARCH_INTELLIGENCE in public.ai_engine_config
-- ============================================================

INSERT INTO public.ai_engine_config (
  engine_key,
  name,
  description,
  enabled,
  provider,
  model,
  temperature,
  max_input_tokens,
  max_output_tokens,
  daily_request_limit,
  daily_budget_usd,
  monthly_budget_usd,
  timeout_ms,
  fallback_enabled,
  country_scope
)
VALUES (
  'RESEARCH_INTELLIGENCE',
  'Research Intelligence & Sourcing',
  'Investigación comercial y búsqueda web de coleccionables, novedades y preventas.',
  true,
  'OPENAI',
  'gpt-4o-mini',
  0.20,
  4096,
  1500,
  200,
  0.5000,
  5.0000,
  35000,
  false,
  ARRAY['ALL']
)
ON CONFLICT (engine_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  updated_at = now();
