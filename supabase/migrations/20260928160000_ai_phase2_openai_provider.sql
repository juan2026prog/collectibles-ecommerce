-- AI Phase 2: connect OpenAI safely while keeping every engine OFF by default.
UPDATE public.ai_system_config
SET provider='OPENAI', default_timeout_ms=25000, updated_at=now();

UPDATE public.ai_engine_config SET
  provider='OPENAI',
  model=CASE
    WHEN engine_key IN ('AI_SEARCH','PRODUCT_DISCOVERY','PRODUCT_CURATION') THEN 'gpt-5.6-terra'
    WHEN engine_key IN ('TREND_ANALYSIS','COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE') THEN 'gpt-5.6-sol'
    ELSE 'gpt-5.6-terra'
  END,
  timeout_ms=CASE WHEN engine_key='AI_SEARCH' THEN 15000 ELSE 25000 END,
  max_output_tokens=CASE WHEN engine_key='AI_SEARCH' THEN 700 ELSE 1200 END,
  updated_at=now();

-- Intentionally do not enable global, engine, or country switches here.
-- Activation is a separate controlled step after deploy verification.
