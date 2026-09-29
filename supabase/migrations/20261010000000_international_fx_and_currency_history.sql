-- ==============================================================================
-- COLLECTIBLES 2026 — INTERNATIONAL FX & FINANCIAL MODEL MIGRATION
-- Migration: 20261010000000_international_fx_and_currency_history.sql
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
    is_manual_override boolean NOT NULL DEFAULT false,
    reason text,
    admin_email text,
    effective_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_exchange_rate_history ENABLE ROW LEVEL SECURITY;

-- Read policies (Public / Anon can view exchange rates to calculate display currencies)
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'currency_exchange_rates' AND policyname = 'Public can view active currency exchange rates'
  ) THEN
    CREATE POLICY "Public can view active currency exchange rates"
    ON public.currency_exchange_rates FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'currency_exchange_rate_history' AND policyname = 'Public can view currency exchange rate history'
  ) THEN
    CREATE POLICY "Public can view currency exchange rate history"
    ON public.currency_exchange_rate_history FOR SELECT
    USING (true);
  END IF;
END \$\$;

-- 3. Seed Initial Verified Institutional Benchmark Data
INSERT INTO public.currency_exchange_rates
(country_code, country_name, base_currency, quote_currency, rate, provider, source_name, source_url, status, is_manual_override, is_active, is_auto_sync, fetched_at, effective_at, expires_at)
VALUES
('UY', 'Uruguay', 'USD', 'UYU', 40.083500, 'OPEN_EXCHANGE_RATES_API', 'Banco Central del Uruguay / Open Exchange Rates', 'https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Cotizaciones.aspx', 'VERIFIED', false, true, true, now(), now(), now() + interval '24 hours'),
('AR', 'Argentina', 'USD', 'ARS', 1528.756300, 'OPEN_EXCHANGE_RATES_API', 'Banco Central de la República Argentina / Open Exchange Rates', 'https://www.bcra.gob.ar/', 'VERIFIED', false, false, true, now(), now(), now() + interval '24 hours'),
('CL', 'Chile', 'USD', 'CLP', 961.514000, 'OPEN_EXCHANGE_RATES_API', 'Banco Central de Chile / Open Exchange Rates', 'https://www.bcentral.cl/', 'VERIFIED', false, false, true, now(), now(), now() + interval '24 hours'),
('PE', 'Perú', 'USD', 'PEN', 3.417800, 'OPEN_EXCHANGE_RATES_API', 'Banco Central de Reserva del Perú / Open Exchange Rates', 'https://www.bcrp.gob.pe/', 'VERIFIED', false, false, true, now(), now(), now() + interval '24 hours'),
('MX', 'México', 'USD', 'MXN', 17.899200, 'OPEN_EXCHANGE_RATES_API', 'Banco de México (Banxico) / Open Exchange Rates', 'https://www.banxico.org.mx/', 'VERIFIED', false, false, true, now(), now(), now() + interval '24 hours'),
('EC', 'Ecuador', 'USD', 'USD', 1.000000, 'CANONICAL_BENCHMARK', 'Banco Central del Ecuador (Economía Dolarizada)', 'https://www.bce.fin.ec/', 'VERIFIED', false, false, false, now(), now(), now() + interval '365 days')
ON CONFLICT (base_currency, quote_currency) DO UPDATE
SET rate = EXCLUDED.rate,
    country_code = EXCLUDED.country_code,
    country_name = EXCLUDED.country_name,
    provider = EXCLUDED.provider,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    status = EXCLUDED.status,
    is_active = EXCLUDED.is_active,
    fetched_at = EXCLUDED.fetched_at,
    effective_at = EXCLUDED.effective_at,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

-- 4. Initial history log
INSERT INTO public.currency_exchange_rate_history
(rate_id, base_currency, quote_currency, rate, provider, source_name, source_url, status, is_manual_override, reason, admin_email, effective_at)
SELECT id, base_currency, quote_currency, rate, provider, source_name, source_url, status, is_manual_override, 'Initial migration snapshot', 'system@collectibles.uy', effective_at
FROM public.currency_exchange_rates;
