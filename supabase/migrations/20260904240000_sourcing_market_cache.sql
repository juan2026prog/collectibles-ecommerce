-- ==============================================================================
-- Migration: Sourcing Market Cache and History
-- Tables for persistent caching and historical price tracking of external market lookups (e.g. Mercado Libre Uruguay)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sourcing_market_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_product_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'mercado_libre_uy',
    query TEXT NOT NULL,
    match_type TEXT NOT NULL,
    match_confidence NUMERIC(5, 2) NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '12 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_market_cache_lookup 
ON public.sourcing_market_cache (normalized_product_id, source, expires_at);

CREATE INDEX IF NOT EXISTS idx_sourcing_market_cache_query 
ON public.sourcing_market_cache (query, source);

CREATE TABLE IF NOT EXISTS public.sourcing_market_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_product_id TEXT NOT NULL,
    market_source TEXT NOT NULL DEFAULT 'mercado_libre_uy',
    price NUMERIC(12, 2),
    currency TEXT DEFAULT 'USD',
    availability TEXT DEFAULT 'in_stock',
    listing_count INT DEFAULT 0,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_market_history_product 
ON public.sourcing_market_history (normalized_product_id, checked_at DESC);

ALTER TABLE public.sourcing_market_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_market_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin full access to sourcing_market_cache" ON public.sourcing_market_cache;
CREATE POLICY "Allow admin full access to sourcing_market_cache"
ON public.sourcing_market_cache
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow admin full access to sourcing_market_history" ON public.sourcing_market_history;
CREATE POLICY "Allow admin full access to sourcing_market_history"
ON public.sourcing_market_history
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
