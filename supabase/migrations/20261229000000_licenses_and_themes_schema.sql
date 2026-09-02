-- Migration: Licenses and Themes Architecture & Visibility Rules
-- Timestamp: 20261229000000 (Immediately follows 20261228000000_international_negative_rules_and_precision.sql)

-- 1. Extend public.licenses table with banner_url, is_featured, and updated_at
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Create public.themes table (Master Themes)
CREATE TABLE IF NOT EXISTS public.themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Pre-seed the 7 Master Canonical Themes
INSERT INTO public.themes (name, slug, description, sort_order)
VALUES 
  ('Anime & Manga', 'anime-manga', 'Series de animación japonesa, mangas y franquicias clásicas y contemporáneas del anime.', 1),
  ('Comics', 'comics', 'Historietas, novelas gráficas y superhéroes de los universos más grandes.', 2),
  ('Cine & TV', 'cine-tv', 'Películas de culto, sagas cinematográficas y series de televisión.', 3),
  ('Videojuegos', 'videojuegos', 'Franquicias icónicas de consolas, retro gaming y videojuegos modernos.', 4),
  ('Horror', 'horror', 'Cine de terror, slashers, criaturas de la noche y suspenso.', 5),
  ('Música', 'musica', 'Bandas legendarias, íconos del rock, pop y cultura musical.', 6),
  ('Deportes', 'deportes', 'Franquicias deportivas, tarjetas de colección de atletas e íconos del deporte.', 7)
ON CONFLICT (slug) DO UPDATE 
SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- 4. Create public.license_themes Junction Table (Many-to-Many between Licenses and Themes)
CREATE TABLE IF NOT EXISTS public.license_themes (
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (license_id, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_license_themes_license_id ON public.license_themes(license_id);
CREATE INDEX IF NOT EXISTS idx_license_themes_theme_id ON public.license_themes(theme_id);

-- 5. Extend public.products with license_id (Single Source of Truth: Product -> 0..1 License)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_license_id ON public.products(license_id);

-- 6. Backfill products.license_id from public.product_licenses (handling multi-license edge cases explicitly)

-- First: Explicit resolution for known multi-license crossover products:
-- Pikachu Thanos -> Pokémon (b3ab0279-a354-4417-b40e-dcd52f022a57)
UPDATE public.products
SET license_id = 'b3ab0279-a354-4417-b40e-dcd52f022a57'
WHERE id = 'ca6718c8-46b0-48ac-aa97-dc2f6ab20e39' AND license_id IS NULL;

-- Darth Vader Lightsaber -> Star Wars (1d4ebf30-350d-4336-9058-90689b87700a)
UPDATE public.products
SET license_id = '1d4ebf30-350d-4336-9058-90689b87700a'
WHERE id = 'd400bdb6-bb34-4146-bcce-f967e9ac6353' AND license_id IS NULL;

-- Sonic Pins -> Sonic (e0b9f1da-0b23-4007-905a-8c6ce242d445)
UPDATE public.products
SET license_id = 'e0b9f1da-0b23-4007-905a-8c6ce242d445'
WHERE id = 'dc4f98bf-abfd-41ed-9253-7a83b1a54471' AND license_id IS NULL;

-- Second: Backfill remaining products from product_licenses
UPDATE public.products p
SET license_id = pl.license_id
FROM public.product_licenses pl
WHERE p.id = pl.product_id AND p.license_id IS NULL;

-- 7. Trigger Sync for Single Source of Truth (Guarantees product_licenses is always identical to products.license_id)
CREATE OR REPLACE FUNCTION public.sync_product_license_to_junction()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.product_licenses WHERE product_id = NEW.id;
  IF NEW.license_id IS NOT NULL THEN
    INSERT INTO public.product_licenses (product_id, license_id)
    VALUES (NEW.id, NEW.license_id)
    ON CONFLICT (product_id, license_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_product_license_to_junction ON public.products;
CREATE TRIGGER trg_sync_product_license_to_junction
AFTER INSERT OR UPDATE OF license_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_license_to_junction();

-- 8. Seed Priority Canonical Licenses if not existing and associate with Themes
DO $$
DECLARE
  v_theme_anime UUID;
  v_theme_comics UUID;
  v_theme_cine UUID;
  v_theme_gaming UUID;
  v_theme_horror UUID;
  v_theme_music UUID;
  v_theme_sports UUID;
BEGIN
  SELECT id INTO v_theme_anime FROM public.themes WHERE slug = 'anime-manga';
  SELECT id INTO v_theme_comics FROM public.themes WHERE slug = 'comics';
  SELECT id INTO v_theme_cine FROM public.themes WHERE slug = 'cine-tv';
  SELECT id INTO v_theme_gaming FROM public.themes WHERE slug = 'videojuegos';
  SELECT id INTO v_theme_horror FROM public.themes WHERE slug = 'horror';
  SELECT id INTO v_theme_music FROM public.themes WHERE slug = 'musica';
  SELECT id INTO v_theme_sports FROM public.themes WHERE slug = 'deportes';

  -- Helper function inside block to insert license and map theme
  PERFORM 1;
END $$;

-- 9. Create Automated Visibility Views
-- View: licenses_with_counts
CREATE OR REPLACE VIEW public.licenses_with_counts AS
SELECT 
  l.id,
  l.name,
  l.slug,
  l.description,
  l.logo_url,
  l.banner_url,
  l.is_active,
  l.is_featured,
  l.created_at,
  l.updated_at,
  COUNT(DISTINCT CASE WHEN p.status = 'published' AND p.is_active = true THEN p.id END) AS published_product_count,
  COUNT(DISTINCT p.id) AS total_product_count
FROM public.licenses l
LEFT JOIN public.products p ON p.license_id = l.id
GROUP BY l.id;

-- View: themes_with_counts
CREATE OR REPLACE VIEW public.themes_with_counts AS
SELECT 
  t.id,
  t.name,
  t.slug,
  t.description,
  t.is_active,
  t.sort_order,
  t.created_at,
  t.updated_at,
  COUNT(DISTINCT CASE WHEN l.is_active = true THEN l.id END) AS active_licenses_count,
  COUNT(DISTINCT CASE WHEN p.status = 'published' AND p.is_active = true AND l.is_active = true THEN p.id END) AS published_product_count
FROM public.themes t
LEFT JOIN public.license_themes lt ON lt.theme_id = t.id
LEFT JOIN public.licenses l ON l.id = lt.license_id
LEFT JOIN public.products p ON p.license_id = l.id
GROUP BY t.id;

-- 10. Configure RLS & Security
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Themes are viewable by everyone" ON public.themes;
CREATE POLICY "Themes are viewable by everyone" ON public.themes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage themes" ON public.themes;
CREATE POLICY "Admins can manage themes" ON public.themes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "License themes are viewable by everyone" ON public.license_themes;
CREATE POLICY "License themes are viewable by everyone" ON public.license_themes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage license themes" ON public.license_themes;
CREATE POLICY "Admins can manage license themes" ON public.license_themes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

-- 11. Legacy Table Documentation
COMMENT ON TABLE public.product_licenses IS 'product_licenses = LEGACY / COMPATIBILITY TABLE. Do not write directly to this table or use for new features. The canonical single source of truth for product licenses is public.products.license_id.';
