-- ==============================================================================
-- COLLECTIBLES 2026 — MULTICURRENCY PERMISSION HARDENING & COLUMN RESTRICTION
-- Migration: 20261231100000_multicurrency_permission_hardening.sql
-- Description: Revokes TRUNCATE, TRIGGER, REFERENCES, INSERT, UPDATE, DELETE
-- from anon and authenticated on currency tables. Restricts public SELECT on
-- currency_exchange_rates to public columns only, completely hiding administrative
-- email, override reason and internal audit data from anonymous and client callers.
-- ==============================================================================

-- 1. REVOKE all excess table-level privileges from anon and authenticated
REVOKE TRUNCATE, TRIGGER, REFERENCES, INSERT, UPDATE, DELETE ON public.currency_exchange_rates FROM anon, authenticated, public;
REVOKE TRUNCATE, TRIGGER, REFERENCES, INSERT, UPDATE, DELETE, SELECT ON public.currency_exchange_rate_history FROM anon, authenticated, public;

-- 2. Restrict SELECT on currency_exchange_rates for public/anon/authenticated:
-- Revoke all table-level SELECT from anon and authenticated
REVOKE SELECT ON public.currency_exchange_rates FROM anon, authenticated, public;

-- Grant column-level SELECT ONLY on safe, non-administrative columns
GRANT SELECT (
    id,
    country_code,
    country_name,
    base_currency,
    quote_currency,
    rate,
    provider,
    source_name,
    source_url,
    status,
    safety_buffer_percent,
    is_manual_override,
    is_active,
    is_auto_sync,
    fetched_at,
    effective_at,
    expires_at,
    created_at,
    updated_at
) ON public.currency_exchange_rates TO anon, authenticated;

-- Explicitly verify override_admin_email and override_reason are NOT granted to anon/authenticated.

-- 3. Maintain full privileges for service_role and postgres
GRANT ALL PRIVILEGES ON public.currency_exchange_rates TO service_role, postgres;
GRANT ALL PRIVILEGES ON public.currency_exchange_rate_history TO service_role, postgres;

-- 4. Enable RLS and verify policies
ALTER TABLE public.currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_exchange_rate_history ENABLE ROW LEVEL SECURITY;

-- Ensure public view policy only allows active rates
DROP POLICY IF EXISTS "Public can view active currency exchange rates" ON public.currency_exchange_rates;
CREATE POLICY "Public can view active currency exchange rates"
    ON public.currency_exchange_rates FOR SELECT
    TO anon, authenticated, public
    USING (is_active = true);

-- Admins and Service Role have full management
DROP POLICY IF EXISTS "Admins and service role can manage currency exchange rates" ON public.currency_exchange_rates;
CREATE POLICY "Admins and service role can manage currency exchange rates"
    ON public.currency_exchange_rates FOR ALL
    TO authenticated, service_role
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    )
    WITH CHECK (
        auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Admins and service role can access exchange rate history" ON public.currency_exchange_rate_history;
CREATE POLICY "Admins and service role can access exchange rate history"
    ON public.currency_exchange_rate_history FOR ALL
    TO authenticated, service_role
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    )
    WITH CHECK (
        auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );
