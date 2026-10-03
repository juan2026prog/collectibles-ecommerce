-- Restore the missing cache used by existing market services. Client reads are
-- restricted to admins; writes belong to the authenticated server/service role.
CREATE TABLE IF NOT EXISTS public.sourcing_market_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_product_id text NOT NULL,
  source text NOT NULL,
  query text NOT NULL,
  match_type text NOT NULL,
  match_confidence numeric(5,2),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sourcing_market_cache_product_source
  ON public.sourcing_market_cache(normalized_product_id, source);
ALTER TABLE public.sourcing_market_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admin full access to sourcing_market_cache" ON public.sourcing_market_cache;
DROP POLICY IF EXISTS "Sourcing market cache admin read" ON public.sourcing_market_cache;
CREATE POLICY "Sourcing market cache admin read" ON public.sourcing_market_cache
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = (SELECT auth.uid())
      AND r.role::text IN ('admin','superadmin','super_admin','god_admin'))
    OR (SELECT auth.jwt())->'app_metadata'->>'role' IN ('admin','superadmin','super_admin','god_admin')
  );
GRANT SELECT ON public.sourcing_market_cache TO authenticated;
GRANT ALL ON public.sourcing_market_cache TO service_role;
REVOKE ALL ON public.sourcing_market_cache FROM anon;

ALTER TABLE public.sourcing_signals ALTER COLUMN confidence DROP DEFAULT;
ALTER TABLE public.sourcing_discoveries ALTER COLUMN confidence_score DROP DEFAULT;
ALTER TABLE public.sourcing_research_cache ALTER COLUMN confidence DROP DEFAULT;

-- A title alone cannot collapse distinct editions, sizes or packaging variants.
ALTER TABLE public.sourcing_discoveries DROP CONSTRAINT IF EXISTS sourcing_discoveries_country_title_source_retailer_key;
CREATE UNIQUE INDEX IF NOT EXISTS sourcing_discoveries_validated_identity
  ON public.sourcing_discoveries(country, canonical_product_id)
  WHERE evidence->>'verification_version' = '1';

-- Evidence snapshots cannot be authored by public clients. Existing readers and
-- Watchlist administration are preserved; collection/persistence use service_role.
REVOKE INSERT, UPDATE, DELETE ON public.sourcing_signals, public.sourcing_discoveries,
  public.sourcing_discovery_runs, public.sourcing_trends FROM anon, authenticated;
GRANT ALL ON public.sourcing_signals, public.sourcing_discoveries,
  public.sourcing_discovery_runs, public.sourcing_trends TO service_role;

-- Keep historical evidence and source prices. Quarantine unsupported economics
-- and certainty rather than deleting candidates or rewriting their source data.
UPDATE public.sourcing_discoveries SET
  evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('legacy_calculations',
    jsonb_build_object('landed_cost_usd', landed_cost_usd, 'suggested_price_usd', suggested_price_usd,
      'margin_percent', margin_percent, 'confidence_score', confidence_score)),
  landed_cost_usd = NULL, suggested_price_usd = NULL, margin_percent = NULL, confidence_score = NULL
WHERE evidence->>'verification_version' IS DISTINCT FROM '1'
  AND NOT (coalesce(evidence, '{}'::jsonb) ? 'legacy_calculations');

NOTIFY pgrst, 'reload schema';
