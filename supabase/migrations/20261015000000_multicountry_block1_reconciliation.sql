-- ==============================================================================
-- MIGRATION: 20261015000000_multicountry_block1_reconciliation.sql
-- Description:
--   Bloque 1 Reconciliación: International Markets & Catálogo Mínimo (Wishlist)
--
-- Objetivos y Salvaguardas:
--   1. Crea public.international_markets con estados seguros:
--      - Uruguay: LIVE, public_enabled=true, checkout_enabled=true, commerce_mode='FULL_COMMERCE'
--      - Argentina: DISABLED, public_enabled=false, checkout_enabled=false, commerce_mode='INTERNATIONAL_ONLY'
--      - Chile, Perú, Colombia, Ecuador: PREVIEW, checkout_enabled=false, commerce_mode='INTERNATIONAL_ONLY'
--      - México, Brasil: DISABLED, checkout_enabled=false, commerce_mode='INTERNATIONAL_ONLY'
--   2. Habilita RLS estricto en international_markets (Lectura pública, Escritura solo admins)
--   3. Registra de forma segura el provider 'skypostal' en shipping_providers si no existe
--   4. Crea las tablas de Catálogo Mínimo y Wishlist Ligera:
--      - external_product_interest (métricas agregadas)
--      - user_external_wishlist (relación atómica usuario-ASIN)
--   5. Crea las funciones RPC atómicas con SECURITY DEFINER y search_path=public:
--      - record_external_product_view() con debounce de 10s
--      - toggle_external_product_wishlist()
--   6. Configura columnas en international_sync_settings para umbral configurable (10)
--   7. CERO mutación ni alteración sobre tablas y pedidos de Uruguay
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Tabla: international_markets
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.international_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,
  country_name text NOT NULL,
  currency text NOT NULL,
  logistics_mode text NOT NULL CHECK (logistics_mode IN ('IMPORT_HUB', 'SKYPOSTAL')),
  commerce_mode text NOT NULL DEFAULT 'INTERNATIONAL_ONLY' CHECK (commerce_mode IN ('FULL_COMMERCE', 'INTERNATIONAL_ONLY')),
  market_status text NOT NULL DEFAULT 'DISABLED' CHECK (market_status IN ('DISABLED', 'PREVIEW', 'SANDBOX', 'READY_FOR_LIVE', 'LIVE')),
  public_enabled boolean NOT NULL DEFAULT false,
  checkout_enabled boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'skypostal',
  provider_environment text NOT NULL DEFAULT 'test' CHECK (provider_environment IN ('test', 'production')),
  preview_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS para international_markets
ALTER TABLE public.international_markets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view international_markets" ON public.international_markets;
CREATE POLICY "Public can view international_markets" ON public.international_markets
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage international_markets" ON public.international_markets;
CREATE POLICY "Admins manage international_markets" ON public.international_markets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Seed seguro de mercados: Solo Uruguay es LIVE con checkout habilitado
INSERT INTO public.international_markets (
  country_code,
  country_name,
  currency,
  logistics_mode,
  commerce_mode,
  market_status,
  public_enabled,
  checkout_enabled,
  provider,
  provider_environment,
  preview_enabled,
  sort_order,
  metadata
) VALUES
  ('UY', 'Uruguay', 'UYU', 'IMPORT_HUB', 'FULL_COMMERCE', 'LIVE', true, true, 'import_hub', 'production', true, 1, '{"flag": "🇺🇾", "tax_regime": "franquicia_uruguay"}'::jsonb),
  ('AR', 'Argentina', 'ARS', 'IMPORT_HUB', 'INTERNATIONAL_ONLY', 'DISABLED', false, false, 'import_hub', 'test', true, 2, '{"flag": "🇦🇷", "tax_regime": "franquicia_argentina", "notes": "En espera de certificación Deblex"}'::jsonb),
  ('CL', 'Chile', 'CLP', 'SKYPOSTAL', 'INTERNATIONAL_ONLY', 'PREVIEW', false, false, 'skypostal', 'test', true, 3, '{"flag": "🇨🇱", "target_tier": "tier_1", "lead_market": true, "notes": "SkyPostal Lead Market"}'::jsonb),
  ('PE', 'Perú', 'PEN', 'SKYPOSTAL', 'INTERNATIONAL_ONLY', 'PREVIEW', false, false, 'skypostal', 'test', true, 4, '{"flag": "🇵🇪", "target_tier": "tier_2"}'::jsonb),
  ('BR', 'Brasil', 'BRL', 'SKYPOSTAL', 'INTERNATIONAL_ONLY', 'DISABLED', false, false, 'skypostal', 'test', false, 5, '{"flag": "🇧🇷", "target_tier": "tier_2", "notes": "Fuera de la expansión comercial inicial"}'::jsonb),
  ('CO', 'Colombia', 'COP', 'SKYPOSTAL', 'INTERNATIONAL_ONLY', 'PREVIEW', false, false, 'skypostal', 'test', true, 6, '{"flag": "🇨🇴", "target_tier": "tier_2"}'::jsonb),
  ('EC', 'Ecuador', 'USD', 'SKYPOSTAL', 'INTERNATIONAL_ONLY', 'PREVIEW', false, false, 'skypostal', 'test', true, 7, '{"flag": "🇪🇨", "target_tier": "tier_2"}'::jsonb),
  ('MX', 'México', 'MXN', 'SKYPOSTAL', 'INTERNATIONAL_ONLY', 'DISABLED', false, false, 'skypostal', 'test', false, 8, '{"flag": "🇲🇽", "target_tier": "tier_3", "notes": "Disabled pending future certification"}'::jsonb)
