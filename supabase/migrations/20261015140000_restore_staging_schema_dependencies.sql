-- Migration: Restore essential shared staging dependencies
-- Restores:
-- 1. profiles schema completeness (first_name, last_name, avatar_url, phone, saved_addresses, is_vendor, etc.)
-- 2. feature_toggles (with defaults and safe public read)
-- 3. store_settings (fallback table with default row)
-- 4. public_site_config (whitelisted site settings)
-- 5. promotions (with promotion_targets, promotion_exclusions, promotion_tiers)
-- 6. RPC public.get_international_public_status()

-- 1. Profiles columns extension
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS saved_addresses jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_vendor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_artist boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_affiliate boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS collector_nickname text,
  ADD COLUMN IF NOT EXISTS collector_avatar_url text,
  ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS preferred_currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure RLS on profiles allows users to read/update their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
CREATE POLICY "Public profiles read" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 2. Feature Toggles
CREATE TABLE IF NOT EXISTS public.feature_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  is_enabled boolean DEFAULT false,
  module text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read toggles" ON public.feature_toggles;
CREATE POLICY "Anyone can read toggles" ON public.feature_toggles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage toggles" ON public.feature_toggles;
CREATE POLICY "Admins manage toggles" ON public.feature_toggles FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

INSERT INTO public.feature_toggles (name, label, description, is_enabled, module) VALUES
  ('marketplace', 'Marketplace de Vendedores', 'Permite que vendedores externos publiquen productos', true, 'marketplace'),
  ('affiliate', 'Sistema de Afiliados', 'Links de referido y comisiones automáticas', true, 'affiliate'),
  ('artist', 'Marketplace de Artistas', 'Comisiones de arte y Print on Demand', true, 'artist'),
  ('star2fan', 'Star2Fan (Video Saludos)', 'Saludos personalizados estilo Cameo', true, 'star2fan'),
  ('loyalty', 'Programa de Lealtad', 'Puntos por compra canjeables por descuentos', false, 'core'),
  ('mercadolibre', 'Sincronización Mercado Libre', 'Publicar y sincronizar stock con MeLi', false, 'marketplace'),
  ('ai_catalog', 'Generador AI de Catálogo', 'Usar IA para generar títulos y descripciones SEO', false, 'core'),
  ('radar', 'Radar & Release Calendar', 'Calendario y feed de lanzamientos', true, 'core'),
  ('vault', 'Collector Vault', 'Bóveda de coleccionistas', true, 'core'),
  ('compare', 'Comparador de Figuras', 'Comparador de coleccionables', true, 'core'),
  ('academy', 'Collector Academy', 'Academia del coleccionista', true, 'core'),
  ('import_hub', 'Collectibles Import Hub', 'Hub de importación y franquicias', true, 'core'),
  ('customs', 'Aduana y Franquicias', 'Simulador de franquicias', true, 'core')
ON CONFLICT (name) DO UPDATE SET is_enabled = EXCLUDED.is_enabled;

-- 3. Store Settings (fallback table)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id text PRIMARY KEY DEFAULT 'default',
  marketplace_enabled boolean DEFAULT true,
  affiliates_enabled boolean DEFAULT true,
  artist_cameo_enabled boolean DEFAULT false,
  ml_sync_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read store_settings" ON public.store_settings;
CREATE POLICY "Public read store_settings" ON public.store_settings FOR SELECT USING (true);

INSERT INTO public.store_settings (id, marketplace_enabled, affiliates_enabled, artist_cameo_enabled, ml_sync_enabled)
VALUES ('default', true, true, false, true)
ON CONFLICT (id) DO NOTHING;

-- 4. Public Site Config
CREATE TABLE IF NOT EXISTS public.public_site_config (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT '',
  value_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.public_site_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_site_config_select_all" ON public.public_site_config;
CREATE POLICY "public_site_config_select_all" ON public.public_site_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "public_site_config_admin_all" ON public.public_site_config;
CREATE POLICY "public_site_config_admin_all" ON public.public_site_config FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

INSERT INTO public.public_site_config (key, value, value_json, updated_at) VALUES
  ('store_name', 'COLLECTIBLES', null, now()),
  ('site_title', 'Collectibles', null, now()),
  ('contact_email', 'contacto@collectibles.uy', null, now()),
  ('maintenance_mode', 'false', null, now())
ON CONFLICT (key) DO NOTHING;

-- 5. Promotions
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discount_type text NOT NULL,
  discount_value numeric(10,2) NOT NULL DEFAULT 0,
  min_quantity integer DEFAULT 1,
  is_stackable boolean DEFAULT false,
  priority integer DEFAULT 0,
  badge_text text,
  badge_color text,
  badge_bg text,
  owner_vendor_id uuid,
  is_active boolean DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read promotions" ON public.promotions;
CREATE POLICY "Public read promotions" ON public.promotions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.promotion_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid REFERENCES public.promotions(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.promotion_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read promotion_targets" ON public.promotion_targets;
CREATE POLICY "Public read promotion_targets" ON public.promotion_targets FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.promotion_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid REFERENCES public.promotions(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.promotion_exclusions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read promotion_exclusions" ON public.promotion_exclusions;
CREATE POLICY "Public read promotion_exclusions" ON public.promotion_exclusions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.promotion_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid REFERENCES public.promotions(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL,
  discount_type text NOT NULL,
  discount_value numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.promotion_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read promotion_tiers" ON public.promotion_tiers;
CREATE POLICY "Public read promotion_tiers" ON public.promotion_tiers FOR SELECT USING (true);

-- 6. International Sync Settings extension & RPC get_international_public_status
ALTER TABLE public.international_sync_settings
  ADD COLUMN IF NOT EXISTS international_public_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS international_purchases_enabled boolean DEFAULT false;

INSERT INTO public.international_sync_settings (id, auto_sync_enabled, international_public_enabled, international_purchases_enabled)
VALUES (1, false, false, false)
ON CONFLICT (id) DO UPDATE SET
  international_public_enabled = COALESCE(public.international_sync_settings.international_public_enabled, false),
  international_purchases_enabled = COALESCE(public.international_sync_settings.international_purchases_enabled, false);

CREATE OR REPLACE FUNCTION public.get_international_public_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'international_public_enabled', COALESCE((SELECT international_public_enabled FROM public.international_sync_settings WHERE id = 1), false),
    'international_purchases_enabled', COALESCE((SELECT international_purchases_enabled FROM public.international_sync_settings WHERE id = 1), false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_international_public_status() TO anon, authenticated, service_role;

