-- ============================================================
-- Migration: 20261001010000_sourcing_research_cache.sql
-- Description: Research Intelligence multi-tier cache for cheap-first AI architecture
-- Global research queries are reusable across target countries with zero AI calls.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sourcing_research_cache (
    cache_key text PRIMARY KEY,
    query text NOT NULL,
    normalized_query text NOT NULL,
    scope text NOT NULL DEFAULT 'GLOBAL',
    research_depth text NOT NULL DEFAULT 'ECONOMICO',
    model text,
    summary text,
    confidence numeric(4,2) DEFAULT 0.85,
    subtrends jsonb DEFAULT '[]'::jsonb,
    items jsonb DEFAULT '[]'::jsonb,
    sources jsonb DEFAULT '[]'::jsonb,
    input_tokens int DEFAULT 0,
    output_tokens int DEFAULT 0,
    cost_usd numeric(10,6) DEFAULT 0,
    hit_count int DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_hit_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_research_cache_norm ON public.sourcing_research_cache(normalized_query, scope, research_depth);
CREATE INDEX IF NOT EXISTS idx_sourcing_research_cache_exp ON public.sourcing_research_cache(expires_at);

ALTER TABLE public.sourcing_research_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read sourcing_research_cache" ON public.sourcing_research_cache;
CREATE POLICY "Allow public read sourcing_research_cache" ON public.sourcing_research_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public manage sourcing_research_cache" ON public.sourcing_research_cache;
CREATE POLICY "Allow public manage sourcing_research_cache" ON public.sourcing_research_cache FOR ALL USING (true);
