-- ==============================================================================
-- COLLECTIBLES 2026 — MULTICURRENCY CANONICAL UNIFICATION
-- Migration: 20261231090000_multicurrency_canonical_unification.sql
-- Description: Creates canonical currency_exchange_rates and history with strict RLS,
-- preserves existing USD/UYU = 42.5000 (brou_manual) as MANUAL_OVERRIDE with its
-- historical timestamp and 2% safety buffer, and creates a safe unidirectional
-- sync trigger from currency_exchange_rates to legacy site_exchange_rates.
-- ==============================================================================

-- 1. Create table currency_exchange_rates (Live Authoritative Currency Rates)
CREATE TABLE IF NOT EXISTS public.currency_exchange_rates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    country_code text NOT NULL, -- 'UY', 'AR', 'CL', 'PE', 'MX', 'EC'
    country_name text NOT NULL,
    base_currency text NOT NULL DEFAULT 'USD',
    quote_currency text NOT NULL, -- 'UYU', 'ARS', 'CLP', 'PEN', 'MXN', 'USD'
    rate numeric(14, 6) NOT NULL,
    provider text NOT NULL DEFAULT 'OPEN_EXCHANGE_RATES_API',
    source_name text NOT NULL,
    source_url text NOT NULL,
    status text NOT NULL DEFAULT 'VERIFIED', -- 'VERIFIED', 'STALE', 'UNAVAILABLE', 'MANUAL_OVERRIDE'
    safety_buffer_percent numeric(5, 2) NOT NULL DEFAULT 2.00,
    is_manual_override boolean NOT NULL DEFAULT false,
    override_reason text,
    override_admin_email text,
    override_expires_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    is_auto_sync boolean NOT NULL DEFAULT true,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    effective_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_currency_pair UNIQUE (base_currency, quote_currency)
);

-- 2. Create table currency_exchange_rate_history (Audit & Traceability)
CREATE TABLE IF NOT EXISTS public.currency_exchange_rate_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rate_id uuid REFERENCES public.currency_exchange_rates(id) ON DELETE CASCADE,
    base_currency text NOT NULL,
    quote_currency text NOT NULL,
    rate numeric(14, 6) NOT NULL,
    provider text NOT NULL,
    source_name text NOT NULL,
    source_url text NOT NULL,
    status text NOT NULL,
    safety_buffer_percent numeric(5, 2) NOT NULL DEFAULT 2.00,
    is_manual_override boolean NOT NULL DEFAULT false,
    reason text,
    admin_email text,
    effective_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS on both tables
ALTER TABLE public.currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_exchange_rate_history ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for currency_exchange_rates:
-- Public / Anon can view active exchange rates
DROP POLICY IF EXISTS "Public can view active currency exchange rates" ON public.currency_exchange_rates;
CREATE POLICY "Public can view active currency exchange rates"
    ON public.currency_exchange_rates FOR SELECT
    USING (is_active = true);

-- Service role and Admins have full access
DROP POLICY IF EXISTS "Admins and service role can manage currency exchange rates" ON public.currency_exchange_rates;
CREATE POLICY "Admins and service role can manage currency exchange rates"
    ON public.currency_exchange_rates FOR ALL
    TO authenticated, service_role
    USING (auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    ))
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    ));

-- 5. RLS Policies for currency_exchange_rate_history:
-- STRICT PRIVACY: Public can NOT see audit notes or admin emails. Only Admins and Service Role can view/manage.
DROP POLICY IF EXISTS "Public can view currency exchange rate history" ON public.currency_exchange_rate_history;
DROP POLICY IF EXISTS "Admins and service role can access exchange rate history" ON public.currency_exchange_rate_history;
CREATE POLICY "Admins and service role can access exchange rate history"
    ON public.currency_exchange_rate_history FOR ALL
    TO authenticated, service_role
    USING (auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    ))
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    ));

-- 6. Unidirectional Synchronization Trigger from Canonical (currency_exchange_rates) to Legacy (site_exchange_rates)
CREATE OR REPLACE FUNCTION public.sync_canonical_rate_to_legacy_site_rates()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.base_currency = 'USD' AND NEW.quote_currency = 'UYU' THEN
        INSERT INTO public.site_exchange_rates (
            currency_pair,
            rate,
            source,
            safety_buffer_percent,
            max_age_hours,
            is_active,
            updated_at
        ) VALUES (
            'USD_UYU',
            NEW.rate,
            NEW.source_name,
            NEW.safety_buffer_percent,
            24,
            NEW.is_active,
            NEW.updated_at
        )
        ON CONFLICT (currency_pair) DO UPDATE
        SET rate = EXCLUDED.rate,
            source = EXCLUDED.source,
            safety_buffer_percent = EXCLUDED.safety_buffer_percent,
            max_age_hours = EXCLUDED.max_age_hours,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_canonical_rate_to_legacy ON public.currency_exchange_rates;
CREATE TRIGGER trg_sync_canonical_rate_to_legacy
    AFTER INSERT OR UPDATE ON public.currency_exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_canonical_rate_to_legacy_site_rates();