ON CONFLICT (country_code) DO UPDATE SET
  country_name = EXCLUDED.country_name,
  currency = EXCLUDED.currency,
  logistics_mode = EXCLUDED.logistics_mode,
  commerce_mode = EXCLUDED.commerce_mode,
  updated_at = now();

-- ------------------------------------------------------------------------------
-- 2. Registro de provider skypostal en shipping_providers
-- ------------------------------------------------------------------------------
INSERT INTO public.shipping_providers (
  code,
  name,
  status,
  is_active,
  supports_api,
  supports_labels,
  supports_tracking,
  supports_pickup,
  supports_manual,
  provider_type,
  config_required,
  environment,
  supports_international,
  settings
) VALUES (
  'skypostal',
  'SkyPostal',
  'test_mode',
  false,
  true,
  true,
  true,
  false,
  false,
  'courier',
  true,
  'uat',
  true,
  '{"global_kill_switch": false, "default_environment": "test"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  supports_international = true,
  updated_at = now();

-- ------------------------------------------------------------------------------
-- 3. Tabla: external_product_interest (Métricas de interés sin catálogo masivo)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_product_interest (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    provider text NOT NULL DEFAULT 'amazon',
    external_product_id text NOT NULL,
    wishlist_count integer NOT NULL DEFAULT 0,
    view_count integer NOT NULL DEFAULT 0,
    promoted_to_catalog boolean NOT NULL DEFAULT false,
    promoted_at timestamptz,
    last_seen_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT uq_external_product_interest UNIQUE (provider, external_product_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_prod_interest_lookup 
ON public.external_product_interest (provider, external_product_id);

CREATE INDEX IF NOT EXISTS idx_ext_prod_interest_wishlist_count 
ON public.external_product_interest (wishlist_count DESC)
WHERE promoted_to_catalog = false;

ALTER TABLE public.external_product_interest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read external product interest" ON public.external_product_interest;
CREATE POLICY "Anyone can read external product interest" ON public.external_product_interest
FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Admins manage external product interest" ON public.external_product_interest;
CREATE POLICY "Admins manage external product interest" ON public.external_product_interest
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- ------------------------------------------------------------------------------
-- 4. Tabla: user_external_wishlist (Relación liviana usuario-producto externo)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_external_wishlist (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'amazon',
    external_product_id text NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT uq_user_external_wishlist UNIQUE (user_id, provider, external_product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_ext_wishlist_user 
ON public.user_external_wishlist (user_id);

CREATE INDEX IF NOT EXISTS idx_user_ext_wishlist_product 
ON public.user_external_wishlist (provider, external_product_id);

ALTER TABLE public.user_external_wishlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own external wishlist" ON public.user_external_wishlist;
CREATE POLICY "Users manage own external wishlist" ON public.user_external_wishlist
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all external wishlists" ON public.user_external_wishlist;
CREATE POLICY "Admins view all external wishlists" ON public.user_external_wishlist
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- ------------------------------------------------------------------------------
-- 5. Ampliación de international_sync_settings
-- ------------------------------------------------------------------------------
ALTER TABLE public.international_sync_settings
ADD COLUMN IF NOT EXISTS auto_promote_external_interest boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS wishlist_promotion_threshold integer NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS view_promotion_threshold integer DEFAULT NULL;

-- ------------------------------------------------------------------------------
-- 6. RPC: record_external_product_view con debounce temporal de 10s
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_external_product_view(
    p_provider text,
    p_external_product_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_external_product_id IS NULL OR TRIM(p_external_product_id) = '' THEN
        RETURN;
    END IF;

    INSERT INTO public.external_product_interest (
        provider,
        external_product_id,
        view_count,
        last_seen_at,
        updated_at
    )
    VALUES (
        LOWER(TRIM(p_provider)),
        UPPER(TRIM(p_external_product_id)),
        1,
        now(),
        now()
    )
    ON CONFLICT (provider, external_product_id)
    DO UPDATE SET
        view_count = external_product_interest.view_count + 1,
        last_seen_at = now(),
        updated_at = now()
    WHERE external_product_interest.last_seen_at < now() - INTERVAL '10 seconds';
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. RPC: toggle_external_product_wishlist (Atomic & Idempotent)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_external_product_wishlist(
    p_provider text,
    p_external_product_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_provider text;
    v_ext_id text;
    v_is_added boolean;
    v_new_count integer;
    v_threshold integer := 10;
    v_auto_promote boolean := false;
    v_should_promote boolean := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to modify wishlist';
    END IF;

    v_provider := LOWER(TRIM(COALESCE(p_provider, 'amazon')));
    v_ext_id := UPPER(TRIM(p_external_product_id));

    IF v_ext_id IS NULL OR v_ext_id = '' THEN
        RAISE EXCEPTION 'External product ID is required';
    END IF;

    -- Alternar presencia en user_external_wishlist
    IF EXISTS (
        SELECT 1 FROM public.user_external_wishlist
        WHERE user_id = v_user_id AND provider = v_provider AND external_product_id = v_ext_id
    ) THEN
        DELETE FROM public.user_external_wishlist
        WHERE user_id = v_user_id AND provider = v_provider AND external_product_id = v_ext_id;
        v_is_added := false;
    ELSE
        INSERT INTO public.user_external_wishlist (user_id, provider, external_product_id)
        VALUES (v_user_id, v_provider, v_ext_id)
        ON CONFLICT (user_id, provider, external_product_id) DO NOTHING;
        v_is_added := true;
    END IF;

    -- Conteo exacto single source of truth
    SELECT COUNT(*) INTO v_new_count
    FROM public.user_external_wishlist
    WHERE provider = v_provider AND external_product_id = v_ext_id;

    -- Upsert en external_product_interest
    INSERT INTO public.external_product_interest (
        provider,
        external_product_id,
        wishlist_count,
        last_seen_at,
        updated_at
    )
    VALUES (
        v_provider,
        v_ext_id,
        v_new_count,
        now(),
        now()
    )
    ON CONFLICT (provider, external_product_id)
    DO UPDATE SET
        wishlist_count = v_new_count,
        last_seen_at = now(),
        updated_at = now();

    -- Leer configuración de sincronización
    SELECT 
        COALESCE(auto_promote_external_interest, false),
        COALESCE(wishlist_promotion_threshold, 10)
    INTO v_auto_promote, v_threshold
    FROM public.international_sync_settings
    WHERE id = 1;

    -- Evaluar condición de promoción
    IF v_auto_promote AND v_new_count >= v_threshold THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.international_products
            WHERE external_product_id = v_ext_id
        ) THEN
            v_should_promote := true;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'is_added', v_is_added,
        'wishlist_count', v_new_count,
        'should_promote', v_should_promote,
        'external_product_id', v_ext_id,
        'provider', v_provider
    );
END;
$$;

-- Permisos RPC controlados
REVOKE ALL ON FUNCTION public.record_external_product_view(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_external_product_view(text, text) TO authenticated, anon;

REVOKE ALL ON FUNCTION public.toggle_external_product_wishlist(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_external_product_wishlist(text, text) TO authenticated;

COMMIT;
