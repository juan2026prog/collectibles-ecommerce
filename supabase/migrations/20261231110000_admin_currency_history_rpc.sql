-- ==============================================================================
-- COLLECTIBLES 2026 — ADMIN RPC FOR CURRENCY EXCHANGE RATE HISTORY
-- Migration: 20261231110000_admin_currency_history_rpc.sql
-- Description: Creates a secure RPC get_admin_currency_history that validates
-- admin privileges, allowing authenticated administrators to view audit history
-- without granting public or general SELECT on currency_exchange_rate_history.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_currency_history(p_quote_currency text DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    rate_id uuid,
    base_currency text,
    quote_currency text,
    rate numeric,
    provider text,
    source_name text,
    source_url text,
    status text,
    safety_buffer_percent numeric,
    is_manual_override boolean,
    reason text,
    admin_email text,
    effective_at timestamptz,
    recorded_at timestamptz
) AS $$
DECLARE
    v_role text;
    v_is_admin boolean := false;
BEGIN
    v_role := auth.jwt() ->> 'role';
    
    -- Check if service_role or admin user
    IF v_role = 'service_role' THEN
        v_is_admin := true;
    ELSIF auth.uid() IS NOT NULL THEN
        SELECT is_admin INTO v_is_admin
        FROM public.profiles
        WHERE profiles.id = auth.uid();
    END IF;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Acceso denegado: Se requieren privilegios de administrador para consultar el historial de cotizaciones.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        h.id,
        h.rate_id,
        h.base_currency,
        h.quote_currency,
        h.rate,
        h.provider,
        h.source_name,
        h.source_url,
        h.status,
        h.safety_buffer_percent,
        h.is_manual_override,
        h.reason,
        h.admin_email,
        h.effective_at,
        h.recorded_at
    FROM public.currency_exchange_rate_history h
    WHERE (p_quote_currency IS NULL OR h.quote_currency = p_quote_currency)
    ORDER BY h.recorded_at DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke execute from public and anon
REVOKE ALL ON FUNCTION public.get_admin_currency_history(text) FROM PUBLIC, anon;
-- Grant execute to authenticated users (internal check verifies is_admin) and service_role
GRANT EXECUTE ON FUNCTION public.get_admin_currency_history(text) TO authenticated, service_role;