-- 7. Controlled Seed / Data Migration with Preservation of Existing Values
-- Step 7A: Check if site_exchange_rates has USD_UYU and import it preserving rate=42.5000, source, timestamp and safety buffer
DO $$
DECLARE
    v_site_rate numeric;
    v_site_source text;
    v_site_buffer numeric;
    v_site_updated timestamptz;
BEGIN
    SELECT rate, source, safety_buffer_percent, updated_at
    INTO v_site_rate, v_site_source, v_site_buffer, v_site_updated
    FROM public.site_exchange_rates
    WHERE currency_pair = 'USD_UYU'
    LIMIT 1;

    IF FOUND AND v_site_rate IS NOT NULL THEN
        -- Insert as MANUAL_OVERRIDE preserving historical timestamp and buffer
        INSERT INTO public.currency_exchange_rates (
            country_code, country_name, base_currency, quote_currency,
            rate, provider, source_name, source_url, status,
            safety_buffer_percent, is_manual_override, override_reason, override_admin_email,
            is_active, is_auto_sync, fetched_at, effective_at, expires_at, created_at, updated_at
        ) VALUES (
            'UY', 'Uruguay', 'USD', 'UYU',
            v_site_rate, 'MANUAL_IMPORT_BROU', COALESCE(v_site_source, 'brou_manual'), 'https://www.bcu.gub.uy',
            'MANUAL_OVERRIDE', COALESCE(v_site_buffer, 2.00), true, 'Preserved legacy manual rate from site_exchange_rates', 'admin@collectibles.uy',
            true, false, v_site_updated, v_site_updated, v_site_updated + interval '24 hours', v_site_updated, v_site_updated
        )
        ON CONFLICT (base_currency, quote_currency) DO NOTHING;
    ELSE
        -- Fallback default if not found
        INSERT INTO public.currency_exchange_rates (
            country_code, country_name, base_currency, quote_currency,
            rate, provider, source_name, source_url, status,
            safety_buffer_percent, is_manual_override,
            is_active, is_auto_sync, fetched_at, effective_at, expires_at
        ) VALUES (
            'UY', 'Uruguay', 'USD', 'UYU',
            42.500000, 'FALLBACK_BENCHMARK', 'brou_manual', 'https://www.bcu.gub.uy',
            'STALE', 2.00, true, true, false, now() - interval '90 days', now() - interval '90 days', now() - interval '89 days'
        )
        ON CONFLICT (base_currency, quote_currency) DO NOTHING;
    END IF;

    -- Seed other regional pairs only if they do not exist, marked as STALE benchmark
    INSERT INTO public.currency_exchange_rates (
        country_code, country_name, base_currency, quote_currency,
        rate, provider, source_name, source_url, status,
        safety_buffer_percent, is_manual_override, is_active, is_auto_sync,
        fetched_at, effective_at, expires_at
    ) VALUES
    ('AR', 'Argentina', 'USD', 'ARS', 1528.756300, 'INSTITUTIONAL_BENCHMARK', 'Banco Central de la República Argentina', 'https://www.bcra.gob.ar/', 'STALE', 2.00, false, false, true, now() - interval '7 days', now() - interval '7 days', now() - interval '6 days'),
    ('CL', 'Chile', 'USD', 'CLP', 961.514000, 'INSTITUTIONAL_BENCHMARK', 'Banco Central de Chile', 'https://www.bcentral.cl/', 'STALE', 2.00, false, false, true, now() - interval '7 days', now() - interval '7 days', now() - interval '6 days'),
    ('PE', 'Perú', 'USD', 'PEN', 3.417800, 'INSTITUTIONAL_BENCHMARK', 'Banco Central de Reserva del Perú', 'https://www.bcrp.gob.pe/', 'STALE', 2.00, false, false, true, now() - interval '7 days', now() - interval '7 days', now() - interval '6 days'),
    ('MX', 'México', 'USD', 'MXN', 17.899200, 'INSTITUTIONAL_BENCHMARK', 'Banco de México (Banxico)', 'https://www.banxico.org.mx/', 'STALE', 2.00, false, false, true, now() - interval '7 days', now() - interval '7 days', now() - interval '6 days'),
    ('EC', 'Ecuador', 'USD', 'USD', 1.000000, 'CANONICAL_BENCHMARK', 'Banco Central del Ecuador (Dolarizado)', 'https://www.bce.fin.ec/', 'VERIFIED', 0.00, false, false, false, now(), now(), now() + interval '365 days')
    ON CONFLICT (base_currency, quote_currency) DO NOTHING;

    -- Create initial history entry only if history is empty
    IF NOT EXISTS (SELECT 1 FROM public.currency_exchange_rate_history LIMIT 1) THEN
        INSERT INTO public.currency_exchange_rate_history (
            rate_id, base_currency, quote_currency, rate, provider, source_name, source_url,
            status, safety_buffer_percent, is_manual_override, reason, admin_email, effective_at
        )
        SELECT id, base_currency, quote_currency, rate, provider, source_name, source_url,
               status, safety_buffer_percent, is_manual_override, 'Initial migration snapshot (preserved)', 'system@collectibles.uy', effective_at
        FROM public.currency_exchange_rates;
    END IF;
END $$;
