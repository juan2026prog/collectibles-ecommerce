-- ==============================================================================
-- MIGRATION: SOURCING WATCHLIST & RESEARCH REQUESTS
-- Collectibles 2026 — Database-First Watchlist & Radar Traceability
-- ==============================================================================

-- 1. Table: sourcing_watchlist (Persistencia en base de datos de Watchlist)
CREATE TABLE IF NOT EXISTS public.sourcing_watchlist (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id text NOT NULL,
    canonical_sku text,
    title text,
    brand text,
    source_name text,
    target_price numeric(10,2),
    current_price numeric(10,2),
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, product_id)
);

-- Index for fast lookup by user and product
CREATE INDEX IF NOT EXISTS idx_sourcing_watchlist_user_prod ON public.sourcing_watchlist(user_id, product_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_watchlist_prod ON public.sourcing_watchlist(product_id);

-- 2. Table: sourcing_research_requests (Trazabilidad Radar -> Research -> Retailers -> Opportunity)
CREATE TABLE IF NOT EXISTS public.sourcing_research_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    radar_release_id text,
    search_query text NOT NULL,
    requested_by text NOT NULL DEFAULT 'admin',
    status text NOT NULL DEFAULT 'COMPLETED', -- PENDING, COMPLETED, FAILED
    matched_canonical_count int DEFAULT 0,
    matched_offers_count int DEFAULT 0,
    best_opportunity_score int DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_research_radar ON public.sourcing_research_requests(radar_release_id);

-- 3. Security & RLS Policies
ALTER TABLE public.sourcing_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_research_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read watchlist" ON public.sourcing_watchlist
    FOR SELECT USING (true);

CREATE POLICY "Allow public manage watchlist" ON public.sourcing_watchlist
    FOR ALL USING (true);

CREATE POLICY "Allow public manage research requests" ON public.sourcing_research_requests
    FOR ALL USING (true);
