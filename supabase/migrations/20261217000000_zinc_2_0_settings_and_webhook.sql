-- Migration: 20261217000000_zinc_2_0_settings_and_webhook.sql
-- Description: Standardize Zinc 2.0 integration settings, Vault RPCs with zn_live_ enforcement, and signed webhook events table.

-- 1. Create table public.zinc_integration_settings if not exists
CREATE TABLE IF NOT EXISTS public.zinc_integration_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
    is_configured BOOLEAN NOT NULL DEFAULT false,
    key_prefix TEXT,
    key_last4 TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    last_tested_at TIMESTAMPTZ,
    last_test_status TEXT,
    last_test_message TEXT,
    webhook_url TEXT,
    webhook_secret_prefix TEXT,
    webhook_secret_last4 TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT zinc_integration_settings_environment_key UNIQUE (environment)
);

-- Ensure initial records for sandbox and production
INSERT INTO public.zinc_integration_settings (environment, is_configured, is_enabled, webhook_url)
VALUES 
    ('sandbox', false, true, 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-webhook'),
    ('production', false, false, 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-webhook')
ON CONFLICT (environment) DO UPDATE SET
    webhook_url = EXCLUDED.webhook_url;

-- Enable RLS on zinc_integration_settings
ALTER TABLE public.zinc_integration_settings ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies for zinc_integration_settings
DROP POLICY IF EXISTS "Admin users can view zinc settings" ON public.zinc_integration_settings;
CREATE POLICY "Admin users can view zinc settings"
    ON public.zinc_integration_settings
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Service role full access on zinc settings" ON public.zinc_integration_settings;
CREATE POLICY "Service role full access on zinc settings"
    ON public.zinc_integration_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. Create table public.zinc_webhook_events if not exists
CREATE TABLE IF NOT EXISTS public.zinc_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zinc_order_id TEXT,
    return_id TEXT,
    event_type TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
    status TEXT,
    event_timestamp TIMESTAMPTZ,
    received_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ DEFAULT now(),
    payload_sha256 TEXT,
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Adjust deduplication constraint: UNIQUE(environment, payload_sha256)
DO $$
BEGIN
    -- Drop old single-column unique constraint if present
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_zinc_webhook_payload_sha256' 
        AND conrelid = 'public.zinc_webhook_events'::regclass
    ) THEN
        ALTER TABLE public.zinc_webhook_events DROP CONSTRAINT uq_zinc_webhook_payload_sha256;
    END IF;

    -- Create multi-column unique constraint if not present
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_zinc_webhook_env_payload_sha256' 
        AND conrelid = 'public.zinc_webhook_events'::regclass
    ) THEN
        ALTER TABLE public.zinc_webhook_events 
        ADD CONSTRAINT uq_zinc_webhook_env_payload_sha256 UNIQUE (environment, payload_sha256);
    END IF;
END $$;

-- Enable RLS on zinc_webhook_events
ALTER TABLE public.zinc_webhook_events ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies for zinc_webhook_events
DROP POLICY IF EXISTS "Admin users can view zinc webhook events" ON public.zinc_webhook_events;
CREATE POLICY "Admin users can view zinc webhook events"
    ON public.zinc_webhook_events
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Service role full access on zinc webhook events" ON public.zinc_webhook_events;
CREATE POLICY "Service role full access on zinc webhook events"
    ON public.zinc_webhook_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. Vault RPC: get_zinc_vault_secret
