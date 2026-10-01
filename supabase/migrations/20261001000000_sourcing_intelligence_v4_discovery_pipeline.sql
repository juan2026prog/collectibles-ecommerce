// ==============================================================================
// MIGRATION: SOURCING INTELLIGENCE V4 AUTOMATIC DISCOVERY PERSISTENCE & RUNS
// Collectibles 2026 — Real Evidence, Source Collectors & Scheduled Runs
// ==============================================================================

-- 1. Table: sourcing_signals (Evidencia y observaciones atómicas de mercado e internas)
CREATE TABLE IF NOT EXISTS public.sourcing_signals (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    country text NOT NULL DEFAULT 'UY',
    source_type text NOT NULL, -- 'RETAILER', 'MARKETPLACE', 'OFFICIAL', 'COMMUNITY', 'INTERNAL_DATA', 'RADAR'
    source_name text NOT NULL,
    source_url text,
    external_id text,
    product_identity text,
    topic text,
    signal_type text NOT NULL, -- 'SEARCH_VOLUME', 'WISHLIST_ADD', 'STOCK_ALERT', 'PREORDER_WINDOW', 'NEW_RELEASE', 'PRICE_DROP', 'EDITORIAL_REVIEW'
    value numeric(12,2),
    previous_value numeric(12,2),
    confidence numeric(5,2) DEFAULT 80.0,
    evidence_text text,
    metadata jsonb DEFAULT '{}'::jsonb,
    fingerprint text,
    observed_at timestamptz DEFAULT now(),
    collected_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_signals_country_topic ON public.sourcing_signals(country, topic);
CREATE INDEX IF NOT EXISTS idx_sourcing_signals_observed ON public.sourcing_signals(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_signals_fingerprint ON public.sourcing_signals(fingerprint);

-- 2. Table: sourcing_trends (Tendencias persistidas derivadas de evidencia real)
CREATE TABLE IF NOT EXISTS public.sourcing_trends (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    country text NOT NULL DEFAULT 'UY',
    topic text NOT NULL,
    category text DEFAULT 'Coleccionables',
    market_trend_score int DEFAULT 0,
    collectibles_trend_score int DEFAULT 0,
    composite_score int DEFAULT 0,
    velocity numeric(6,2) DEFAULT 0.0,
    status text NOT NULL DEFAULT 'GROWING', -- 'NEW', 'PREORDER', 'GROWING', 'TRENDING', 'EMERGING', 'OPPORTUNITY'
    direction text NOT NULL DEFAULT 'STABLE', -- 'UP', 'DOWN', 'STABLE'
    confidence text NOT NULL DEFAULT 'MEDIUM', -- 'HIGH', 'MEDIUM', 'LOW'
    drivers text[] DEFAULT '{}'::text[],
    subtrends text[] DEFAULT '{}'::text[],
    why_summary text,
    evidence_count int DEFAULT 0,
    first_detected_at timestamptz DEFAULT now(),
    last_detected_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(country, topic)
);

CREATE INDEX IF NOT EXISTS idx_sourcing_trends_country_score ON public.sourcing_trends(country, composite_score DESC);

-- 3. Table: sourcing_discoveries (Productos candidatos descubiertos por Discovery / Research)
CREATE TABLE IF NOT EXISTS public.sourcing_discoveries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    country text NOT NULL DEFAULT 'UY',
    canonical_product_id text,
    title text NOT NULL,
    brand text,
    franchise text,
    category text,
    status text NOT NULL DEFAULT 'NEW', -- 'NEW', 'PREORDER', 'GROWING', 'TRENDING', 'EMERGING', 'OPPORTUNITY'
    discovered_from text NOT NULL DEFAULT 'WATCHLIST', -- 'WATCHLIST', 'DISCOVERED_OUTSIDE_WATCHLIST', 'RADAR', 'MANUAL_RESEARCH'
    trend_score int DEFAULT 0,
    opportunity_score int DEFAULT 0,
    confidence_score int DEFAULT 0,
    source_retailer text,
    source_url text,
    asin text,
    price_usd numeric(10,2),
    landed_cost_usd numeric(10,2),
    suggested_price_usd numeric(10,2),
    margin_percent numeric(5,2),
    stock_status text DEFAULT 'UNKNOWN',
    why_explanation jsonb DEFAULT '{}'::jsonb,
    evidence jsonb DEFAULT '{}'::jsonb,
    outside_watchlist boolean DEFAULT false,
    discovered_at timestamptz DEFAULT now(),
    last_verified_at timestamptz DEFAULT now(),
    UNIQUE(country, title, source_retailer)
);

CREATE INDEX IF NOT EXISTS idx_sourcing_discoveries_country_status ON public.sourcing_discoveries(country, status);
CREATE INDEX IF NOT EXISTS idx_sourcing_discoveries_opp ON public.sourcing_discoveries(opportunity_score DESC);

-- 4. Table: sourcing_discovery_runs (Trazabilidad y auditoría de ejecuciones de Discovery)
CREATE TABLE IF NOT EXISTS public.sourcing_discovery_runs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    status text NOT NULL DEFAULT 'RUNNING', -- 'RUNNING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'
    trigger text NOT NULL DEFAULT 'CRON', -- 'CRON', 'MANUAL', 'WEBHOOK'
    countries text[] DEFAULT ARRAY['UY'],
    sources_requested text[] DEFAULT '{}',
    sources_successful text[] DEFAULT '{}',
    sources_failed text[] DEFAULT '{}',
    signals_created int DEFAULT 0,
    signals_updated int DEFAULT 0,
    products_detected int DEFAULT 0,
    trends_created int DEFAULT 0,
    discoveries_created int DEFAULT 0,
    ai_calls int DEFAULT 0,
    estimated_ai_cost_usd numeric(8,4) DEFAULT 0.0000,
    error_summary text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_discovery_runs_started ON public.sourcing_discovery_runs(started_at DESC);

-- 5. RLS Policies
ALTER TABLE public.sourcing_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_discovery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read sourcing_signals" ON public.sourcing_signals FOR SELECT USING (true);
CREATE POLICY "Allow public insert sourcing_signals" ON public.sourcing_signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public manage sourcing_signals" ON public.sourcing_signals FOR ALL USING (true);

CREATE POLICY "Allow public read sourcing_trends" ON public.sourcing_trends FOR SELECT USING (true);
CREATE POLICY "Allow public insert sourcing_trends" ON public.sourcing_trends FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public manage sourcing_trends" ON public.sourcing_trends FOR ALL USING (true);

CREATE POLICY "Allow public read sourcing_discoveries" ON public.sourcing_discoveries FOR SELECT USING (true);
CREATE POLICY "Allow public insert sourcing_discoveries" ON public.sourcing_discoveries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public manage sourcing_discoveries" ON public.sourcing_discoveries FOR ALL USING (true);

CREATE POLICY "Allow public read sourcing_discovery_runs" ON public.sourcing_discovery_runs FOR SELECT USING (true);
CREATE POLICY "Allow public insert sourcing_discovery_runs" ON public.sourcing_discovery_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public manage sourcing_discovery_runs" ON public.sourcing_discovery_runs FOR ALL USING (true);
