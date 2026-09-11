-- ==============================================================================
-- MIGRATION: SOURCING INTELLIGENCE FASE 4 — ADAPTIVE SOURCING
-- Demand Signal Engine, Catalog Gap Engine, Sourcing Opportunities & Adaptive Settings
-- ==============================================================================

-- 1. Table: sourcing_demand_signals
CREATE TABLE IF NOT EXISTS public.sourcing_demand_signals (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    session_id text,
    signal_type text NOT NULL, -- ZERO_RESULT_SEARCH, LOW_RESULT_SEARCH, REPEATED_SEARCH, HIGH_INTENT_SEARCH, WISHLIST_INTENT, RADAR_CLICK, COMPARE_INTENT
    query text,
    interpreted_query jsonb DEFAULT '{}'::jsonb, -- brand, license, line, character, scale, price_min, price_max, etc.
    results_count int DEFAULT 0,
    entity_type text DEFAULT 'PRODUCT', -- SKU, PRODUCT, CHARACTER, PRODUCT_LINE, FRANCHISE, BRAND, CATEGORY, ATTRIBUTE_COMBINATION
    entity_id text,
    weight numeric(5,2) DEFAULT 1.0,
    source text DEFAULT 'ai_search', -- ai_search, storefront, radar, wishlist, compare, vault, release_calendar
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.sourcing_demand_signals IS 'Registro atómico de señales de demanda capturadas de búsquedas, wishlist, radar y comparaciones.';

CREATE INDEX IF NOT EXISTS idx_demand_signals_type ON public.sourcing_demand_signals(signal_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_signals_session ON public.sourcing_demand_signals(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_signals_entity ON public.sourcing_demand_signals(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_demand_signals_created ON public.sourcing_demand_signals(created_at DESC);

-- 2. Table: sourcing_catalog_gaps
CREATE TABLE IF NOT EXISTS public.sourcing_catalog_gaps (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    gap_key text UNIQUE NOT NULL, -- Deduplication key (e.g., "street_fighter:ken:jada_toys:1_12")
    franchise text,
    character text,
    brand text,
    line text,
    scale text,
    category text,
    keywords text[] DEFAULT '{}'::text[],
    search_count int DEFAULT 1,
    zero_result_count int DEFAULT 0,
    unique_users int DEFAULT 1,
    wishlist_interest int DEFAULT 0,
    radar_interest int DEFAULT 0,
    comparison_interest int DEFAULT 0,
    product_views int DEFAULT 0,
    demand_score numeric(5,2) DEFAULT 0,
    trend_velocity numeric(5,2) DEFAULT 0, -- Trend acceleration / velocity metric
    status text DEFAULT 'DETECTED', -- DETECTED, QUALIFYING, SEARCHING, SOURCES_FOUND, NO_SOURCE, QUALIFIED, REJECTED, DISMISSED, EXPIRED
    last_evaluated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.sourcing_catalog_gaps IS 'Huecos de catálogo agregados a partir de la demanda recurrente o no satisfecha.';

CREATE INDEX IF NOT EXISTS idx_catalog_gaps_key ON public.sourcing_catalog_gaps(gap_key);
CREATE INDEX IF NOT EXISTS idx_catalog_gaps_status ON public.sourcing_catalog_gaps(status);
CREATE INDEX IF NOT EXISTS idx_catalog_gaps_demand ON public.sourcing_catalog_gaps(demand_score DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_gaps_franchise ON public.sourcing_catalog_gaps(franchise);

-- 3. Table: sourcing_opportunities
CREATE TABLE IF NOT EXISTS public.sourcing_opportunities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    gap_id uuid REFERENCES public.sourcing_catalog_gaps(id) ON DELETE SET NULL,
    canonical_sku text UNIQUE NOT NULL,
    canonical_product_id uuid REFERENCES public.canonical_products(id) ON DELETE SET NULL,
    title text NOT NULL,
    brand text NOT NULL,
    franchise text NOT NULL,
    character text,
    line text,
    scale text,
    image_url text,
    demand_score numeric(5,2) DEFAULT 0,
    opportunity_score numeric(5,2) DEFAULT 0,
    best_source text, -- amazon, ebay, bestbuy, etc.
    best_source_url text,
    best_source_seller text,
    best_source_price_usd numeric(10,2) DEFAULT 0,
    source_candidates jsonb DEFAULT '[]'::jsonb, -- grouped offers from retailers
    landed_cost_usd numeric(10,2) DEFAULT 0,
    suggested_sell_price_usd numeric(10,2) DEFAULT 0,
    expected_margin_percent numeric(5,2) DEFAULT 0,
    profitability_status text DEFAULT 'VIABLE', -- VIABLE, MARGINAL, NOT_VIABLE, NEEDS_REVIEW
    match_confidence numeric(5,2) DEFAULT 0.90, -- 0.00 to 1.00
    availability text DEFAULT 'IN_STOCK', -- IN_STOCK, IMPORT_ON_DEMAND, PREORDER, UNAVAILABLE
    trend_velocity numeric(5,2) DEFAULT 0,
    price_volatility_score numeric(5,2) DEFAULT 0,
    reason_codes jsonb DEFAULT '[]'::jsonb, -- Positive & negative reasons
    status text DEFAULT 'READY_FOR_REVIEW', -- DETECTED, QUALIFYING, SEARCHING, SOURCES_FOUND, NO_SOURCE, MATCH_REVIEW, QUALIFIED, REJECTED, READY_FOR_REVIEW, APPROVED, DISMISSED, EXPIRED, PROVIDER_ERROR
    feedback_reason text, -- TOO_EXPENSIVE, LOW_MARGIN, BAD_PRODUCT_MATCH, UNTRUSTED_SOURCE, NOT_RELEVANT, DUPLICATE, OTHER
    imported_product_id text, -- ID in international_products if published
    last_evaluated_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.sourcing_opportunities IS 'Oportunidades de sourcing priorizadas por Opportunity Score para revisión administrativa.';

CREATE INDEX IF NOT EXISTS idx_sourcing_opp_sku ON public.sourcing_opportunities(canonical_sku);
CREATE INDEX IF NOT EXISTS idx_sourcing_opp_status ON public.sourcing_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_sourcing_opp_score ON public.sourcing_opportunities(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_opp_demand ON public.sourcing_opportunities(demand_score DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_opp_franchise ON public.sourcing_opportunities(franchise);

-- 4. Table: sourcing_adaptive_settings
CREATE TABLE IF NOT EXISTS public.sourcing_adaptive_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.sourcing_adaptive_settings IS 'Configuración centralizada para Adaptive Sourcing (pesos de demanda, umbrales, Kill Switch).';

-- Seed default adaptive settings
INSERT INTO public.sourcing_adaptive_settings (key, value, description)
VALUES
    ('config', '{
        "enabled": true,
        "minimum_demand_score": 50,
        "minimum_opportunity_score": 60,
        "minimum_unique_users": 1,
        "minimum_search_count": 2,
        "zero_result_weight": 4.0,
        "wishlist_weight": 3.0,
        "radar_weight": 2.5,
        "comparison_weight": 2.0,
        "release_weight": 3.5,
        "time_decay_half_life_days": 14,
        "discovery_budget_daily": 50,
        "retailer_sources": ["amazon", "ebay", "bestbuy"],
        "source_revalidation_hours": 24
    }'::jsonb, 'Configuración general de Adaptive Sourcing y Kill Switch')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = now();

-- Enable RLS
ALTER TABLE public.sourcing_demand_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_catalog_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_adaptive_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can insert demand signals"
    ON public.sourcing_demand_signals FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Admins can view and manage demand signals"
    ON public.sourcing_demand_signals FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can manage catalog gaps"
    ON public.sourcing_catalog_gaps FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can manage sourcing opportunities"
    ON public.sourcing_opportunities FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Everyone can read adaptive settings"
    ON public.sourcing_adaptive_settings FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage adaptive settings"
    ON public.sourcing_adaptive_settings FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