-- Restricted strictly to service_role and postgres
CREATE OR REPLACE FUNCTION public.get_zinc_vault_secret(p_environment text, p_secret_type text DEFAULT 'api_key'::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'pg_temp'
AS $$
DECLARE
    v_secret_name text;
    v_decrypted text;
BEGIN
    v_secret_name := 'zinc_' || p_secret_type || '_' || p_environment;

    SELECT decrypted_secret INTO v_decrypted
    FROM vault.decrypted_secrets
    WHERE name = v_secret_name
    LIMIT 1;

    RETURN v_decrypted;
END;
$$;

-- Enforce strict permission restriction: revoke all from public/anon/authenticated
REVOKE ALL ON FUNCTION public.get_zinc_vault_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_zinc_vault_secret(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_zinc_vault_secret(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_zinc_vault_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_zinc_vault_secret(text, text) TO postgres;

-- 4. Vault RPC: set_zinc_vault_secret
-- Admin-only function to set API keys or webhook secrets with strict prefix validation
CREATE OR REPLACE FUNCTION public.set_zinc_vault_secret(
    p_environment text, 
    p_secret text, 
    p_secret_type text DEFAULT 'api_key'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'pg_temp'
AS $$
DECLARE
    v_secret_name text;
    v_prefix text;
    v_last4 text;
    v_secret_id uuid;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Se requieren permisos de Administrador para gestionar credenciales de Zinc';
    END IF;

    IF p_environment NOT IN ('sandbox', 'production') THEN
        RAISE EXCEPTION 'Entorno no válido. Debe ser sandbox o production';
    END IF;

    IF p_secret IS NULL OR length(trim(p_secret)) < 10 THEN
        RAISE EXCEPTION 'Formato de secreto inválido o demasiado corto';
    END IF;

    IF p_secret_type = 'api_key' THEN
        IF p_environment = 'sandbox' AND NOT (p_secret LIKE 'zn_test_%') THEN
            RAISE EXCEPTION 'La credencial de Sandbox debe comenzar con el prefijo oficial zn_test_';
        END IF;

        IF p_environment = 'production' THEN
            IF p_secret LIKE 'zn_test_%' THEN
                RAISE EXCEPTION 'SEGURIDAD: No puedes guardar una clave zn_test_ de Sandbox en Producción';
            END IF;
            IF NOT (p_secret LIKE 'zn_live_%') THEN
                RAISE EXCEPTION 'La credencial de Producción debe comenzar con el prefijo oficial zn_live_';
            END IF;
        END IF;
    ELSIF p_secret_type = 'webhook_secret' THEN
        IF NOT (p_secret LIKE 'zn_whsec_%') THEN
            RAISE EXCEPTION 'El secreto de webhook debe comenzar con el prefijo zn_whsec_';
        END IF;
    ELSE
        RAISE EXCEPTION 'Tipo de secreto desconocido: %', p_secret_type;
    END IF;

    v_secret_name := 'zinc_' || p_secret_type || '_' || p_environment;
    v_prefix := substring(p_secret from 1 for 8);
    v_last4 := substring(p_secret from (length(p_secret) - 3) for 4);

    BEGIN
        SELECT id INTO v_secret_id FROM vault.secrets WHERE name = v_secret_name LIMIT 1;
        IF v_secret_id IS NOT NULL THEN
            UPDATE vault.secrets 
            SET secret = p_secret, 
                updated_at = now() 
            WHERE id = v_secret_id;
        ELSE
            INSERT INTO vault.secrets (secret, name, description)
            VALUES (p_secret, v_secret_name, 'Zinc ' || p_environment || ' ' || p_secret_type);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            PERFORM vault.create_secret(p_secret, v_secret_name, 'Zinc ' || p_environment || ' ' || p_secret_type);
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Error persistiendo en Supabase Vault: %', SQLERRM;
        END;
    END;

    IF p_secret_type = 'api_key' THEN
        UPDATE public.zinc_integration_settings
        SET is_configured = true,
            key_prefix = v_prefix,
            key_last4 = v_last4,
            updated_at = now(),
            updated_by = auth.uid()
        WHERE environment = p_environment;
    ELSIF p_secret_type = 'webhook_secret' THEN
        UPDATE public.zinc_integration_settings
        SET webhook_secret_prefix = v_prefix,
            webhook_secret_last4 = v_last4,
            updated_at = now(),
            updated_by = auth.uid()
        WHERE environment = p_environment;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'environment', p_environment,
        'type', p_secret_type,
        'prefix', v_prefix,
        'last4', v_last4
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_zinc_vault_secret(text, text, text) TO authenticated;
