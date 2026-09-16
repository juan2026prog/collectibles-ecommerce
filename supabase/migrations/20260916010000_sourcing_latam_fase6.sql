-- ==============================================================================
-- MIGRATION: SOURCING INTELLIGENCE FASE 6 — LATAM MULTI-COUNTRY ENGINE
-- Adds schema for Country Engine, Country Rules, Exchange Rates,
-- Multi-Country Product Availability, Marketplace Adapters & Risk Events.
-- ==============================================================================

-- 1. Table: sourcing_countries
CREATE TABLE IF NOT EXISTS public.sourcing_countries (
    country_code text PRIMARY KEY, -- 'UY', 'AR', 'CL', 'BR', 'PE', 'CO', 'MX', 'PY'
    country_name text NOT NULL,
    currency text NOT NULL, -- 'USD', 'UYU', 'ARS', 'CLP', 'BRL', 'PEN', 'COP', 'MXN', 'PYG'
    locale text NOT NULL,
    timezone text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    sourcing_enabled boolean NOT NULL DEFAULT false,
    publication_enabled boolean NOT NULL DEFAULT false,
    readiness_score int NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Seed default countries
INSERT INTO public.sourcing_countries (country_code, country_name, currency, locale, timezone, enabled, sourcing_enabled, publication_enabled, readiness_score)
VALUES 
    ('UY', 'Uruguay', 'UYU', 'es-UY', 'America/Montevideo', true, true, true, 100),
    ('AR', 'Argentina', 'ARS', 'es-AR', 'America/Argentina/Buenos_Aires', false, false, false, 40),
    ('CL', 'Chile', 'CLP', 'es-CL', 'America/Santiago', false, false, false, 45),
    ('BR', 'Brasil', 'BRL', 'pt-BR', 'America/Sao_Paulo', false, false, false, 35),
    ('PE', 'Perú', 'PEN', 'es-PE', 'America/Lima', false, false, false, 30),
    ('CO', 'Colombia', 'COP', 'es-CO', 'America/Bogota', false, false, false, 30),
    ('MX', 'México', 'MXN', 'es-MX', 'America/Mexico_City', false, false, false, 35),
    ('PY', 'Paraguay', 'PYG', 'es-PY', 'America/Asuncion', false, false, false, 25)
ON CONFLICT (country_code) DO UPDATE SET
    country_name = EXCLUDED.country_name,
    currency = EXCLUDED.currency;

-- 2. Table: sourcing_country_rules
CREATE TABLE IF NOT EXISTS public.sourcing_country_rules (
    country_code text PRIMARY KEY REFERENCES public.sourcing_countries(country_code) ON DELETE CASCADE,
    max_franchise_value_usd numeric(10,2) NOT NULL DEFAULT 200.00,
    max_franchise_weight_lbs numeric(8,2) NOT NULL DEFAULT 4.40, -- ~2kg
    max_franchise_shipments_per_year int NOT NULL DEFAULT 3,
    standard_import_tax_percent numeric(5,2) NOT NULL DEFAULT 60.00,
    vat_tax_percent numeric(5,2) NOT NULL DEFAULT 22.00,
    customs_handling_fee_usd numeric(10,2) NOT NULL DEFAULT 15.00,
    min_target_margin_percent numeric(5,2) NOT NULL DEFAULT 15.00,
    prohibited_categories text[] DEFAULT ARRAY[]::text[],
    restricted_categories text[] DEFAULT ARRAY[]::text[],
    allowed_categories text[] DEFAULT ARRAY[]::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    updated_at timestamptz DEFAULT now()
);

-- Seed baseline rules for Uruguay and LATAM defaults
INSERT INTO public.sourcing_country_rules (
    country_code, max_franchise_value_usd, max_franchise_weight_lbs, max_franchise_shipments_per_year,
    standard_import_tax_percent, vat_tax_percent, customs_handling_fee_usd, min_target_margin_percent,
    prohibited_categories, restricted_categories
)
VALUES 
    ('UY', 200.00, 4.40, 3, 60.00, 22.00, 15.00, 15.00, ARRAY['combustibles', 'armas', 'semillas'], ARRAY['baterias_litio', 'suplementos']),
    ('AR', 50.00, 11.00, 12, 50.00, 21.00, 10.00, 20.00, ARRAY['armas'], ARRAY['baterias_litio']),
    ('CL', 41.00, 11.00, 12, 6.00, 19.00, 8.00, 18.00, ARRAY['armas'], ARRAY['baterias_litio']),
    ('BR', 50.00, 11.00, 12, 60.00, 17.00, 12.00, 25.00, ARRAY['armas'], ARRAY['baterias_litio']),
    ('PE', 200.00, 11.00, 12, 0.00, 18.00, 10.00, 18.00, ARRAY['armas'], ARRAY['baterias_litio']),
    ('CO', 200.00, 11.00, 12, 0.00, 19.00, 10.00, 18.00, ARRAY['armas'], ARRAY['baterias_litio']),
    ('MX', 50.00, 11.00, 12, 19.00, 16.00, 10.00, 18.00, ARRAY['armas'], ARRAY['baterias_litio']),
    ('PY', 100.00, 11.00, 12, 10.00, 10.00, 8.00, 20.00, ARRAY['armas'], ARRAY['baterias_litio'])
ON CONFLICT (country_code) DO NOTHING;

-- 3. Table: sourcing_country_marketplaces
CREATE TABLE IF NOT EXISTS public.sourcing_country_marketplaces (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    country_code text NOT NULL REFERENCES public.sourcing_countries(country_code) ON DELETE CASCADE,
    marketplace_id text NOT NULL, -- 'mercado_libre_uy', 'mercado_libre_ar', 'amazon_br', etc.
    marketplace_name text NOT NULL,
    adapter_status text NOT NULL DEFAULT 'NO_CONFIGURADO', -- 'OPERATIVO', 'NO_CONFIGURADO', 'NO_VERIFICADO', 'ERROR'
    api_endpoint text,
    fee_percent numeric(5,2) DEFAULT 13.00,
    last_health_check_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Seed default market connectors
INSERT INTO public.sourcing_country_marketplaces (country_code, marketplace_id, marketplace_name, adapter_status, fee_percent)
VALUES
    ('UY', 'mercado_libre_uy', 'Mercado Libre Uruguay', 'OPERATIVO', 13.00),
    ('AR', 'mercado_libre_ar', 'Mercado Libre Argentina', 'NO_CONFIGURADO', 14.00),
    ('CL', 'mercado_libre_cl', 'Mercado Libre Chile', 'NO_CONFIGURADO', 12.50),
    ('BR', 'mercado_libre_br', 'Mercado Livre Brasil', 'NO_CONFIGURADO', 14.00),
    ('MX', 'mercado_libre_mx', 'Mercado Libre México', 'NO_CONFIGURADO', 13.00)
ON CONFLICT DO NOTHING;

-- 4. Table: sourcing_exchange_rates
CREATE TABLE IF NOT EXISTS public.sourcing_exchange_rates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    base_currency text NOT NULL DEFAULT 'USD',
    target_currency text NOT NULL,
    rate numeric(14,6) NOT NULL,
    source text NOT NULL DEFAULT 'central_bank_or_api',
    status text NOT NULL DEFAULT 'ACTUALIZADO', -- 'ACTUALIZADO', 'DESACTUALIZADO', 'NO_DISPONIBLE'
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(base_currency, target_currency)
);

-- Seed default rates vs USD
INSERT INTO public.sourcing_exchange_rates (base_currency, target_currency, rate, source, status)
VALUES
    ('USD', 'USD', 1.000000, 'system', 'ACTUALIZADO'),
    ('USD', 'UYU', 40.500000, 'bcu', 'ACTUALIZADO'),
    ('USD', 'ARS', 1250.000000, 'bcra', 'ACTUALIZADO'),
    ('USD', 'CLP', 940.000000, 'bcc', 'ACTUALIZADO'),
    ('USD', 'BRL', 5.600000, 'bcb', 'ACTUALIZADO'),
    ('USD', 'PEN', 3.750000, 'bcrp', 'ACTUALIZADO'),
    ('USD', 'COP', 4100.000000, 'banrep', 'ACTUALIZADO'),
    ('USD', 'MXN', 19.800000, 'banxico', 'ACTUALIZADO'),
    ('USD', 'PYG', 7600.000000, 'bcp', 'ACTUALIZADO')
ON CONFLICT (base_currency, target_currency) DO UPDATE SET
    rate = EXCLUDED.rate,
    status = EXCLUDED.status,
    updated_at = now();

-- 5. Table: sourcing_product_country_availability
CREATE TABLE IF NOT EXISTS public.sourcing_product_country_availability (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id text NOT NULL, -- canonical_id or canonical_sku
    country_code text NOT NULL REFERENCES public.sourcing_countries(country_code) ON DELETE CASCADE,
    available boolean NOT NULL DEFAULT false,
    sellable boolean NOT NULL DEFAULT false,
    importable boolean NOT NULL DEFAULT true,
    best_source text,
    landed_cost_usd numeric(10,2),
    suggested_price_usd numeric(10,2),
    estimated_margin_percent numeric(5,2),
    delivery_min_days int DEFAULT 5,
    delivery_max_days int DEFAULT 12,
    opportunity_score int NOT NULL DEFAULT 0,
    confidence_score int NOT NULL DEFAULT 0,
    market_gap_score int NOT NULL DEFAULT 0,
    updated_at timestamptz DEFAULT now(),
    UNIQUE(product_id, country_code)
);

CREATE INDEX IF NOT EXISTS idx_country_avail_product ON public.sourcing_product_country_availability(product_id);
CREATE INDEX IF NOT EXISTS idx_country_avail_country ON public.sourcing_product_country_availability(country_code);

-- 6. Table: sourcing_risk_events
CREATE TABLE IF NOT EXISTS public.sourcing_risk_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id text NOT NULL,
    country_code text NOT NULL,
    risk_level text NOT NULL DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH', 'BLOCKED'
    reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- RLS Security Policies
ALTER TABLE public.sourcing_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_country_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_country_marketplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_product_country_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_risk_events ENABLE ROW LEVEL SECURITY;

-- Allow public read of enabled countries, exchange rates, and availability
CREATE POLICY "Public read active sourcing_countries"
ON public.sourcing_countries FOR SELECT USING (enabled = true);

CREATE POLICY "Public read sourcing_exchange_rates"
ON public.sourcing_exchange_rates FOR SELECT USING (true);

CREATE POLICY "Public read product_country_availability"
ON public.sourcing_product_country_availability FOR SELECT USING (available = true AND sellable = true);

-- Allow full access for authenticated admins
CREATE POLICY "Admins full access sourcing_countries"
ON public.sourcing_countries FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_country_rules"
ON public.sourcing_country_rules FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_country_marketplaces"
ON public.sourcing_country_marketplaces FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_exchange_rates"
ON public.sourcing_exchange_rates FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_product_country_availability"
ON public.sourcing_product_country_availability FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

CREATE POLICY "Admins full access sourcing_risk_events"
ON public.sourcing_risk_events FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));
