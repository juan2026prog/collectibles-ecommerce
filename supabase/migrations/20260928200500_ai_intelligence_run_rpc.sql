-- Durable Part 3 intelligence telemetry fallback under RLS
CREATE OR REPLACE FUNCTION public.log_ai_intelligence_run(
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_engine text;
  v_country_code text;
  v_objective text;
  v_evidence_fingerprint text;
  v_evidence_count integer;
  v_summary text;
  v_confidence numeric(5,4);
  v_score_adjustment numeric(6,2);
  v_advisory_action text;
  v_signals jsonb;
  v_risks jsonb;
  v_recommendations jsonb;
  v_evidence_ids jsonb;
  v_request_id text;
  v_model text;
  v_status text;
  v_metadata jsonb;
BEGIN
  v_engine := p_payload->>'engine';
  v_country_code := coalesce(p_payload->>'country_code', 'GLOBAL');
  v_objective := p_payload->>'objective';
  v_evidence_fingerprint := p_payload->>'evidence_fingerprint';
  v_evidence_count := coalesce((p_payload->>'evidence_count')::integer, 0);
  v_summary := p_payload->>'summary';
  v_confidence := (p_payload->>'confidence')::numeric(5,4);
  v_score_adjustment := coalesce((p_payload->>'score_adjustment')::numeric(6,2), 0);
  v_advisory_action := p_payload->>'advisory_action';
  v_signals := coalesce(p_payload->'signals', '[]'::jsonb);
  v_risks := coalesce(p_payload->'risks', '[]'::jsonb);
  v_recommendations := coalesce(p_payload->'recommendations', '[]'::jsonb);
  v_evidence_ids := coalesce(p_payload->'evidence_ids', '[]'::jsonb);
  v_request_id := p_payload->>'request_id';
  v_model := p_payload->>'model';
  v_status := coalesce(p_payload->>'status', 'SUCCESS');
  v_metadata := coalesce(p_payload->'metadata', '{}'::jsonb);

  IF v_engine IS NULL OR v_engine = '' THEN
    RAISE EXCEPTION 'invalid ai intelligence run payload: engine is required';
  END IF;

  INSERT INTO public.ai_intelligence_runs (
    engine,
    country_code,
    objective,
    evidence_fingerprint,
    evidence_count,
    summary,
    confidence,
    score_adjustment,
    advisory_action,
    signals,
    risks,
    recommendations,
    evidence_ids,
    request_id,
    model,
    status,
    metadata
  ) VALUES (
    v_engine,
    v_country_code,
    v_objective,
    v_evidence_fingerprint,
    v_evidence_count,
    v_summary,
    v_confidence,
    v_score_adjustment,
    v_advisory_action,
    v_signals,
    v_risks,
    v_recommendations,
    v_evidence_ids,
    v_request_id,
    v_model,
    v_status,
    v_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_ai_intelligence_run(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_ai_intelligence_run(jsonb) TO anon, authenticated, service_role;
