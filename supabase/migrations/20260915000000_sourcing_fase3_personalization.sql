-- ==============================================================================
-- MIGRATION: SOURCING INTELLIGENCE FASE 3 — PERSONALIZATION
-- Dynamic User Interest Profiles, Behavioral Signals, Recommendation Impressions
-- and Personalization Administrative Settings with strict RLS.
-- ==============================================================================

-- 1. Table: sourcing_user_signals
CREATE TABLE IF NOT EXISTS public.sourcing_user_signals (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id text,
    event_type text NOT NULL, -- VIEW, CATEGORY_OPEN, SEARCH, COMPARE, WISHLIST, VAULT, ADD_TO_CART, PURCHASE, REMOVE_WISHLIST, etc.
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    entity_type text, -- category, subcategory, brand, license, line, character, scale, manufacturer, price_range
    entity_name text,
    weight numeric(5,2) NOT NULL DEFAULT 1.0,
    source text DEFAULT 'storefront',
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.sourcing_user_signals IS 'Historial atómico de señales de comportamiento de usuarios (débiles, medias, fuertes y negativas).';

-- Indexes for rapid aggregation
CREATE INDEX IF NOT EXISTS idx_sourcing_signals_user ON public.sourcing_user_signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_signals_session ON public.sourcing_user_signals(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_signals_entity ON public.sourcing_user_signals(entity_type, entity_name);

-- 2. Table: sourcing_user_interest_profiles
CREATE TABLE IF NOT EXISTS public.sourcing_user_interest_profiles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id text,
    dimension text NOT NULL, -- category, brand, license, line, character, scale, manufacturer, price_range, product_type
    entity_name text NOT NULL,
    score numeric(5,4) NOT NULL DEFAULT 0.0000, -- Normalized score (0.0 to 1.0)
    signal_count int DEFAULT 1,
    last_signal_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT unique_user_session_dimension_entity UNIQUE (user_id, session_id, dimension, entity_name)
);

COMMENT ON TABLE public.sourcing_user_interest_profiles IS 'Perfil dinámico pre-agregado de afinidades por dimensión por usuario o sesión.';

CREATE INDEX IF NOT EXISTS idx_user_interest_lookup ON public.sourcing_user_interest_profiles(user_id, dimension, score DESC);
CREATE INDEX IF NOT EXISTS idx_session_interest_lookup ON public.sourcing_user_interest_profiles(session_id, dimension, score DESC);

-- 3. Table: sourcing_recommendation_impressions
CREATE TABLE IF NOT EXISTS public.sourcing_recommendation_impressions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id text,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    surface text NOT NULL, -- HOME, SHOP, RADAR, PRODUCT_DETAIL, COMPARE, SEARCH
    context_tag text, -- RECOMMENDED_FOR_YOU, BECAUSE_YOU_COLLECT, COMPLETION, etc.
    position int DEFAULT 0,
    shown_at timestamptz DEFAULT now(),
    clicked boolean DEFAULT false,
    clicked_at timestamptz
);

COMMENT ON TABLE public.sourcing_recommendation_impressions IS 'Registro de impresiones y clics en recomendaciones para frequency cap y métricas CTR.';

CREATE INDEX IF NOT EXISTS idx_recom_impressions_freq ON public.sourcing_recommendation_impressions(user_id, session_id, product_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS idx_recom_impressions_surface ON public.sourcing_recommendation_impressions(surface, shown_at DESC);

-- 4. Table: sourcing_personalization_settings
CREATE TABLE IF NOT EXISTS public.sourcing_personalization_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.sourcing_personalization_settings IS 'Configuración central de la personalización (pesos de señales, time decay, frequency caps, ratios de diversidad).';

-- Seed default personalization settings
INSERT INTO public.sourcing_personalization_settings (key, value, description)
VALUES
    ('signal_weights', '{
        "VIEW": 1.0,
        "CATEGORY_OPEN": 1.5,
        "BRAND_OPEN": 1.5,
        "LICENSE_OPEN": 1.5,
        "RADAR_OPEN": 2.0,
        "PRODUCT_CLICK": 2.0,
        "PRODUCT_DETAIL_ENGAGE": 3.0,
        "SEARCH_INTENT": 3.0,
        "FILTER_APPLY": 3.0,
        "RADAR_PRODUCT_VIEW": 3.5,
        "COMPARE": 4.0,
        "WISHLIST": 6.0,
        "VAULT_OWNED": 8.0,
        "VAULT_WISHLIST": 6.0,
        "ADD_TO_CART": 8.0,
        "PRODUCT_ALERT": 8.0,
        "SHARE": 6.0,
        "PURCHASE": 12.0,
        "REPEATED_PURCHASE": 15.0,
        "REMOVE_WISHLIST": -4.0,
        "REMOVE_CART": -5.0,
        "HIDE_RECOMMENDATION": -6.0,
        "IMPRESSION_NO_CLICK": -0.2
    }'::jsonb, 'Pesos por tipo de señal de comportamiento'),
    ('time_decay_params', '{
        "half_life_days": 14.0,
        "vault_owned_decay_factor": 0.1,
        "purchase_decay_factor": 0.2
    }'::jsonb, 'Parámetros de degradación temporal (time decay)'),
    ('diversity_params', '{
        "exploration_ratio": 0.25,
        "max_consecutive_same_character": 2,
        "max_consecutive_same_line": 3
    }'::jsonb, 'Parámetros del motor de diversidad (Exploitation vs Exploration)'),
    ('frequency_cap_params', '{
        "max_impressions_without_click": 10,
        "penalty_weight": -15.0
    }'::jsonb, 'Parámetros de penalización por excesivas impresiones sin clic')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = now();

-- Enable RLS
ALTER TABLE public.sourcing_user_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_user_interest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_recommendation_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_personalization_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sourcing_user_signals
CREATE POLICY "Users can insert their own signals"
    ON public.sourcing_user_signals FOR INSERT
    WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can read their own signals"
    ON public.sourcing_user_signals FOR SELECT
    USING (auth.uid() IS NULL OR user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- RLS Policies for sourcing_user_interest_profiles
CREATE POLICY "Users can manage their interest profiles"
    ON public.sourcing_user_interest_profiles FOR ALL
    USING (auth.uid() IS NULL OR user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- RLS Policies for sourcing_recommendation_impressions
CREATE POLICY "Users can insert and view their impressions"
    ON public.sourcing_recommendation_impressions FOR ALL
    USING (auth.uid() IS NULL OR user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- RLS Policies for sourcing_personalization_settings
CREATE POLICY "Everyone can read personalization settings"
    ON public.sourcing_personalization_settings FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage personalization settings"
    ON public.sourcing_personalization_settings FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
