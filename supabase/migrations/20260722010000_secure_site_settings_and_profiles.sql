-- ═══════════════════════════════════════════════════════════════════════
-- CRITICAL SECURITY PATCH — Phase 2
-- Closes: site_settings secret exposure + profiles PII leak
-- Date: 2026-05-22
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════
-- 1. CREATE public_site_config TABLE
--    Safe, publicly-readable configuration for the frontend
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.public_site_config (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT '',
  value_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.public_site_config ENABLE ROW LEVEL SECURITY;

-- Anyone can READ public config (safe keys only)
DROP POLICY IF EXISTS "public_site_config_select_all" ON public.public_site_config;
CREATE POLICY "public_site_config_select_all"
  ON public.public_site_config
  FOR SELECT
  USING (true);

-- Only admins can modify public config
DROP POLICY IF EXISTS "public_site_config_admin_all" ON public.public_site_config;
CREATE POLICY "public_site_config_admin_all"
  ON public.public_site_config
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════
-- 2. COPY SAFE KEYS from site_settings → public_site_config
--    Everything EXCEPT payment tokens, API keys, and secrets
-- ═══════════════════════════════════════════════════════

INSERT INTO public.public_site_config (key, value, value_json, updated_at)
SELECT key, value, value_json, COALESCE(updated_at, now())
FROM public.site_settings
WHERE key NOT IN (
  -- Payment provider secrets
  'payments_mercadopago_access_token',
  'payments_dlocal_go_api_key',
  'payments_dlocal_go_secret_key',
  'payments_dlocal_go_smartfields_key',
  'payments_paypal_client_id',
  'payments_paypal_client_secret',
  'payments_paypal_secret_key',
  -- MercadoLibre OAuth secrets
  'mercadolibre_access_token',
  'mercadolibre_client_id',
  -- Logistics provider secrets
  'shipping_soydelivery_api_key',
  'shipping_soydelivery_api_id',
  'shipping_soydelivery_negocio_clave',
  'shipping_soydelivery_negocio_id'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      value_json = EXCLUDED.value_json,
      updated_at = EXCLUDED.updated_at;

-- ═══════════════════════════════════════════════════════
-- 3. LOCK DOWN site_settings — ADMIN ONLY
--    Remove the public SELECT that exposes all secrets
-- ═══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "settings_select_all" ON public.site_settings;

-- settings_admin (ALL for is_admin()) already exists from Phase 1

-- ═══════════════════════════════════════════════════════
-- 4. FIX profiles — REMOVE PUBLIC SELECT + CLEAN DUPLICATES
--    Keeps Phase 1 policies (scoped to authenticated role)
-- ═══════════════════════════════════════════════════════

-- Remove the dangerous public SELECT (anyone can list all users)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Remove duplicate old policies (replaced by Phase 1 policies)
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Phase 1 policies remain active:
--   profiles_admin_all    (ALL, is_admin())
--   profiles_insert_self  (INSERT, authenticated, with_check auth.uid()=id)
--   profiles_select_own   (SELECT, authenticated, auth.uid()=id)
--   profiles_update_own   (UPDATE, authenticated, auth.uid()=id)

COMMIT;
