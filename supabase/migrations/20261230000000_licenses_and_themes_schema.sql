-- Migration: 20261230000000_licenses_and_themes_schema.sql
-- Description: Implement Licenses & Themes schema, seed initial themes & priority licenses, set up many-to-many license_themes, add products.license_id, and create aggregated views with RLS.

-- 1. Extend public.licenses table with missing fields
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Create public.themes table
CREATE TABLE IF NOT EXISTS public.themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create public.license_themes join table (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.license_themes (
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (license_id, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_license_themes_license_id ON public.license_themes(license_id);
CREATE INDEX IF NOT EXISTS idx_license_themes_theme_id ON public.license_themes(theme_id);

-- 4. Extend public.products with license_id reference
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_license_id ON public.products(license_id);

-- Backfill products.license_id from public.product_licenses if exists
UPDATE public.products p
SET license_id = pl.license_id
FROM public.product_licenses pl
WHERE p.id = pl.product_id AND p.license_id IS NULL;

-- 5. Seed Initial Exact 7 Themes
INSERT INTO public.themes (name, slug, description, is_active, sort_order)
VALUES
  ('Anime & Manga', 'anime-manga', 'Franquicias de anime, manga y animación japonesa', true, 1),
  ('Comics', 'comics', 'Historietas, novelas gráficas y universos de cómics', true, 2),
  ('Cine & TV', 'cine-tv', 'Películas, series, televisión y cultura pop audiovisual', true, 3),
  ('Videojuegos', 'videojuegos', 'Gaming, consolas, personajes y sagas de videojuegos', true, 4),
  ('Horror', 'horror', 'Cine de terror, slashers, monstruos y misterio', true, 5),
  ('Música', 'musica', 'Bandas, solistas, leyendas de la música y conciertos', true, 6),
  ('Deportes', 'deportes', 'Deportes de competición, ligas, atletas y motorsport', true, 7)
ON CONFLICT (slug) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = true, sort_order = EXCLUDED.sort_order;

-- 6. Seed Priority Licenses
INSERT INTO public.licenses (name, slug, description, is_active, sort_order)
VALUES
  ('Marvel', 'marvel', 'Universo Marvel Comics y Marvel Studios', true, 1),
  ('DC Comics', 'dc-comics', 'Universo DC Comics, Batman, Superman y Liga de la Justicia', true, 2),
  ('Star Wars', 'star-wars', 'Universo Star Wars Lucasfilm', true, 3),
  ('Dragon Ball', 'dragon-ball', 'Dragon Ball Akira Toriyama / Toei Animation', true, 4),
  ('One Piece', 'one-piece', 'One Piece Eiichiro Oda / Toei Animation', true, 5),
  ('Naruto', 'naruto', 'Naruto Masashi Kishimoto / Studio Pierrot', true, 6),
  ('Demon Slayer', 'demon-slayer', 'Demon Slayer: Kimetsu no Yaiba / Ufotable', true, 7),
  ('Jujutsu Kaisen', 'jujutsu-kaisen', 'Jujutsu Kaisen / MAPPA', true, 8),
  ('Bleach', 'bleach', 'Bleach Tite Kubo / Studio Pierrot', true, 9),
  ('My Hero Academia', 'my-hero-academia', 'My Hero Academia Kohei Horikoshi / Bones', true, 10),
  ('Attack on Titan', 'attack-on-titan', 'Shingeki no Kyojin Hajime Isayama', true, 11),
  ('Pokémon', 'pokemon', 'Franquicia Pokémon Nintendo / Game Freak', true, 12),
  ('Super Mario', 'super-mario', 'Super Mario Bros Nintendo', true, 13),
  ('Sonic the Hedgehog', 'sonic-the-hedgehog', 'Sonic SEGA', true, 14),
  ('Street Fighter', 'street-fighter', 'Street Fighter Capcom', true, 15),
  ('Mortal Kombat', 'mortal-kombat', 'Mortal Kombat NetherRealm / Warner Bros', true, 16),
  ('Resident Evil', 'resident-evil', 'Resident Evil Capcom', true, 17),
  ('Fallout', 'fallout', 'Fallout Bethesda Game Studios', true, 18),
  ('Halo', 'halo', 'Halo Bungie / 343 Industries / Xbox', true, 19),
  ('God of War', 'god-of-war', 'God of War Santa Monica Studio / PlayStation', true, 20),
  ('Harry Potter', 'harry-potter', 'Mundo Mágico de Harry Potter Warner Bros', true, 21),
  ('The Lord of the Rings', 'the-lord-of-the-rings', 'El Señor de los Anillos J.R.R. Tolkien', true, 22),
  ('Jurassic Park', 'jurassic-park', 'Parque Jurásico Universal Pictures', true, 23),
  ('Jurassic World', 'jurassic-world', 'Mundo Jurásico Universal Pictures', true, 24),
  ('Ghostbusters', 'ghostbusters', 'Los Cazafantasmas Columbia Pictures', true, 25),
  ('Transformers', 'transformers', 'Transformers Hasbro / Takara Tomy', true, 26),
  ('G.I. Joe', 'gi-joe', 'G.I. Joe Hasbro', true, 27),
  ('Teenage Mutant Ninja Turtles', 'teenage-mutant-ninja-turtles', 'Tortugas Ninja Mirage Studios / Nickelodeon', true, 28),
  ('Masters of the Universe', 'masters-of-the-universe', 'He-Man y los Amos del Universo Mattel', true, 29),
  ('Power Rangers', 'power-rangers', 'Power Rangers Hasbro / Saban', true, 30),
  ('The Simpsons', 'the-simpsons', 'Los Simpson Matt Groening / 20th Century', true, 31),
  ('Godzilla', 'godzilla', 'Godzilla Toho / Legendary Pictures', true, 32),
  ('Alien', 'alien', 'Alien 20th Century Studios / Ridley Scott', true, 33),
  ('Predator', 'predator', 'Depredador 20th Century Studios', true, 34),
  ('A Nightmare on Elm Street', 'a-nightmare-on-elm-street', 'Pesadilla en la Calle Elm / Freddy Krueger', true, 35),
  ('Friday the 13th', 'friday-the-13th', 'Viernes 13 / Jason Voorhees', true, 36),
  ('Halloween', 'halloween', 'Halloween / Michael Myers John Carpenter', true, 37),
  ('Child''s Play', 'childs-play', 'Chucky / El Muñeco Diabólico', true, 38),
  ('Scream', 'scream', 'Scream Ghostface Dimension Films', true, 39),
  ('IT', 'it', 'Eso Stephen King / Pennywise', true, 40),
  ('Universal Monsters', 'universal-monsters', 'Monstruos Clásicos de Universal Pictures', true, 41),
  ('The Walking Dead', 'the-walking-[#321]', 'The Walking Dead Robert Kirkman / AMC', true, 42),
  ('Spawn', 'spawn', 'Spawn Todd McFarlane / Image Comics', true, 43),
  ('Barbie', 'barbie', 'Barbie Mattel', true, 44),
  ('Monster High', 'monster-high', 'Monster High Mattel', true, 45),
  ('WWE', 'wwe', 'World Wrestling Entertainment', true, 46),
  ('Formula 1', 'formula-1', 'FIA Formula One World Championship', true, 47)
ON CONFLICT (slug) DO NOTHING;

-- Fix slug for Walking Dead if needed
UPDATE public.licenses SET slug = 'the-walking-dead' WHERE name = 'The Walking Dead';

-- 7. Seed Initial License ↔ Theme Mappings
-- Helper function to map license to theme by name/slug safely
DO $$
DECLARE
  theme_anime UUID;
  theme_comics UUID;
  theme_cine UUID;
  theme_games UUID;
  theme_horror UUID;
  theme_music UUID;
  theme_sports UUID;
BEGIN
  SELECT id INTO theme_anime FROM public.themes WHERE slug = 'anime-manga';
  SELECT id INTO theme_comics FROM public.themes WHERE slug = 'comics';
  SELECT id INTO theme_cine FROM public.themes WHERE slug = 'cine-tv';
  SELECT id INTO theme_games FROM public.themes WHERE slug = 'videojuegos';
  SELECT id INTO theme_horror FROM public.themes WHERE slug = 'horror';
  SELECT id INTO theme_music FROM public.themes WHERE slug = 'musica';
  SELECT id INTO theme_sports FROM public.themes WHERE slug = 'deportes';

  -- Anime & Manga
  INSERT INTO public.license_themes (license_id, theme_id)
  SELECT l.id, theme_anime FROM public.licenses l
  WHERE l.slug IN ('dragon-ball', 'one-piece', 'naruto', 'demon-slayer', 'jujutsu-kaisen', 'bleach', 'my-hero-academia', 'attack-on-titan', 'pokemon')
  ON CONFLICT DO NOTHING;

  -- Comics & Cine/TV
  INSERT INTO public.license_themes (license_id, theme_id)
  SELECT l.id, theme_comics FROM public.licenses l
  WHERE l.slug IN ('marvel', 'dc-comics', 'dc', 'spawn', 'the-walking-dead', 'gi-joe', 'transformers', 'teenage-mutant-ninja-turtles', 'masters-of-the-universe')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.license_themes (license_id, theme_id)
  SELECT l.id, theme_cine FROM public.licenses l
  WHERE l.slug IN (
    'marvel', 'dc-comics', 'dc', 'star-wars', 'the-simpsons', 'harry-potter', 'the-lord-of-the-rings', 
    'godzilla', 'power-rangers', 'gi-joe', 'transformers', 'teenage-mutant-ninja-turtles', 
    'masters-of-the-universe', 'alien', 'predator', 'jurassic-park', 'jurassic-world', 'ghostbusters',
    'spawn', 'the-walking-dead', 'a-nightmare-on-elm-street', 'friday-the-13th', 'halloween',
    'childs-play', 'scream', 'it', 'universal-monsters', 'barbie', 'monster-high'
  )
  ON CONFLICT DO NOTHING;

  -- Horror
  INSERT INTO public.license_themes (license_id, theme_id)
  SELECT l.id, theme_horror FROM public.licenses l
  WHERE l.slug IN (
    'alien', 'predator', 'resident-evil', 'a-nightmare-on-elm-street', 'friday-the-13th',
    'halloween', 'childs-play', 'scream', 'it', 'universal-monsters', 'the-walking-dead'
  )
  ON CONFLICT DO NOTHING;

  -- Videojuegos
  INSERT INTO public.license_themes (license_id, theme_id)
  SELECT l.id, theme_games FROM public.licenses l
  WHERE l.slug IN ('resident-evil', 'mortal-kombat', 'street-fighter', 'super-mario', 'sonic-the-hedgehog', 'fallout', 'halo', 'god-of-war', 'pokemon')
  ON CONFLICT DO NOTHING;

  -- Deportes
  INSERT INTO public.license_themes (license_id, theme_id)
  SELECT l.id, theme_sports FROM public.licenses l
  WHERE l.slug IN ('wwe', 'formula-1')
  ON CONFLICT DO NOTHING;
END $$;

-- 8. Create Views for Fast Count Aggregation & Public Storefront Filtering
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
  l.sort_order,
  l.created_at,
  l.updated_at,
  (
    SELECT COUNT(DISTINCT p.id)
    FROM public.products p
    LEFT JOIN public.product_licenses pl ON pl.product_id = p.id
    WHERE (p.license_id = l.id OR pl.license_id = l.id)
  )::integer AS total_product_count,
  (
    SELECT COUNT(DISTINCT p.id)
    FROM public.products p
    LEFT JOIN public.product_licenses pl ON pl.product_id = p.id
    WHERE (p.license_id = l.id OR pl.license_id = l.id)
      AND p.status = 'published'
      AND p.is_active = true
  )::integer AS published_product_count
FROM public.licenses l;

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
  (
    SELECT COUNT(DISTINCT lt.license_id)
    FROM public.license_themes lt
    JOIN public.licenses l ON l.id = lt.license_id
    WHERE lt.theme_id = t.id AND l.is_active = true
  )::integer AS active_licenses_count,
  (
    SELECT COUNT(DISTINCT p.id)
    FROM public.products p
    LEFT JOIN public.product_licenses pl ON pl.product_id = p.id
    JOIN public.licenses l ON (l.id = p.license_id OR l.id = pl.license_id)
    JOIN public.license_themes lt ON lt.license_id = l.id
    WHERE lt.theme_id = t.id
      AND l.is_active = true
      AND p.status = 'published'
      AND p.is_active = true
  )::integer AS published_product_count
FROM public.themes t;

-- 9. Enable RLS and Configure Security Policies

-- Themes RLS
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Themes viewable by everyone" ON public.themes;
CREATE POLICY "Themes viewable by everyone" ON public.themes
  FOR SELECT USING (is_active = true OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)));

DROP POLICY IF EXISTS "Admins can manage themes" ON public.themes;
CREATE POLICY "Admins can manage themes" ON public.themes
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- License Themes RLS
ALTER TABLE public.license_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "License themes viewable by everyone" ON public.license_themes;
CREATE POLICY "License themes viewable by everyone" ON public.license_themes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage license themes" ON public.license_themes;
CREATE POLICY "Admins can manage license themes" ON public.license_themes
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
